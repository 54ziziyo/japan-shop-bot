// ============================================================
// 步驟①：爬取 HYOD 商品 → 存成草稿 JSON
// auto-listing/src/scrape-hyod.ts
// ============================================================
// 執行：npx tsx --env-file=.env auto-listing/src/scrape-hyod.ts <HYOD 商品網址>
// 例：npx tsx --env-file=.env auto-listing/src/scrape-hyod.ts \
//       "https://shop.hyod-products.com/Form/Product/ProductDetail.aspx?shop=0&pid=HYF101N"
// 產出：auto-listing/drafts/<PID>.json（content 欄位留空，待 Claude 填）

import { loadConfig } from './config';
import { parseSeason } from './season';
import { categoryOptionNames } from './categories';
import { WooClient } from './woocommerce';
import { emptyContent } from './draft';
import { saveDraftH, type HyodDraft } from './draft-hyod';
import { scrapeHyod } from '../../server/utils/scrape/hyod';

const BRAND = 'HYOD';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error(
      '用法：npx tsx --env-file=.env auto-listing/src/scrape-hyod.ts <HYOD 商品網址>',
    );
    process.exit(1);
  }

  const cfg = loadConfig();
  const woo = new WooClient(cfg.woo);

  console.log(`\n🔎 爬取中：${url}`);
  const scraped = await scrapeHyod(url);
  if (!scraped) {
    console.error('❌ 爬取失敗，請確認網址是否為 HYOD 商品頁。');
    process.exit(1);
  }
  console.log(
    `   標題：${scraped.title}\n   PID：${scraped.pid}｜日幣：${scraped.price}｜顏色數：${scraped.variants.length}`,
  );

  // SKU 去重
  const existing = await woo.findProductBySku(scraped.pid);
  if (existing) {
    console.log(
      `\n⏭️  已存在相同 SKU（${scraped.pid}）的商品，不需重複上架：` +
        `\n   #${existing.id} ${existing.name}\n   ${existing.editLink}`,
    );
    return;
  }

  // 季節（從圖片路徑判斷）
  const season = parseSeason(scraped.variants.map((v) => v.image).filter(Boolean));
  console.log(
    `🗓️  季節：${season ? `${season.year} ${season.labelZh}（資料夾：${season.folder}）` : '無法解析，請手動填'}`,
  );

  // 分類清單
  const cats = await woo.getCategories();
  const categoryOptions = categoryOptionNames(cats);

  const draft: HyodDraft = {
    sourceUrl: url,
    brand: BRAND,
    scraped,
    season,
    categoryOptions,
    content: emptyContent(),
  };
  const p = saveDraftH(draft);
  console.log(`\n📝 草稿已存：${p}`);
  console.log('   下一步：由 Claude 填好 content 文案，再跑 create-hyod。');
  console.log(`\n   商品說明（供參考）：\n${scraped.description.slice(0, 400)}...`);
}

main().catch((err) => {
  console.error('\n💥 發生錯誤：', err.response?.data || err.message || err);
  process.exit(1);
});
