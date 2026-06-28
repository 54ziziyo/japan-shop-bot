// ============================================================
// 步驟①：爬取 RS Taichi 商品 → 存成草稿 JSON（不需付費 API）
// auto-listing/src/scrape.ts
// ============================================================
// 執行：npx tsx --env-file=.env auto-listing/src/scrape.ts <RS Taichi 網址>
// 產出：auto-listing/drafts/<SKU>.json（content 欄位留空，待 Claude 填）

import { loadConfig } from './config';
import { parseSeason } from './season';
import { categoryOptionNames } from './categories';
import { WooClient } from './woocommerce';
import { saveDraft, emptyContent, type Draft } from './draft';
import { scrapeRstaichi } from '../../server/utils/scrape/rstaichi';

const BRAND = 'RS TAICHI';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error(
      '用法：npx tsx --env-file=.env auto-listing/src/scrape.ts <RS Taichi 網址>',
    );
    process.exit(1);
  }

  const cfg = loadConfig();
  const woo = new WooClient(cfg.woo);

  // 爬取
  console.log(`\n🔎 爬取中：${url}`);
  const scraped = await scrapeRstaichi(url);
  if (!scraped) {
    console.error('❌ 爬取失敗，請確認網址是否為 RS Taichi 商品頁。');
    process.exit(1);
  }
  console.log(
    `   標題：${scraped.title}\n   SKU：${scraped.sku}｜日幣：${scraped.price}｜顏色數：${scraped.variants.length}`,
  );

  // 去重（先擋掉已上架的，省得白填文案）
  const existing = await woo.findProductBySku(scraped.sku);
  if (existing) {
    console.log(
      `\n⏭️  已存在相同 SKU（${scraped.sku}）的商品，不需重複上架：` +
        `\n   #${existing.id} ${existing.name}\n   ${existing.editLink}`,
    );
    return;
  }

  // 季節
  const season = parseSeason(scraped.variants.map((v) => v.image).filter(Boolean));
  console.log(
    `🗓️  季節：${season ? `${season.year} ${season.labelZh}（資料夾：${season.folder}）` : '無法解析'}`,
  );

  // 分類清單（給 Claude 選）
  const cats = await woo.getCategories();
  const categoryOptions = categoryOptionNames(cats);
  console.log(`🗂️  取得 ${cats.length} 個分類`);

  const draft: Draft = {
    sourceUrl: url,
    brand: BRAND,
    scraped,
    season,
    categoryOptions,
    content: emptyContent(),
  };
  const p = saveDraft(draft);
  console.log(`\n📝 草稿已存：${p}`);
  console.log('   下一步：由 Claude 填好 content 文案，再跑 create。');
}

main().catch((err) => {
  console.error('\n💥 發生錯誤：', err.response?.data || err.message || err);
  process.exit(1);
});
