// ============================================================
// 🐰 FR2 商品爬蟲（fr2.tokyo — Shopify）
// server/utils/scrape/fr2.ts
// ============================================================
// FR2 使用 Shopify 平台，透過 /products/{handle}.json 取得商品資料。
// 三層選項：ColorType（色系）、Color（顏色）、Size（尺寸）
// 重量：Shopify variant.grams 欄位（FR2 有填入實際重量）

import axios from 'axios';
import https from 'node:https';

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const api = axios.create({
  httpsAgent: keepAliveAgent,
  timeout: 10000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Encoding': 'gzip, deflate, br',
  },
});

/** 額外包材重量（公克） */
const PACKAGING_EXTRA_GRAMS = 500;
/** 找不到重量時的預設值（公克） */
const FALLBACK_WEIGHT_GRAMS = 500;

/**
 * 禁止國際運送的商品關鍵字（酒精、汽油、電池、打火機等）
 * 比對商品標題 + body_html
 */
const RESTRICTED_KEYWORDS = [
  /ライター|lighter/i,
  /アルコール|alcohol/i,
  /ガソリン|gasoline|灯油|kerosene/i,
  /バッテリー|battery|電池/i,
  /スプレー|spray/i,
  /香水|perfume|パルファム/i,
  /マニキュア|nail\s*polish/i,
  /花火|firework/i,
];

export interface Fr2Product {
  title: string;
  handle: string;
  price: string; // e.g. "¥9900"
  /** 最大 variant 重量(g) + 500g 包材 */
  weightGrams: number;
  /** 是否為預購商品 */
  isPreOrder: boolean;
  /** 是否為新商品 */
  isNew: boolean;
  /** 商品類型（日文） */
  productType: string;
  variants: {
    color: string;
    colorType: string;
    image: string;
    price: string;
    sizes: { name: string; isStock: boolean }[];
  }[];
}

/**
 * 從 FR2 商品 URL 提取 handle
 * e.g. https://fr2.tokyo/products/1080000003180 → 1080000003180
 */
export function extractFr2Handle(url: string): string | null {
  const m = url.match(/fr2\.tokyo\/.*products\/([a-z0-9-]+)/i);
  return m ? m[1]! : null;
}

/**
 * 檢查商品是否含有國際運送禁止品項
 */
function isRestricted(title: string, bodyHtml: string): boolean {
  const text = `${title} ${bodyHtml}`;
  return RESTRICTED_KEYWORDS.some((re) => re.test(text));
}

