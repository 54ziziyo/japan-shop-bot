// ============================================================
// 🦁 AAPE 商品爬蟲（aape.jp — ebisumart 平台）
// server/utils/scrape/aape.ts
// ============================================================
// AAPE by A Bathing Ape 官網使用 ebisumart SSR 平台。
// 商品資料（顏色、尺寸、庫存數量）全部嵌在初始 HTML 中，
// 無需 headless browser，直接 axios + cheerio 解析即可。
//
// HTML 結構：
//   .variation-row                       → 每個顏色
//     .variation-row-thumbnail .color    → 顏色名稱（日文）
//     .variation-row-thumbnail img[src]  → 125px 縮圖（換成 500px 大圖）
//     .variation-col-item                → 每個尺寸
//       .size                            → 尺寸名稱
//       .quantity                        → 庫存數量（0 = 缺貨）
//
// 圖片 URL 規律：
//   https://c.imgz.jp/420/{itemId}/{itemId}b_{colorCode}_d_500.jpg
//   壓縮格式：AAPE:{colorCode}  →  重建時用 productCode(itemId)

import axios from 'axios';
import https from 'node:https';
import * as cheerio from 'cheerio';

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const api = axios.create({
  httpsAgent: keepAliveAgent,
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'ja,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: 'https://aape.jp/',
  },
});

/** 額外包材重量（公克） */
const PACKAGING_EXTRA_GRAMS = 500;
/** 找不到重量時的預設值（公克） */
const FALLBACK_WEIGHT_GRAMS = 400;

/**
 * AAPE 商品名稱關鍵字 → 預估淨重（公克，不含包材）
 * 依商品標題做模糊比對，涵蓋 AAPE 常見品類
 */
const NAME_WEIGHT_RULES: { pattern: RegExp; weight: number; label: string }[] =
  [
    // ── 外套類 ──
    {
      pattern: /jacket|ジャケット|blouson|ブルゾン|bomber/i,
      weight: 900,
      label: '外套',
    },
    { pattern: /fleece|フリース/i, weight: 600, label: '搖粒絨外套' },
    { pattern: /hoodie|hoody|パーカー/i, weight: 750, label: '帽T' },
    { pattern: /sweatshirt|スウェット/i, weight: 650, label: '衛衣' },

    // ── 褲子類 ──
    { pattern: /pants|パンツ/i, weight: 500, label: '褲子' },
    { pattern: /shorts|ショーツ/i, weight: 300, label: '短褲' },

    // ── 上衣類 ──
    {
      pattern: /l\/s tee|long.*tee|ロングスリーブ|長袖.*Ｔ|長袖.*T/i,
      weight: 300,
      label: '長袖T',
    },
    { pattern: /\bTEE\b|Tシャツ|T-SHIRT/i, weight: 250, label: 'T恤' },
    { pattern: /polo|ポロ/i, weight: 350, label: 'Polo衫' },
    { pattern: /shirt|シャツ/i, weight: 350, label: '襯衫' },

    // ── 配件類 ──
    { pattern: /cap|hat|キャップ|ハット/i, weight: 200, label: '帽子' },
    {
      pattern: /sunglasses|サングラス|optical\s*frame/i,
      weight: 100,
      label: '眼鏡',
    },
    { pattern: /belt|ベルト/i, weight: 250, label: '腰帶' },
    { pattern: /watch|時計|腕時計/i, weight: 200, label: '手錶' },
    {
      pattern: /necklace|ネックレス|bracelet|ブレスレット/i,
      weight: 80,
      label: '飾品',
    },
    // 後背包必須在 bag 通用規則之前比對
    {
      pattern: /backpack|バックパック|rucksack|リュック|daypack/i,
      weight: 800,
      label: '後背包',
    },
    { pattern: /bag|バッグ|tote|トート/i, weight: 300, label: '包包' },
    { pattern: /wallet|財布|pouch|ポーチ/i, weight: 100, label: '錢包/小物' },
    { pattern: /socks?|ソックス/i, weight: 100, label: '襪子' },
    {
      pattern: /key.?chain|キーホルダー|keyring/i,
      weight: 100,
      label: 'Key Chain',
    },
    {
      pattern: /tumbler|タンブラー|bottle|ボトル|\bmug\b|マグ|\bcup\b/i,
      weight: 300,
      label: '保溫瓶/杯子',
    },
    { pattern: /swimwear|水着|swim\s*pant/i, weight: 150, label: '泳裝' },

    // ── 鞋類 ──
    {
      pattern:
        /sneaker|スニーカー|footwear|フットウェア|shoes?|シューズ|STA\b/i,
      weight: 1000,
      label: '鞋類',
    },
  ];

/**
 * 禁止國際運送的商品關鍵字
 */
const RESTRICTED_KEYWORDS = [
  /ライター|lighter/i,
  /アルコール|alcohol/i,
  /スプレー|spray/i,
  /香水|perfume|パルファム/i,
  /バッテリー|battery|電池/i,
  /花火|firework/i,
];

