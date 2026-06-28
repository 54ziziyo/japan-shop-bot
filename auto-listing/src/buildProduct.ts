 // ============================================================
// 把爬蟲結果 + Claude 文案，組成 WooCommerce 商品 payload（純轉換）
// auto-listing/src/buildProduct.ts
// ============================================================

import type { RstaichiProduct } from '../../server/utils/scrape/rstaichi';
import type { ListingContent } from './draft';
import type { SeasonInfo } from './season';

const ATTR_COLOR = '顏色';
const ATTR_SIZE = '尺寸';

/** WooCommerce 變體商品 (variable) 母商品 payload */
export interface WooProductPayload {
  name: string;
  slug: string;
  type: 'variable';
  status: 'draft';
  sku: string;
  description: string;
  short_description: string;
  categories: { id: number }[];
  images: { id: number; name: string; alt: string; position: number }[];
  attributes: {
    name: string;
    visible: boolean;
    variation: boolean;
    options: string[];
  }[];
  meta_data: { key: string; value: string }[];
}

/** 單一變體（顏色 × 尺寸）payload */
export interface WooVariationPayload {
  regular_price: string;
  stock_status: 'instock';
  manage_stock: false;
  image?: { id: number };
  attributes: { name: string; option: string }[];
}

export interface BuiltProduct {
  product: WooProductPayload;
  variations: WooVariationPayload[];
}

export interface BuildInput {
  scraped: RstaichiProduct;
  content: ListingContent;
  categoryIds: number[];
  season: SeasonInfo | null;
  sourceUrl: string;
  brand: string;
  /** 顏色名稱 → WP media ID（由 create.ts 在上傳/去重後傳入） */
  colorImageIds: Record<string, number>;
  /** 第一張主圖的 WordPress URL（用於 OG/Twitter social meta） */
  mainImageUrl: string;
  /** 第一張主圖的 WP media ID（用於 OG/Twitter social meta） */
  mainImageId: number;
  /** 台幣售價（商品台幣 + 運費），設在所有變體 regular_price */
  regularPriceTwd: number;
}

/**
 * 組成 WooCommerce 送審(pending)變體商品。
 * 含：SEO 名稱/代稱/說明、分類、Yoast 中繼、圖片 alt、顏色×尺寸變體與庫存。
 */
export function buildWooProduct(input: BuildInput): BuiltProduct {
  const { scraped, content, categoryIds, season, sourceUrl, brand, colorImageIds, mainImageUrl, mainImageId, regularPriceTwd } = input;

  const colors = scraped.variants.map((v) => v.color);
  // 所有顏色的尺寸聯集，依出現順序去重
  const sizeSet: string[] = [];
  for (const v of scraped.variants) {
    for (const s of v.sizes) {
      if (!sizeSet.includes(s.name)) sizeSet.push(s.name);
    }
  }

  // 母商品圖庫：用已上傳的 media ID（去重）
  const images = scraped.variants
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => colorImageIds[v.color] != null)
    .map(({ v, i }) => ({
      id: colorImageIds[v.color],
      name: `${content.imageAlt} ${v.color}`.trim(),
      alt: `${content.imageAlt} ${v.color}`.trim(),
      position: i,
    }));

  const meta_data: { key: string; value: string }[] = [
    // 來源對照（供日後查庫存/去重）
    { key: '_source_brand', value: brand },
    { key: '_source_sku', value: scraped.sku },
    { key: '_source_url', value: sourceUrl },
    { key: '_source_price_jpy', value: scraped.price },
    { key: '_source_weight_g', value: String(scraped.weightGrams) },
    // Yoast SEO
    { key: '_yoast_wpseo_focuskw', value: content.focusKeyword },
    { key: '_yoast_wpseo_title', value: content.seoTitle },
    { key: '_yoast_wpseo_metadesc', value: content.metaDescription },
    // Yoast 社交（OG / X）
    { key: '_yoast_wpseo_opengraph-title', value: content.seoTitle },
    { key: '_yoast_wpseo_opengraph-description', value: content.metaDescription },
    { key: '_yoast_wpseo_opengraph-image', value: mainImageUrl },
    { key: '_yoast_wpseo_opengraph-image-id', value: String(mainImageId) },
    { key: '_yoast_wpseo_twitter-title', value: content.seoTitle },
    { key: '_yoast_wpseo_twitter-description', value: content.metaDescription },
    { key: '_yoast_wpseo_twitter-image', value: mainImageUrl },
    // 清 Yoast 快取，讓後台開啟時重新計算
    { key: '_yoast_wpseo_linkdex', value: '' },
    { key: '_yoast_wpseo_content_score', value: '' },
  ];
  if (season) {
    meta_data.push({ key: '_source_season', value: season.folder });
  }

  const product: WooProductPayload = {
    name: content.name,
    slug: content.slug,
    type: 'variable',
    status: 'draft',
    sku: scraped.sku,
    description: content.descriptionHtml,
    short_description: content.shortDescriptionHtml,
    categories: categoryIds.map((id) => ({ id })),
    images,
    attributes: [
      { name: ATTR_COLOR, visible: true, variation: true, options: colors },
      { name: ATTR_SIZE, visible: true, variation: true, options: sizeSet },
    ],
    meta_data,
  };

  // 每個顏色 × 該顏色實際有的尺寸 → 一個變體
  // 一律設 instock + manage_stock: false：庫存在結帳時即時查日本官網
  const variations: WooVariationPayload[] = [];
  for (const v of scraped.variants) {
    const imageId = colorImageIds[v.color];
    for (const s of v.sizes) {
      variations.push({
        regular_price: String(regularPriceTwd),
        stock_status: 'instock',
        manage_stock: false,
        ...(imageId != null ? { image: { id: imageId } } : {}),
        attributes: [
          { name: ATTR_COLOR, option: v.color },
          { name: ATTR_SIZE, option: s.name },
        ],
      });
    }
  }

  return { product, variations };
}
