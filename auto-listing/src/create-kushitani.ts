// ============================================================
// Kushitani 專用：讀草稿 JSON → 建 WooCommerce 送審商品
// npx tsx --env-file=.env auto-listing/src/create-kushitani.ts <草稿 JSON 路徑>
// 例：npx tsx --env-file=.env auto-listing/src/create-kushitani.ts auto-listing/drafts/K-5020.json
// ============================================================
import { loadConfig } from './config';
import { buildWooProduct } from './buildProduct';
import { resolveCategoryIds } from './categories';
import { WooClient } from './woocommerce';
import { WpClient } from './wpMedia';
import { loadDraftK } from './draft-kushitani';
import { getKushitaniCustomPrice } from '../../server/utils/kushitaniPricing';
import { jpyToTwd, parseJpy } from '../../shared/pricing';

// 國際小包費率表（與 create.ts 相同）
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

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：npx tsx --env-file=.env auto-listing/src/create-kushitani.ts <草稿 JSON 路徑>');
    process.exit(1);
  }

  const cfg = loadConfig();
  if (!cfg.wp) {
    console.error('❌ 需要 WP_USER / WP_APP_PASSWORD（圖片去重上傳用）');
    process.exit(1);
  }
  const woo = new WooClient(cfg.woo);
  const wp = new WpClient(cfg.woo.storeUrl, cfg.wp);
  const draft = loadDraftK(file);
  const { scraped, content } = draft;

  // 文案完整性檢查
  const need = ['name', 'category', 'descriptionHtml'] as const;
  const blank = need.filter((k) => !String(content[k]).trim());
  if (blank.length) {
    console.error(`❌ 草稿文案未填完整：缺 ${blank.join(', ')}。請先補齊再 create。`);
    process.exit(1);
  }

  // 以 modelNumber 當 SKU
  const sku = scraped.modelNumber || scraped.pid;

  // SKU 去重
  const existing = await woo.findProductBySku(sku);
  if (existing) {
    console.log(`⏭️  已存在相同 SKU（${sku}），略過：#${existing.id} ${existing.name}`);
    return;
  }

  // ── 定價 ──
  const customPrice = getKushitaniCustomPrice(scraped.modelNumber);
  let regularPriceTwd: number;
  if (customPrice) {
    const shippingTwd = customPrice.skipShipping ? 0 : calcShippingTwd(scraped.weightGrams);
    regularPriceTwd = customPrice.priceTwd + shippingTwd;
    console.log(`\n💰 自訂售價：NT$${customPrice.priceTwd}${customPrice.skipShipping ? '（含運）' : ` + 運費 NT$${shippingTwd}`} = NT$${regularPriceTwd}`);
  } else {
    const productTwd = jpyToTwd(parseJpy(scraped.price));
    const shippingTwd = calcShippingTwd(scraped.weightGrams);
    regularPriceTwd = productTwd + shippingTwd;
    console.log(`\n💰 公式定價：${scraped.price} → NT$${productTwd} + 運費 NT$${shippingTwd} = NT$${regularPriceTwd}`);
  }

  // ── 圖片上傳 ──
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

  // ── 分類（支援 "KUSHITANI/春夏款" 路徑格式）──
  const cats = await woo.getCategories();
  const categoryIds = resolveCategoryIds(cats, content.category);
  if (categoryIds.length === 0) {
    console.warn(`⚠️ 找不到分類「${content.category}」，將不設分類（上架後手動指定）。`);
  }

  // ── 把 KushitaniProduct 轉成 buildWooProduct 期望的格式 ──
  const scrapedForBuild = {
    ...scraped,
    sku,           // modelNumber → sku
    title: scraped.title,
  } as any;

  const built = buildWooProduct({
    scraped: scrapedForBuild,
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

  // 補上 Kushitani 專屬 meta
  built.product.meta_data.push(
    { key: '_source_pid', value: scraped.pid },
    { key: '_source_model', value: scraped.modelNumber },
  );

  console.log(`🧱 組裝：${built.product.images.length} 張圖、${built.variations.length} 個變體、售價 NT$${regularPriceTwd}`);

  // ── 建立母商品＋變體（createProduct 內部已呼叫 createVariationsBatch）──
  const created = await woo.createProduct(built);
  console.log(`✅ 商品建立：#${created.id}`);
  console.log(`\n🔗 後台編輯：${cfg.woo.storeUrl}/wp-admin/post.php?post=${created.id}&action=edit`);
}

main().catch((err) => {
  console.error('\n💥', err.response?.data ?? err.message ?? err);
  process.exit(1);
});
