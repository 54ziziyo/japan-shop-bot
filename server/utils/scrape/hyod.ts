// ============================================================
// 🏍️ HYOD 商品爬蟲（shop.hyod-products.com）
// server/utils/scrape/hyod.ts
// ============================================================
// HYOD 使用 ASP.NET WebForms 系統（.aspx）。
// 所有庫存/尺寸/顏色資料直接嵌在靜態 HTML 中，
// 無需額外 AJAX 即可完整解析。
//
// 執行範例（從 auto-listing 目錄）：
//   npx tsx --env-file=.env auto-listing/src/scrape-hyod.ts \
//     "https://shop.hyod-products.com/Form/Product/ProductDetail.aspx?shop=0&pid=HYF101N"

import axios from 'axios';
import https from 'node:https';
import * as cheerio from 'cheerio';

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const api = axios.create({
  httpsAgent: keepAliveAgent,
  timeout: 30000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'ja-JP,ja;q=0.9',
  },
});

const BASE_URL = 'https://shop.hyod-products.com';
const PACKAGING_EXTRA_GRAMS = 300;
const FALLBACK_WEIGHT_GRAMS = 1500;

/** 商品標題關鍵字 → 預估淨重（公克，不含包材） */
const NAME_WEIGHT_RULES: { pattern: RegExp; weight: number; label: string }[] = [
  { pattern: /グローブ|glove/i,                           weight: 400,  label: '手套' },
  { pattern: /ブーツ|boot/i,                               weight: 1500, label: '車靴（靴）' },
  { pattern: /シューズ|shoes?/i,                           weight: 800,  label: '騎乘鞋' },
  { pattern: /ジャケット|jacket|parka|パーカ/i,            weight: 1500, label: '外套/夾克' },
  { pattern: /スーツ|レーシングスーツ|suit/i,              weight: 4000, label: '連身皮衣' },
  { pattern: /パンツ|pants|trousers?/i,                    weight: 800,  label: '褲子' },
  { pattern: /インナー|inner|アンダー|under/i,             weight: 300,  label: '內層衣' },
  { pattern: /プロテクター|protector|バックプロテクター/i,  weight: 600,  label: '護具' },
  { pattern: /キャップ|cap|ハット|hat/i,                   weight: 200,  label: '帽子' },
  { pattern: /バッグ|bag/i,                                weight: 800,  label: '包包' },
];

export interface HyodProduct {
  pid: string;          // e.g. "HYF101N"
  title: string;        // e.g. "HYOD RIDE SHOES \"XIPHOS\""
  price: string;        // e.g. "¥24200"（含稅）
  weightGrams: number;  // 估算重量（含包材），用於運費計算
  description: string;  // MORE SPEC 頁面的日文說明文字
  variants: {
    color: string;      // e.g. "BLACK", "BLACK/WHITE"
    image: string;      // 該顏色大圖完整 URL（LL 尺寸）
    sizes: { name: string }[];  // 目前有庫存的尺寸（只含在售規格）
  }[];
}

