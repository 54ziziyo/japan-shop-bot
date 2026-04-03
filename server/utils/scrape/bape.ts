// ============================================================
// 🦍 BAPE 商品爬蟲（jp.bape.com — Shopify）
// server/utils/scrape/bape.ts
// ============================================================
// BAPE 使用 Shopify 平台，透過 /products/{handle}.json 取得商品資料。
// 兩層選項：COLOR、SIZE（部分商品只有 COLOR）
// 重量：Shopify variant.grams 全為 0，需依分類 + 名稱估算

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
const FALLBACK_WEIGHT_GRAMS = 800;

// ── 重量分類系統 ──────────────────────────────────────────
//
// BAPE Shopify product_type 值（日文）：
//   Tシャツ, カットソー, シャツ, スウェット/パーカー,
//   アウター, ボトムス, キャップ/ハット, バッグ, グッズ, ベビー
//
// BAPE tags 的 cat 前綴（英文）：
//   cattshirt, catcutsewn, catshirt, cathoodie,
//   catouter, catpants, catcap, catbag, catgoods, catbaby
//
// ⚠️ 以下數值為「淨重」（不含包材），最終會再加上 PACKAGING_EXTRA_GRAMS

/**
 * BAPE product_type（日文） → 預估淨重（公克）
 *
 * 你可以在這裡調整各類別的重量。
 * 最終運費計算用的重量 = 淨重 + PACKAGING_EXTRA_GRAMS (500g)
 */
const PRODUCT_TYPE_WEIGHT_MAP: Record<string, number> = {
  // ── 上衣 ──
  Tシャツ: 300, // T-shirt
  カットソー: 350, // Cut & Sew（長袖 T / polo）

  // ── 襯衫 ──
  シャツ: 400, // 襯衫

  // ── 衛衣 / 帽T ──
  'スウェット/パーカー': 900, // 衛衣 / 帽T / hoodie

  // ── 外套 ──
  アウター: 1200, // 外套（夾克、MA-1 等）

  // ── 褲子 ──
  ボトムス: 700, // 褲子（牛仔褲偏重、短褲偏輕）

  // ── 帽子 ──
  'キャップ/ハット': 200, // 帽子

  // ── 包包 ──
  バッグ: 600, // 包包

  // ── 雜貨 ──
  グッズ: 400, // 雜貨（馬克杯、鑰匙圈、手機殼等差異大）

  // ── 嬰兒 ──
  ベビー: 200, // 嬰兒服飾
};

/**
 * BAPE 商品名稱關鍵字 → 淨重（公克）
 *
 * 用於 product_type 查不到或需要更精確分類時。
 * 由上往下依序比對，第一個 match 就採用。
 */
const NAME_WEIGHT_RULES: { pattern: RegExp; weight: number; label: string }[] =
  [
    // ── 鞋子（BAPE STA 等）──
    {
      pattern: /BAPE\s*STA|STA\s*LOW|STA\s*MID|STA\s*HIGH|スニーカー|SNEAKER|SHOES/i,
      weight: 1200,
      label: '鞋子（BAPE STA / Sneakers）',
    },

    // ── 羽絨外套 ──
    {
      pattern: /ダウン|DOWN\s*JACKET/i,
      weight: 1500,
      label: '羽絨外套（ダウン）',
    },

    // ── 丹寧 / 牛仔褲（較重的褲子）──
    {
      pattern: /DENIM|デニム|JEANS|ジーンズ/i,
      weight: 900,
      label: '牛仔褲（デニム）',
    },

    // ── 短褲 ──
    {
      pattern: /SHORT|ショート|ハーフパンツ/i,
      weight: 400,
      label: '短褲（ショートパンツ）',
    },

    // ── 背包 / 大包 ──
    {
      pattern: /BACKPACK|バックパック|DUFFLE|ダッフル|リュック/i,
      weight: 1000,
      label: '背包（バックパック）',
    },

    // ── 小物（鑰匙圈、手機殼等）──
    {
      pattern: /KEYCHAIN|キーチェーン|CARABINER|カラビナ|PHONE\s*CASE|ケース|STICKER|ステッカー/i,
      weight: 150,
      label: '小物（キーチェーン等）',
    },

    // ── 圍巾 / 毛巾 ──
    {
      pattern: /SCARF|マフラー|TOWEL|タオル/i,
      weight: 300,
      label: '圍巾/毛巾',
    },

    // ── 腰帶 ──
    {
      pattern: /BELT|ベルト/i,
      weight: 250,
      label: '腰帶（ベルト）',
    },

    // ── 襪子 ──
    {
      pattern: /SOCKS|ソックス/i,
      weight: 100,
      label: '襪子（ソックス）',
    },

    // ── 打火機（禁運品不會到這，但保險起見歸類）──
    {
      pattern: /LIGHTER|ライター/i,
      weight: 100,
      label: '打火機（ライター）',
    },
  ];

