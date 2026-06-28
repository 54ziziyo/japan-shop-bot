// ============================================================
// 連線測試 — 確認 WooCommerce 金鑰可用
// auto-listing/src/testConnection.ts
// ============================================================
// 執行：npx tsx --env-file=.env auto-listing/src/testConnection.ts

import { loadConfig } from './config';
import { WooClient } from './woocommerce';

async function main() {
  const cfg = loadConfig();
  console.log(`🔌 測試連線：${cfg.woo.storeUrl}`);

  const woo = new WooClient(cfg.woo);
  await woo.ping();
  console.log('✅ WooCommerce 金鑰正常，可以讀寫商品。');

  console.log(
    cfg.wp
      ? '✅ 已設定 WordPress 應用程式密碼（圖片上傳/歸檔可用）。'
      : 'ℹ️  未設定 WP_USER / WP_APP_PASSWORD（圖片進階歸檔停用）。',
  );
}

main().catch((err) => {
  console.error('\n💥 連線失敗：', err.response?.data || err.message || err);
  console.error(
    '   請確認 .env 的 WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET 是否正確。',
  );
  process.exit(1);
});
