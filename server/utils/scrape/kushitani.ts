// ============================================================
// 🏍️ Kushitani 商品爬蟲（kushitanionline.com）
// server/utils/scrape/kushitani.ts
// ============================================================
// Kushitani Online Store 使用 Color Me Shop (shop-pro.jp) 平台。
// 所有庫存資料嵌在 HTML 的 Colorme JavaScript 物件中，
// 無需額外 AJAX 即可取得完整的顏色/尺寸/庫存資訊。

import axios from 'axios';
import https from 'node:https';
import * as cheerio from 'cheerio';

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
const FALLBACK_WEIGHT_GRAMS = 2000;

/**
 * Kushitani 類別 → 預估商品淨重（公克，不含包材）
 * key = Colorme product.category.id_big
 *
 * 你可以在這裡調整各類別的重量。
 * 最終運費計算用的重量 = 淨重 + PACKAGING_EXTRA_GRAMS (500g)
 *
 * ⚠️ 508580 (レーシングギア) 是混合分類，裡面有手套/靴/護具/行李箱等，
 *    Colorme 不提供子分類 (id_small 永遠是 0)，
 *    所以改用下方的 NAME_WEIGHT_RULES 以商品名稱關鍵字細分。
 */
const CATEGORY_WEIGHT_MAP: Record<number, number> = {
  // 508580 (レーシングギア) → 不在此設定，由 NAME_WEIGHT_RULES 細分

  // ── 皮革類 ──
  8447: 3500, // レザージャケット（皮衣防摔外套）
  8448: 2500, // レザーパンツ（皮褲）
  12065: 2200, // レザージーンズ（牛仔防摔褲）

  // ── 紡織類 ──
  8446: 2000, // テキスタイルジャケット（夏季/網眼防摔外套）
  8449: 1500, // テキスタイルパンツ（紡織防摔褲）

  // ── 手套 ──
  8450: 400, // ツーリンググローブ（旅行手套）

  // ── 靴 ──
  8457: 2000, // ツーリングブーツ（車靴）

  // ── 內着・中層 ──
  722123: 300, // アンダーウェア（內衣層）
  415379: 600, // ミッドレイヤー（中層保暖衣）

  // ── 護具 ──
  8453: 800, // プロテクター（護具）

  // ── 包包 ──
  8452: 1200, // バッグ（包包）

  // ── 雨衣 ──
  8455: 600, // レインウェア（雨衣）

  // ── 衣服 ──
  2390519: 350, // Tシャツ・カットソー（T-shirt）

  // ── 小物 ──
  8454: 300, // 小物・雑貨（配件 / 鴨舌帽）
  742126: 500, // メンテナンス用品（保養品）

  // ── 越野 ──
  2866639: 2200, // オフロードウェア（越野裝備）

  // ── 防寒系列 ──
  415378: 2500, // 防寒テキスタイルジャケット（冬季防摔外套）
  415402: 1800, // 防寒テキスタイルパンツ（冬季防摔褲）
  415371: 500, // 防寒グローブ（冬季手套）

  // ── 女裝（參考對應男裝減 20%）──
  9573: 1600, // レディース

  // ── 周邊 ──
  2945209: 400, // MotoGP応援グッズ（GP周邊）
};

/**
 * 商品名稱關鍵字 → 淨重（公克，不含包材）
 *
 * 用於 CATEGORY_WEIGHT_MAP 查不到的情況（例如 508580 レーシングギア）。
 * 由上往下依序比對，第一個 match 就採用。
 *
 * 💡 想新增/修改？直接在這裡加規則即可。
 */
const NAME_WEIGHT_RULES: { pattern: RegExp; weight: number; label: string }[] =
  [
    // ── 手套 ──
    {
      pattern: /グローブ|glove/i,
      weight: 400,
      label: '手套（グローブ）',
    },

    // ── 靴 / ブーツ ──
    {
      pattern: /ブーツ|boot|シューズ|shoes/i,
      weight: 2500,
      label: '靴子（ブーツ）',
    },

    // ── 護具 / プロテクター ──
    {
      pattern: /プロテクター|protector|パームガード|ヘルメットリムーバー/i,
      weight: 500,
      label: '護具（プロテクター）',
    },

    // ── スライダー / センサー（小型消耗品）──
    {
      pattern: /スライダー|slider|センサー|sensor/i,
      weight: 200,
      label: '滑塊/護塊（スライダー）',
    },

    // ── 行李箱 / ケース ──
    {
      pattern: /キャリー|ケース|carry|case/i,
      weight: 5000,
      label: '行李箱（キャリーケース）',
    },

    // ── 雨傘 ──
    {
      pattern: /アンブレラ|umbrella/i,
      weight: 500,
      label: '雨傘（アンブレラ）',
    },

    // ── 皮衣 / スーツ（兩件式含上下）──
    {
      pattern: /スーツ|レーシングスーツ|suit/i,
      weight: 5000,
      label: '連身皮衣（レーシングスーツ）',
    },

    // ── 內衣 / インナー ──
    {
      pattern: /インナー|inner/i,
      weight: 300,
      label: '內衣/內搭（インナー）',
    },
  ];

export interface KushitaniProduct {
  title: string;
  pid: string;
  modelNumber: string;
  price: string; // e.g. "¥80300"（含稅）
  weightGrams: number;
  image: string;
  variants: {
    color: string;
    image: string;
    price: string;
    sizes: { name: string; isStock: boolean }[];
  }[];
}