/**
 * 禁止國際運送的商品關鍵字
 * 比對商品標題 + body_html + tags
 */
const RESTRICTED_KEYWORDS = [
  /ライター|LIGHTER/i,
  /アルコール|ALCOHOL/i,
  /ガソリン|GASOLINE|灯油|KEROSENE/i,
  /バッテリー|BATTERY|電池/i,
  /スプレー|SPRAY/i,
  /香水|PERFUME|パルファム|COLOGNE|EAU DE/i,
  /花火|FIREWORK/i,
  /INCENSE|インセンス|お香/i,
];

export interface BapeProduct {
  title: string;
  handle: string;
  price: string; // e.g. "¥12100"
  /** 預估重量(g) + 500g 包材 */
  weightGrams: number;
  /** 重量來源說明 */
  weightSource: string;
  /** 是否為預購商品 */
  isPreOrder: boolean;
  /** 商品類型（日文） */
  productType: string;
  variants: {
    color: string;
    image: string;
    price: string;
    sizes: { name: string; isStock: boolean }[];
  }[];
}

/**
 * 從 BAPE 商品 URL 提取 handle
 * e.g. https://jp.bape.com/products/1k30-110-009 → 1k30-110-009
 */
export function extractBapeHandle(url: string): string | null {
  const m = url.match(/jp\.bape\.com\/.*products\/([a-z0-9-]+)/i);
  return m ? m[1]! : null;
}

/**
 * 檢查商品是否含有國際運送禁止品項
 */
function isRestricted(title: string, bodyHtml: string, tags: string[]): boolean {
  const text = `${title} ${bodyHtml} ${tags.join(' ')}`;
  return RESTRICTED_KEYWORDS.some((re) => re.test(text));
}

/**
 * 依 product_type + 名稱估算淨重（不含包材）
 */
function estimateWeight(
  productType: string,
  title: string,
): { grams: number; source: string } {
  // 1. 先用名稱關鍵字（更精確）
  const nameMatch = NAME_WEIGHT_RULES.find((r) => r.pattern.test(title));
  if (nameMatch) {
    return { grams: nameMatch.weight, source: `名稱比對「${nameMatch.label}」` };
  }

  // 2. 用 product_type 查表
  if (productType && PRODUCT_TYPE_WEIGHT_MAP[productType]) {
    return {
      grams: PRODUCT_TYPE_WEIGHT_MAP[productType],
      source: `分類「${productType}」`,
    };
  }

  // 3. fallback
  return { grams: FALLBACK_WEIGHT_GRAMS, source: '預設值' };
}

