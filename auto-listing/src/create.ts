// ============================================================
// 步驟③：讀草稿 JSON（文案已填）→ 建 WooCommerce 送審商品
// auto-listing/src/create.ts
// ============================================================
// 執行：npx tsx --env-file=.env auto-listing/src/create.ts <草稿 JSON 路徑>
// 例：  npx tsx --env-file=.env auto-listing/src/create.ts auto-listing/drafts/RST469.json

import { loadConfig } from './config';
import { buildWooProduct } from './buildProduct';
import { resolveCategoryIds } from './categories';
import { WooClient } from './woocommerce';
import { WpClient } from './wpMedia';
import { loadDraft } from './draft';
import { jpyToTwd, parseJpy } from '../../shared/pricing';

// 國際小包費率表（RS TAICHI 強制使用）
const INTL_RATES: [number, number][] = [
  [1000,2050],[2000,2750],[3000,3450],[4000,4150],[5000,4850],
  [6000,5550],[7000,6250],[8000,6950],[9000,7650],[10000,8350],
];
const BASE_RATE = 0.205;

function calcShippingTwd(weightGrams: number): number {
  const safeWeight = Math.ceil(weightGrams * 1.08);
  for (const [maxW, costJpy] of INTL_RATES) {
    if (safeWeight <= maxW) return Math.round(costJpy * BASE_RATE);
  }
  return Math.round(INTL_RATES[INTL_RATES.length - 1]![1] * BASE_RATE);
}

function calcRegularPrice(jpyStr: string, weightGrams: number): number {
  const productTwd = jpyToTwd(parseJpy(jpyStr));
  const shippingTwd = calcShippingTwd(weightGrams);
  return productTwd + shippingTwd;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error(
      '用法：npx tsx --env-file=.env auto-listing/src/create.ts <草稿 JSON 路徑>',
    );
    process.exit(1);
  }

  const cfg = loadConfig();
  if (!cfg.wp) {
    console.error('❌ 需要 WP_USER / WP_APP_PASSWORD（圖片去重上傳用）');
    process.exit(1);
  }
  const woo = new WooClient(cfg.woo);
  const wp = new WpClient(cfg.woo.storeUrl, cfg.wp);
  const draft = loadDraft(file);
  const { scraped, content } = draft;

  // 文案完整性檢查
  const need: (keyof typeof content)[] = ['name', 'category', 'descriptionHtml'];
  const blank = need.filter((k) => !String(content[k]).trim());
  if (blank.length) {
    console.error(`❌ 草稿文案未填完整：缺 ${blank.join(', ')}。請先補齊再 create。`);
    process.exit(1);
  }

  // SKU 去重
  const existing = await woo.findProductBySku(scraped.sku);
  if (existing) {
    console.log(
      `⏭️  已存在相同 SKU（${scraped.sku}），略過：#${existing.id} ${existing.name}\n   ${existing.editLink}`,
    );
    return;
  }

  // ── 圖片：去重 + 上傳（每個顏色一張） ──
  console.log('\n🖼️  處理商品圖片（去重後上傳）…');
  const colorImageIds: Record<string, number> = {};
  let mainImageUrl = '';
  let mainImageId = 0;
  for (const variant of scraped.variants) {
    if (!variant.image) continue;
    const altText = `${content.imageAlt} ${variant.color}`.trim();
    try {
      const { id, url } = await wp.ensureImage(variant.image, altText);
      colorImageIds[variant.color] = id;
      if (!mainImageUrl) { mainImageUrl = url; mainImageId = id; }
    } catch (err: any) {
      console.warn(`   ⚠️ 圖片處理失敗（${variant.color}）：${err.message}`);
    }
  }
  console.log(`   共 ${Object.keys(colorImageIds).length} 張圖片就位`);

  // 分類名稱 → id（含上層）
  const cats = await woo.getCategories();
  const categoryIds = resolveCategoryIds(cats, content.category);
  if (categoryIds.length === 0) {
    console.warn(`⚠️ 找不到分類「${content.category}」，將不設分類（上架後手動指定）。`);
  }

  // 定價計算（商品台幣 + 國際運費）
  const regularPriceTwd = calcRegularPrice(scraped.price, scraped.weightGrams);
  console.log(`\n💰 定價：${scraped.price} + 運費 → NT$${regularPriceTwd}`);

  // 組裝 + 建立
  const built = buildWooProduct({
    scraped,
    content,
    categoryIds,
    season: draft.season,
    sourceUrl: draft.sourceUrl,
    brand: draft.brand,
    colorImageIds,
    mainImageUrl,
    mainImageId,
    regularPriceTwd,
  });
  console.log(`🧱 組裝：${built.product.images.length} 張圖、${built.variations.length} 個變體、售價 NT$${regularPriceTwd}`);

  const created = await woo.createProduct(built);
  console.log(`\n✅ 完成！商品已建立（狀態：草稿）：`);
  console.log(`   後台編輯：${created.editLink}`);
  console.log(`\n   接下來請手動：`);
  console.log(`   1. 開後台連結確認排版、價格、變體`);
  console.log(`   2. 媒體庫將 ${Object.keys(colorImageIds).length} 張圖移入 手套 > RS TAICHI > 春夏款`);
  console.log(`   3. 確認 OK 後點「發布」上線`);
}

main().catch((err) => {
  console.error('\n💥 發生錯誤：', err.response?.data || err.message || err);
  process.exit(1);
});