export const scrapeHyod = async (url: string): Promise<HyodProduct | null> => {
  try {
    // 1. 從 URL 取得 pid
    const pidMatch = url.match(/[?&]pid=([A-Z0-9]+)/i);
    if (!pidMatch) throw new Error('無法從網址提取 HYOD 商品 PID');
    const pid = pidMatch[1].toUpperCase();

    // 2. 取得商品頁 HTML
    console.log(`🏍️ HYOD: 正在抓取 ${pid}...`);
    const { data: html } = await api.get(url);
    const $ = cheerio.load(html);

    // 3. 標題
    const title = $('h1').first().text().trim() || pid;

    // 4. 價格（取第一個 ¥XX,XXX 或 ¥XXXXX 格式）
    const priceMatch = html.match(/¥([\d,]+)(?:\.0+)?\s*(?:（|<|\s)/);
    const price = priceMatch ? `¥${priceMatch[1].replace(/,/g, '')}` : '¥0';

    // 5. 顏色圖片：從 variationImage ul 解析
    //    每個有 <p class="subItemTitle"> 的 li 是一個顏色的第一張圖（正面主圖）
    const colorImageMap = new Map<string, string>();
    $('.variationImage li').each((_, li) => {
      const colorName = $(li).find('.subItemTitle').text().trim();
      if (!colorName) return; // 無色名 = 同一顏色的第二張圖（背面），跳過

      // 優先用 data-image（LL 大圖），否則用 src（S 縮圖）
      const img = $(li).find('img').first();
      const imgPath = img.attr('data-image') || img.attr('src') || '';
      if (imgPath) {
        const imgUrl = imgPath.startsWith('http')
          ? imgPath
          : `${BASE_URL}${imgPath}`;
        colorImageMap.set(colorName, imgUrl);
      }
    });

    // 6. 尺寸：從「カラー・サイズ選択」區塊解析在售規格
    //    結構：每個變體有一個 hfVariationId hidden input，
    //    其前方文字包含 "{顏色} {尺寸}" 格式，例如 "BLACK 23"、"BLACK/WHITE 25.5"
    const addCartSection = html.slice(
      html.indexOf('カラー・サイズ選択'),
      html.indexOf('カラー・サイズ選択') + 40000,
    );

    // 按顏色分組尺寸
    const colorSizeMap = new Map<string, string[]>();
    const hiddenInputMatches = [
      ...addCartSection.matchAll(
        /hfVariationId[^>]+value="([^"]+)"/g,
      ),
    ];

    let lastSearchPos = 0;
    for (const m of hiddenInputMatches) {
      const varId = m[1]; // e.g. "HYF101N_4582688814729"
      if (!varId.startsWith(pid)) continue; // 排除頁面上其他推薦商品

      // 取出此 hidden input 之前的文字塊
      const beforeText = addCartSection
        .slice(lastSearchPos, m.index!)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 找 "{顏色} {尺寸}" 模式（取最後一個 match，最靠近 hidden input 的）
      // 顏色可能含 "/" 例如 BLACK/WHITE，尺寸可能是數字或英文
      const labelMatches = [
        ...beforeText.matchAll(
          /\b([A-Z][A-Z0-9/. -]*?)\s+([\d]+(?:\.[05])?|FREE|SS|S|MM|M|LL|L|XL|2XL|3XL|4XL)\b/gi,
        ),
      ];
      const labelMatch = labelMatches.length > 0
        ? labelMatches[labelMatches.length - 1]
        : null;

      if (labelMatch) {
        const color = labelMatch[1].trim().toUpperCase();
        const size = labelMatch[2].trim();
        if (!colorSizeMap.has(color)) colorSizeMap.set(color, []);
        if (!colorSizeMap.get(color)!.includes(size)) {
          colorSizeMap.get(color)!.push(size);
        }
      }

      lastSearchPos = m.index! + m[0].length;
    }

    // 7. 組裝 variants（以顏色圖片為主序）
    //    若 colorSizeMap 有顏色但 colorImageMap 沒有圖片，仍保留（圖片用佔位）
    const allColors = new Set([...colorImageMap.keys(), ...colorSizeMap.keys()]);
    const variants: HyodProduct['variants'] = [];

    for (const color of allColors) {
      const image = colorImageMap.get(color) || '';
      const sizes = (colorSizeMap.get(color) || []).map((s) => ({ name: s }));
      if (sizes.length === 0) continue; // 全售完的顏色不列入
      variants.push({ color, image, sizes });
    }

    if (variants.length === 0) {
      throw new Error(`找不到任何在售顏色/尺寸（pid=${pid}）`);
    }

    // 8. 商品說明：取 MORE SPEC 的 dl 元素文字
    const descParts: string[] = [];
    $('dl').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 30 && text.length < 2000) {
        descParts.push(text);
      }
    });
    const description = descParts.slice(0, 5).join('\n\n');

    // 9. 重量估算（HYOD 頁面不提供重量）
    const matched = NAME_WEIGHT_RULES.find((r) => r.pattern.test(title));
    let weightGrams: number;
    if (matched) {
      weightGrams = matched.weight + PACKAGING_EXTRA_GRAMS;
      console.log(`  📦 重量：${matched.label} → 淨重 ${matched.weight}g + 包材 ${PACKAGING_EXTRA_GRAMS}g = ${weightGrams}g`);
    } else {
      weightGrams = FALLBACK_WEIGHT_GRAMS + PACKAGING_EXTRA_GRAMS;
      console.log(`  ⚠️ 找不到分類，使用預設重量 ${weightGrams}g`);
    }

    // 10. 輸出結果
    console.log(`✅ HYOD 取得 ${variants.length} 個顏色 | ${title} (${pid})`);
    for (const v of variants) {
      console.log(`  🎨 ${v.color}: ${v.sizes.map((s) => s.name).join(', ')} | 🖼️ ${v.image ? '有圖' : '⚠️ 無圖'}`);
    }

    return { pid, title, price, weightGrams, description, variants };
  } catch (err: any) {
    console.error('❌ HYOD 抓取失敗:', err.message);
    return null;
  }
};
