// ============================================================
// 🏍️ RS Taichi 商品爬蟲（ec.rs-taichi.com）
// server/utils/scrape/rstaichi.ts
// ============================================================
// 解析 Magento 2 商品頁的 x-magento-init JSON，取得
// 顏色、尺寸、庫存、圖片、價格、梱包重量等資訊。

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

/** 額外包材重量（公克），加在商品梱包重量上 */
const PACKAGING_EXTRA_GRAMS = 500;
/** 找不到重量時的預設值（公克） */
const FALLBACK_WEIGHT_GRAMS = 1500;

export interface RstaichiProduct {
  title: string;
  sku: string;
  price: string; // e.g. "¥22990"
  /** 梱包重量(g) + 500g 包材 */
  weightGrams: number;
  variants: {
    color: string;
    image: string;
    price: string;
    sizes: { name: string; isStock: boolean }[];
  }[];
}

export const scrapeRstaichi = async (
  url: string,
): Promise<RstaichiProduct | null> => {
  try {
    const skuMatch = url.match(/ec\.rs-taichi\.com\/([a-z0-9]+)\.html/i);
    if (!skuMatch) throw new Error('無法從網址提取 RS Taichi 商品編號');
    const sku = skuMatch[1]!.toUpperCase();
    const cleanUrl = `https://www.ec.rs-taichi.com/${sku.toLowerCase()}.html`;

    console.log(`🏍️ RS Taichi: 正在抓取 ${sku}...`);
    const res = await api.get(cleanUrl);
    const html = res.data as string;
    const $ = cheerio.load(html);

    // ── 基本資訊 ──
    const title =
      $('span.base[data-ui-id="page-title-wrapper"]').text().trim() ||
      `RS Taichi ${sku}`;

    const priceText = $('[data-price-type="finalPrice"] .price')
      .first()
      .text()
      .trim(); // e.g. "￥22,990"
    const priceNum = parseInt((priceText || '0').replace(/[^\d]/g, '')) || 0;
    const price = priceNum > 0 ? `¥${priceNum}` : '請洽官網';

    // ── 梱包重量 ──
    let weightGrams = FALLBACK_WEIGHT_GRAMS;
    $('.additional-attributes tr').each(function () {
      const label = $(this).find('th').text().trim();
      const value = $(this).find('td').text().trim();
      if (label.includes('梱包重量')) {
        const kg = parseFloat(value);
        if (kg > 0) {
          weightGrams = Math.round(kg * 1000);
          console.log(`📦 梱包重量: ${kg}kg = ${weightGrams}g`);
        }
      }
    });
    weightGrams += PACKAGING_EXTRA_GRAMS;
    console.log(`📦 含包材總重: ${weightGrams}g (+${PACKAGING_EXTRA_GRAMS}g)`);

    // ── 解析 Magento jsonConfig (色、尺寸、庫存、圖片) ──
    // jsonConfig 藏在 <script type="text/x-magento-init"> 裡面
    // 需要用 regex 搜尋 raw HTML（cheerio 可能因為區塊過大而丟失 text 內容）
    const scriptRegex =
      /<script\s+type="text\/x-magento-init"[^>]*>([\s\S]*?)<\/script>/gi;
    let jsonConfig: any = null;
    let scriptMatch: RegExpExecArray | null;
    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      const text = scriptMatch[1]!;
      if (!text.includes('jsonConfig')) continue;
      try {
        const parsed = JSON.parse(text);
        // 遞迴找到 jsonConfig
        const find = (obj: any, depth: number): any => {
          if (depth > 3 || !obj || typeof obj !== 'object') return null;
          if (obj.jsonConfig) return obj.jsonConfig;
          for (const val of Object.values(obj)) {
            const found = find(val, depth + 1);
            if (found) return found;
          }
          return null;
        };
        jsonConfig = find(parsed, 0);
        if (jsonConfig) break;
      } catch {
        // 非 JSON 或解析失敗，跳過
      }
    }

    if (!jsonConfig) {
      console.warn('⚠️ 找不到 jsonConfig，可能是簡單商品（無色/尺寸選項）');
      // 簡單商品：只有一個 variant
      const mainImg =
        $('meta[property="og:image"]').attr('content') ||
        $('img.gallery-placeholder__image').attr('src') ||
        '';
      return {
        title,
        sku,
        price,
        weightGrams,
        variants: [
          {
            color: 'ONE COLOR',
            image: mainImg,
            price,
            sizes: [{ name: 'F', isStock: true }],
          },
        ],
      };
    }

    // ── 建立屬性對照 ──
    const attributes: Record<string, any> = jsonConfig.attributes || {};
    let colorAttrId = '';
    let sizeAttrId = '';
    const colorMap: Record<string, string> = {};
    const sizeMap: Record<string, string> = {};

    for (const [attrId, attr] of Object.entries(attributes) as [
      string,
      any,
    ][]) {
      if (attr.code === 'color') {
        colorAttrId = attrId;
        for (const opt of attr.options || []) {
          colorMap[opt.id] = opt.label;
        }
      }
      if (attr.code === 'size') {
        sizeAttrId = attrId;
        for (const opt of attr.options || []) {
          sizeMap[opt.id] = opt.label;
        }
      }
    }

    // ── 建立庫存 Map ──
    // stocks: { [productId]: "在庫あり" | "完売" | "入荷待ち" | ... }
    const stocks: Record<string, string> = jsonConfig.stocks || {};
    const images: Record<string, any[]> = jsonConfig.images || {};
    const index: Record<string, Record<string, string>> = jsonConfig.index ||
    {};

    // 建立 per-color 的尺寸庫存 + 圖片
    const colorData = new Map<
      string,
      {
        label: string;
        image: string;
        sizes: Map<string, boolean>;
      }
    >();

    // 取得 color attribute options 的順序
    const colorOrder: string[] = (attributes[colorAttrId]?.options || []).map(
      (o: any) => String(o.id),
    );
    const sizeOrder: string[] = (attributes[sizeAttrId]?.options || []).map(
      (o: any) => String(o.id),
    );

    for (const [productId, attrs] of Object.entries(index)) {
      const colorId = attrs[colorAttrId];
      const sizeId = attrs[sizeAttrId];
      if (!colorId || !sizeId) continue;

      const colorLabel = colorMap[colorId] || colorId;
      const sizeLabel = sizeMap[sizeId] || sizeId;
      const stockStatus = stocks[productId] || '';
      // 「在庫あり」「在庫切れ※ご注文受付中」「入荷待ち」等都視為有貨（網站可加入購物車）
      // 只有「完売」才視為完售
      const inStock = !!stockStatus && !stockStatus.includes('完売');

      if (!colorData.has(colorId)) {
        // 取得此 colorId 的第一張圖片
        const imgs = images[productId];
        const imgUrl = imgs?.[0]?.full || imgs?.[0]?.img || '';
        colorData.set(colorId, {
          label: colorLabel,
          image: imgUrl,
          sizes: new Map(),
        });
      }

      colorData.get(colorId)!.sizes.set(sizeLabel, inStock);
    }

    // ── 收集所有尺寸（聯集），讓每個顏色都顯示完整尺寸清單 ──
    const allSizeLabels = new Set<string>();
    for (const data of colorData.values()) {
      for (const sizeLabel of data.sizes.keys()) {
        allSizeLabels.add(sizeLabel);
      }
    }

    // ── 組裝 Variants ──
    const variants = colorOrder
      .filter((cid) => colorData.has(cid))
      .map((cid) => {
        const data = colorData.get(cid)!;
        // 依尺寸順序排列；該顏色沒有的尺寸標記為完售
        const sizeList = sizeOrder
          .map((sid) => sizeMap[sid])
          .filter(
            (label): label is string => !!label && allSizeLabels.has(label),
          )
          .map((label) => ({
            name: label,
            isStock: data.sizes.get(label) ?? false,
          }));

        return {
          color: data.label,
          image: data.image,
          price,
          sizes: sizeList,
        };
      });

    console.log(
      `✅ RS Taichi 取得 ${variants.length} 個顏色 | 重量: ${weightGrams}g`,
    );

    return {
      title,
      sku,
      price,
      weightGrams,
      variants: variants.slice(0, 10),
    };
  } catch (err: any) {
    console.error('❌ RS Taichi 抓取失敗:', err.message);
    return null;
  }
};
