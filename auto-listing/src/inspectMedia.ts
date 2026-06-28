// ============================================================
// 探測 WordPress 媒體與 JoomUnited 資料夾機制
// auto-listing/src/inspectMedia.ts
// ============================================================
// 目的：用應用程式密碼確認認證可用，並找出「媒體資料夾」用哪個
// taxonomy / REST 路由，才知道能不能用 API 把圖片歸檔。
// 執行：npx tsx --env-file=.env auto-listing/src/inspectMedia.ts

import { loadConfig } from './config';
import { WpClient } from './wpMedia';

async function main() {
  const cfg = loadConfig();
  if (!cfg.wp) {
    console.error(
      '❌ 未設定 WP_USER / WP_APP_PASSWORD，請先在 .env 補上應用程式密碼。',
    );
    process.exit(1);
  }

  const wp = new WpClient(cfg.woo.storeUrl, cfg.wp);

  // 1. 認證檢查
  console.log('🔐 認證檢查 …');
  try {
    const me = await wp.whoAmI();
    console.log(`   ✅ 認證成功：#${me.id} ${me.name}（${me.slug}）`);
  } catch (err: any) {
    console.error(
      '   ❌ 認證失敗：',
      err.response?.status,
      err.response?.data?.message || err.message,
    );
    console.error('   請確認 WP_USER（登入帳號）與 WP_APP_PASSWORD 是否正確。');
    process.exit(1);
  }

  // 2. 列出 REST 命名空間 + 與資料夾/媒體相關的路由
  console.log('\n🧭 掃描 REST 路由（找媒體資料夾機制）…');
  const { data: root } = await wp.raw.get('/');
  const namespaces: string[] = root.namespaces || [];
  console.log(`   命名空間：${namespaces.join(', ')}`);
  const routeKeys = Object.keys(root.routes || {});
  const interesting = routeKeys.filter((k) =>
    /(wpmf|folder|media-?cat|attachment.?cat|media-folder)/i.test(k),
  );
  console.log(
    interesting.length
      ? `   🔎 可能相關路由：\n     ${interesting.join('\n     ')}`
      : '   （沒找到含 wpmf/folder 字樣的路由）',
  );

  // 3. 嘗試常見 JoomUnited 資料夾 taxonomy 的 REST base，列出資料夾
  console.log('\n📁 嘗試讀取資料夾清單 …');
  const candidates = [
    '/wp/v2/wpmf-category',
    '/wp/v2/media-folder',
    '/wp/v2/wpmf_category',
    '/wp/v2/attachment_category',
  ];
  for (const path of candidates) {
    try {
      const { data } = await wp.raw.get(path, { params: { per_page: 100 } });
      if (Array.isArray(data)) {
        console.log(`   ✅ ${path} → ${data.length} 筆`);
        for (const t of data.slice(0, 30)) {
          console.log(`      #${t.id} ${t.name}（parent=${t.parent ?? '?'}）`);
        }
      }
    } catch (err: any) {
      console.log(`   ✗ ${path} → ${err.response?.status || err.message}`);
    }
  }

  // 4. 看一筆媒體的欄位，找出它帶哪個 taxonomy 欄位
  console.log('\n🖼️  取一筆媒體看欄位 …');
  try {
    const { data } = await wp.raw.get('/wp/v2/media', {
      params: { per_page: 1, context: 'edit' },
    });
    if (Array.isArray(data) && data[0]) {
      const m = data[0];
      const keys = Object.keys(m);
      console.log(`   媒體 #${m.id} 欄位：${keys.join(', ')}`);
      const taxoLike = keys.filter((k) =>
        /(wpmf|folder|categor|class_list)/i.test(k),
      );
      console.log(
        taxoLike.length
          ? `   🔎 疑似資料夾欄位：${taxoLike.map((k) => `${k}=${JSON.stringify(m[k])}`).join(' ; ')}`
          : '   （媒體物件沒有明顯的資料夾欄位）',
      );
    }
  } catch (err: any) {
    console.log(`   ✗ 讀媒體失敗：${err.response?.status || err.message}`);
  }

  console.log('\n— 探測結束，把以上整段貼回來，我據此寫正式的上傳+歸檔 —');
}

main().catch((err) => {
  console.error('💥 錯誤：', err.response?.data || err.message || err);
  process.exit(1);
});