export const scrapeFr2 = async (
  url: string,
): Promise<Fr2Product | null> => {
  try {
    const handle = extractFr2Handle(url);
    if (!handle) throw new Error('無法從網址提取 FR2 商品 handle');

    console.log(`🐰 FR2: 正在抓取 ${handle}...`);
    const jsUrl = `https://fr2.tokyo/products/${handle}.js`;
    const res = await api.get(jsUrl);
    const product = res.data;
    if (!product) throw new Error('無法取得 FR2 商品資料');

    // ── 基本資訊（.js 用 type/description，非 product_type/body_html） ──
    const title: string = product.title || 'FR2 商品';
    const description: string = product.description || '';
    const tags: string[] = product.tags || [];
    const productType: string = product.type || '';

    // ── 禁運品檢查 ──
    if (isRestricted(title, description)) {
      console.warn(`🚫 FR2 禁運品: ${title}`);
      return null;
    }

    // ── 預購 / 新商品 偵測 ──
    const isPreOrder =
      title.includes('[Pre-order]') ||
      title.includes('【予約】') ||
      description.includes('受注商品') ||
      description.includes('予約商品');
    const isNew = tags.some((t) => t === '新商品');

    // ── 解析 variants ──
    const variants: any[] = product.variants || [];
    const images: any[] = product.images || [];

    // FR2 有三層選項: ColorType / Color / Size
    // 按 ColorType (option1) 分組
    const colorMap = new Map<
      string,
      {
        color: string;
        colorType: string;
        price: number;
        maxGrams: number;
        sizes: Map<string, boolean>;
      }
    >();
    const colorOrder: string[] = [];

    for (const v of variants) {
      const colorType: string = v.option1 || '預設';
      const color: string = v.option2 || colorType;
      const size: string = v.option3 || 'F';
      // .js 價格為 1/100 日幣（例 2640000 = ¥26400）
      const price = Math.round((typeof v.price === 'number' ? v.price : parseInt(v.price) || 0) / 100);
      // .js 用 weight 欄位（公克）
      const grams: number = v.weight || v.grams || 0;
      const isStock: boolean = v.available ?? true;

      if (!colorMap.has(colorType)) {
        colorMap.set(colorType, {
          color,
          colorType,
          price,
          maxGrams: grams,
          sizes: new Map(),
        });
        colorOrder.push(colorType);
      }

      const entry = colorMap.get(colorType)!;
      entry.sizes.set(size, isStock);
      if (grams > entry.maxGrams) entry.maxGrams = grams;
    }

    // ── 圖片配對 ──
    // .js 的 images 是 URL 字串陣列（以 // 開頭）
    // FR2 圖片 URL 格式含 SKU 前兩段：.../1080000003180-0029-01.jpg
    const normalizeImgUrl = (url: string): string =>
      url.startsWith('//') ? `https:${url}` : url;

    const getImageForColorType = (colorType: string): string => {
      const firstVariant = variants.find((v: any) => v.option1 === colorType);

      // 嘗試用 variant 自帶的 featured_image
      if (firstVariant?.featured_image?.src) {
        return normalizeImgUrl(firstVariant.featured_image.src);
      }

      // 用 SKU 前兩段比對圖片 URL 檔名
      if (firstVariant?.sku) {
        const skuPrefix = firstVariant.sku.split('-').slice(0, 2).join('-');
        const matched = images.find(
          (imgUrl: string) => imgUrl.includes(skuPrefix),
        );
        if (matched) return normalizeImgUrl(matched);
      }

      // fallback: 按顏色順序均分圖片
      const colorIdx = colorOrder.indexOf(colorType);
      const step = Math.max(1, Math.floor(images.length / Math.max(colorOrder.length, 1)));
      const imgIdx = Math.min(colorIdx * step, images.length - 1);
      return images[imgIdx] ? normalizeImgUrl(images[imgIdx]) : '';
    };

    // ── 取得整體重量（取最大 variant 重量 + 包材） ──
    let maxWeight = 0;
    for (const entry of colorMap.values()) {
      if (entry.maxGrams > maxWeight) maxWeight = entry.maxGrams;
    }
    const weightGrams =
      (maxWeight > 0 ? maxWeight : FALLBACK_WEIGHT_GRAMS) +
      PACKAGING_EXTRA_GRAMS;

    // ── 主要售價 ──
    const firstVariantPrice = variants[0]
      ? Math.round((typeof variants[0].price === 'number' ? variants[0].price : parseInt(variants[0].price) || 0) / 100)
      : 0;
    const price = firstVariantPrice > 0 ? `¥${firstVariantPrice}` : '請洽官網';

    // ── 組裝 Variants ──
    const result: Fr2Product['variants'] = colorOrder.map((ct) => {
      const entry = colorMap.get(ct)!;
      const variantPrice = `¥${entry.price}`;
      const sizeList = [...entry.sizes.entries()].map(([name, isStock]) => ({
        name,
        isStock,
      }));

      return {
        color: entry.color,
        colorType: entry.colorType,
        image: getImageForColorType(ct),
        price: variantPrice,
        sizes: sizeList,
      };
    });

    console.log(
      `✅ FR2 取得 ${result.length} 個顏色 | 重量: ${weightGrams}g | 預購: ${isPreOrder} | 新品: ${isNew}`,
    );

    return {
      title,
      handle,
      price,
      weightGrams,
      isPreOrder,
      isNew,
      productType,
      variants: result,
    };
  } catch (err: any) {
    console.error(`❌ FR2 爬蟲失敗:`, err.message);
    return null;
  }
};