export const scrapeBape = async (
  url: string,
): Promise<BapeProduct | null> => {
  try {
    const handle = extractBapeHandle(url);
    if (!handle) throw new Error('無法從網址提取 BAPE 商品 handle');

    console.log(`🦍 BAPE: 正在抓取 ${handle}...`);
    const jsUrl = `https://jp.bape.com/products/${handle}.js`;
    const res = await api.get(jsUrl);
    const product = res.data;
    if (!product) throw new Error('無法取得 BAPE 商品資料');

    // ── 基本資訊（.js 用 type/description，非 product_type/body_html） ──
    const title: string = product.title || 'BAPE 商品';
    const description: string = product.description || '';
    const tags: string[] = product.tags || [];
    const productType: string = product.type || '';

    // ── 禁運品檢查 ──
    if (isRestricted(title, description, tags)) {
      console.warn(`🚫 BAPE 禁運品: ${title}`);
      return null;
    }

    // ── 預購偵測 ──
    const isPreOrder =
      tags.some((t) => /preorder|pre-order/i.test(t)) ||
      title.includes('【予約】') ||
      title.includes('[Pre-order]') ||
      description.includes('予約商品') ||
      description.includes('受注商品');

    // ── 重量估算 ──
    const weight = estimateWeight(productType, title);
    const weightGrams = weight.grams + PACKAGING_EXTRA_GRAMS;
    console.log(
      `  📦 重量估算: ${weight.grams}g (${weight.source}) + ${PACKAGING_EXTRA_GRAMS}g 包材 = ${weightGrams}g`,
    );

    // ── 解析 variants ──
    const variants: any[] = product.variants || [];
    const images: any[] = product.images || [];
    const options: any[] = product.options || [];

    // BAPE 用 2 層選項: COLOR (option1) + SIZE (option2)
    // 部分商品（如配件）可能只有 COLOR
    const hasSize = options.length >= 2;

    const colorMap = new Map<
      string,
      {
        price: number;
        sizes: Map<string, boolean>;
      }
    >();
    const colorOrder: string[] = [];

    for (const v of variants) {
      const color: string = v.option1 || 'ONE COLOR';
      const size: string = hasSize ? v.option2 || 'F' : 'F';
      // .js 價格為 1/100 日幣（例 3960000 = ¥39600）
      const price = Math.round((typeof v.price === 'number' ? v.price : parseInt(v.price) || 0) / 100);
      const isStock: boolean = v.available ?? true;

      if (!colorMap.has(color)) {
        colorMap.set(color, { price, sizes: new Map() });
        colorOrder.push(color);
      }

      colorMap.get(color)!.sizes.set(size, isStock);
    }

    // ── 圖片配對 ──
    // .js 的 images 是 URL 字串陣列（以 // 開頭）
    const normalizeImgUrl = (url: string): string =>
      url.startsWith('//') ? `https:${url}` : url;

    const getImageForColor = (color: string): string => {
      // 嘗試用 variant 自帶的 featured_image（.js 有此欄位）
      const firstVariant = variants.find((v: any) => v.option1 === color);
      if (firstVariant?.featured_image?.src) {
        return normalizeImgUrl(firstVariant.featured_image.src);
      }

      // 按顏色順序均分圖片
      const colorIdx = colorOrder.indexOf(color);
      const step = Math.max(
        1,
        Math.floor(images.length / Math.max(colorOrder.length, 1)),
      );
      const imgIdx = Math.min(colorIdx * step, images.length - 1);
      return images[imgIdx] ? normalizeImgUrl(images[imgIdx]) : '';
    };

    // ── 主要售價 ──
    const firstVariantPrice = variants[0]
      ? Math.round((typeof variants[0].price === 'number' ? variants[0].price : parseInt(variants[0].price) || 0) / 100)
      : 0;
    const price = firstVariantPrice > 0 ? `¥${firstVariantPrice}` : '請洽官網';

    // ── 組裝 Variants ──
    const result: BapeProduct['variants'] = colorOrder.map((color) => {
      const entry = colorMap.get(color)!;
      const variantPrice = `¥${entry.price}`;
      const sizeList = [...entry.sizes.entries()].map(([name, isStock]) => ({
        name,
        isStock,
      }));

      return {
        color,
        image: getImageForColor(color),
        price: variantPrice,
        sizes: sizeList,
      };
    });

    console.log(
      `✅ BAPE 取得 ${result.length} 個顏色 | 重量: ${weightGrams}g | 預購: ${isPreOrder}`,
    );

    return {
      title,
      handle,
      price,
      weightGrams,
      weightSource: weight.source,
      isPreOrder,
      productType,
      variants: result,
    };
  } catch (err: any) {
    console.error(`❌ BAPE 爬蟲失敗:`, err.message);
    return null;
  }
};