export const scrapeKushitani = async (
  url: string,
): Promise<KushitaniProduct | null> => {
  try {
    // 1. 從 URL 提取 pid
    const pidMatch = url.match(/[?&]pid=(\d+)/);
    if (!pidMatch) throw new Error('無法從網址提取商品 PID');
    const pid = pidMatch[1];

    // 2. 取得商品頁 HTML
    const { data: html } = await api.get(url);
    const $ = cheerio.load(html);

    // 3. 從 HTML 內嵌的 Colorme JSON 提取商品資料
    //    格式: var Colorme = { ... "product": { ... "variants": [...] } };
    let colorme: any = null;
    $('script').each((_, el) => {
      const text = $(el).html() || '';
      const m = text.match(/var\s+Colorme\s*=\s*(\{[\s\S]*?\});\s*$/m);
      if (m) {
        try {
          colorme = JSON.parse(m[1]);
        } catch {
          /* ignore parse errors */
        }
      }
    });

    if (!colorme?.product) throw new Error('無法解析 Colorme 商品資料');
    const product = colorme.product;

    // 4. 基本資訊
    const title = product.name || 'Kushitani 商品';
    const modelNumber = product.model_number || '';
    const priceIncTax =
      product.sales_price_including_tax || product.sales_price || 0;
    const price = `¥${priceIncTax}`;

    // 5. 商品圖片：從 HTML 縮圖列表依序提取，第 1 張 = 第 1 色，第 2 張 = 第 2 色...
    const mainImage = `https://img03.shop-pro.jp/PA01002/054/product/${pid}.jpg`;
    const thumbMatches = [
      ...html.matchAll(
        /product__thumb__unit[^>]*>[\s\S]*?src="(https:\/\/img[^"]+)"/g,
      ),
    ];
    const thumbUrls = thumbMatches.map((m: RegExpMatchArray) =>
      m[1].replace(/\?.*$/, ''),
    );
    // 若 HTML 沒有縮圖（稀少情況），至少有 mainImage
    if (!thumbUrls.length) thumbUrls.push(mainImage);

    // 6. 解析 variants（顏色 × 尺寸 × 庫存）
    const variants: any[] = product.variants || [];

    // 按顏色分組
    const colorMap = new Map<
      string,
      { sizes: { name: string; isStock: boolean; price: number }[] }
    >();
    const colorOrder: string[] = [];

    for (const v of variants) {
      const color = v.option1_value || '預設';
      const size = v.option2_value || 'F';
      const stockNum = v.stock_num ?? 0;
      const variantPrice = v.option_price_including_tax || priceIncTax;

      if (!colorMap.has(color)) {
        colorMap.set(color, { sizes: [] });
        colorOrder.push(color);
      }
      colorMap.get(color)!.sizes.push({
        name: size,
        isStock: stockNum > 0,
        price: variantPrice,
      });
    }

    // 若完全沒有 variants（無選項商品），建立預設
    if (colorOrder.length === 0) {
      colorOrder.push('預設');
      colorMap.set('預設', {
        sizes: [
          {
            name: 'F',
            isStock: (product.stock_num ?? 0) > 0,
            price: priceIncTax,
          },
        ],
      });
    }

    // 7. 依類別查表取得重量，若查不到則用商品名稱關鍵字細分
    const categoryIdBig: number = product.category?.id_big ?? 0;
    let weightGrams = CATEGORY_WEIGHT_MAP[categoryIdBig] ?? 0;

    if (!weightGrams) {
      // CATEGORY_WEIGHT_MAP 查不到（例如 508580 レーシングギア）
      // → 用商品名稱關鍵字比對
      const productName = title + ' ' + modelNumber;
      const matched = NAME_WEIGHT_RULES.find((r) =>
        r.pattern.test(productName),
      );
      if (matched) {
        weightGrams = matched.weight;
        console.log(
          `  📦 id_big=${categoryIdBig} → 名稱比對「${matched.label}」→ ${weightGrams}g`,
        );
      } else {
        // 名稱也比對不到 → 嘗試從頁面解析重量，最後 fallback
        weightGrams = FALLBACK_WEIGHT_GRAMS;
        const bodyText = $('body').text();
        const weightMatch = bodyText.match(
          /(?:重量|weight)[：:\s]*(?:約?\s*)?(\d+(?:\.\d+)?)\s*(?:g|kg)/i,
        );
        if (weightMatch) {
          const val = parseFloat(weightMatch[1]);
          weightGrams = weightMatch[0].toLowerCase().includes('kg')
            ? Math.round(val * 1000)
            : Math.round(val);
        }
        console.log(
          `  ⚠️ 類別 id_big=${categoryIdBig} 名稱也無法比對，使用 ${weightGrams}g`,
        );
      }
    }
    weightGrams += PACKAGING_EXTRA_GRAMS;

    // 8. 組裝結果
    const resultVariants = colorOrder.slice(0, 10).map((color, idx) => {
      const data = colorMap.get(color)!;
      // 依序對應縮圖：第 0 色 → thumbUrls[0], 第 1 色 → thumbUrls[1]...
      const colorImage = thumbUrls[idx] || thumbUrls[0] || mainImage;
      return {
        color,
        image: colorImage,
        price,
        sizes: data.sizes.map((s) => ({
          name: s.name,
          isStock: s.isStock,
        })),
      };
    });

    console.log(
      `✅ Kushitani 取得 ${resultVariants.length} 個顏色, ${variants.length} 個 SKU | ${title} (${modelNumber})`,
    );
    for (const v of resultVariants) {
      const inStock = v.sizes.filter((s) => s.isStock).map((s) => s.name);
      console.log(
        `  🎨 ${v.color}: ${inStock.length ? inStock.join(', ') : '全部完售'}`,
      );
    }

    return {
      title: modelNumber ? `${title} ${modelNumber}` : title,
      pid,
      modelNumber,
      price,
      weightGrams,
      image: mainImage,
      variants: resultVariants,
    };
  } catch (err: any) {
    console.error('❌ Kushitani 抓取失敗:', err.message);
    return null;
  }
};