export interface AapeProduct {
  title: string;
  itemId: string;
  price: string; // e.g. "¥6050"
  /** 預估重量(g) + 500g 包材 */
  weightGrams: number;
  /** 重量來源說明 */
  weightSource: string;
  /** 是否為預購商品 */
  isPreOrder: boolean;
  variants: {
    color: string;
    /** 圖片 URL（500px） */
    image: string;
    /** 顏色代碼（用於 postback 壓縮，如 "1", "8", "26"） */
    colorCode: string;
    price: string;
    sizes: { name: string; isStock: boolean }[];
  }[];
}

/**
 * 從 aape.jp 商品 URL 提取 item_cd
 * e.g. https://aape.jp/item/103433420.html → 103433420
 */
export function extractAapeItemId(url: string): string | null {
  const m = url.match(/aape\.jp\/item\/(\d+)\.html/i);
  return m ? m[1]! : null;
}

/**
 * 依商品名稱估算淨重（不含包材）
 */
function estimateWeight(title: string): { grams: number; source: string } {
  const rule = NAME_WEIGHT_RULES.find((r) => r.pattern.test(title));
  if (rule) return { grams: rule.weight, source: `名稱比對「${rule.label}」` };
  return { grams: FALLBACK_WEIGHT_GRAMS, source: '預設值' };
}

export const scrapeAape = async (url: string): Promise<AapeProduct | null> => {
  try {
    const itemId = extractAapeItemId(url);
    if (!itemId) throw new Error('無法從網址提取 AAPE item_cd');

    console.log(`🦁 AAPE: 正在抓取 ${itemId}...`);
    const res = await api.get(`https://aape.jp/item/${itemId}.html`);
    const $ = cheerio.load(res.data);

    // ── 標題（<title> 標籤，去掉 "| AAPE.JP" 後綴）──
    const rawTitle = $('title').text().trim();
    const title =
      rawTitle.replace(/\s*\|\s*AAPE\.JP\s*$/i, '').trim() || 'AAPE 商品';

    // ── 禁運品檢查 ──
    if (RESTRICTED_KEYWORDS.some((re) => re.test(title))) {
      console.warn(`🚫 AAPE 禁運品: ${title}`);
      return null;
    }

    // ── 價格（<span class="price-entity ja">） ──
    const priceRaw = $('span.price-entity.ja')
      .first()
      .text()
      .replace(/,/g, '')
      .trim();
    const priceNum = parseInt(priceRaw, 10);
    const price = priceNum > 0 ? `¥${priceNum}` : '請洽官網';

    // ── 預購偵測 ──
    const isPreOrder =
      title.includes('【予約】') ||
      title.includes('[Pre-order]') ||
      title.includes('予約') ||
      $('body').text().includes('受注商品');

    // ── 重量估算 ──
    const weight = estimateWeight(title);
    const weightGrams = weight.grams + PACKAGING_EXTRA_GRAMS;
    console.log(
      `  📦 重量估算: ${weight.grams}g (${weight.source}) + ${PACKAGING_EXTRA_GRAMS}g 包材 = ${weightGrams}g`,
    );

    // ── 解析顏色 + 尺寸 + 庫存 ──
    const variants: AapeProduct['variants'] = [];

    $('.variation-row').each((_, row) => {
      const $row = $(row);

      // 顏色名稱
      const color = $row.find('.variation-row-thumbnail .color').text().trim();
      if (!color) return; // 跳過沒有顏色的列（可能是 header）

      // 圖片：從 125px 縮圖 URL 推算 500px 大圖
      const thumbSrc =
        $row.find('.variation-row-thumbnail .image img').attr('src') || '';
      const image = thumbSrc.replace(/_125\.jpg$/i, '_500.jpg');

      // 顏色代碼：從圖片 URL 中提取（如 103433420b_1_d_125.jpg → "1"）
      const colorCodeMatch = thumbSrc.match(/\d+b_(\w+)_d_\d+\.jpg$/i);
      const colorCode = colorCodeMatch ? colorCodeMatch[1]! : color;

      // 尺寸 + 庫存
      const sizes: { name: string; isStock: boolean }[] = [];
      $row.find('.variation-col-item').each((_, col) => {
        const $col = $(col);
        const sizeName = $col
          .find('.variation-col-size_stock .size')
          .text()
          .trim();
        const quantityText = $col
          .find('.variation-col-size_stock .quantity')
          .text()
          .trim();
        const quantity = parseInt(quantityText, 10);
        if (!sizeName) return;
        sizes.push({ name: sizeName, isStock: quantity > 0 });
      });

      if (sizes.length === 0) return;

      variants.push({
        color,
        image,
        colorCode,
        price,
        sizes,
      });
    });

    if (variants.length === 0) {
      throw new Error('未解析到任何顏色/尺寸資料');
    }

    console.log(
      `✅ AAPE 取得 ${variants.length} 個顏色 | 重量: ${weightGrams}g | 預購: ${isPreOrder}`,
    );

    return {
      title,
      itemId,
      price,
      weightGrams,
      weightSource: weight.source,
      isPreOrder,
      variants,
    };
  } catch (err: any) {
    console.error(`❌ AAPE 爬蟲失敗:`, err.message);
    return null;
  }
};
