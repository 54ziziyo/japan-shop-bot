// server/api/sync-cart.post.ts
// 結帳前同步檢查：重新驗證每個購物車商品的「價格」和「庫存」
import axios from 'axios';
import https from 'node:https';
import { scrapeRstaichi } from '../utils/scrapeRstaichi';
import { detectBrand } from '../utils/brandConfig';

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const api = axios.create({
  httpsAgent: keepAliveAgent,
  timeout: 8000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: 'https://www.uniqlo.com/',
  },
});

interface CartItem {
  product_code: string;
  color: string;
  size: string;
  price: string;
  product_url?: string;
}

interface SyncResult {
  product_code: string;
  color: string;
  size: string;
  currentPrice: string;
  inStock: boolean;
  isPromo: boolean;
  promoEndTs: number | null;
  priceChanged: boolean;
  stockChanged: boolean;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const items: CartItem[] = body?.items || [];

  if (!items.length) return { results: [], hasChanges: false };

  // 按品牌分流
  const uniqloItems: CartItem[] = [];
  const rstaichiItems: CartItem[] = [];
  for (const item of items) {
    const brand = item.product_url ? detectBrand(item.product_url) : 'uniqlo';
    if (brand === 'rstaichi') {
      rstaichiItems.push(item);
    } else {
      uniqloItems.push(item);
    }
  }

  const allResults: SyncResult[] = [];

  // ── RS TAICHI 同步：重新抓取商品頁驗證價格和庫存 ──
  if (rstaichiItems.length) {
    // 按商品 URL 分組（同一商品只抓一次）
    const byUrl = new Map<string, CartItem[]>();
    for (const item of rstaichiItems) {
      const url = item.product_url || '';
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url)!.push(item);
    }

    const rstResults = await Promise.all(
      [...byUrl.entries()].map(async ([url, cartItems]) => {
        try {
          const product = await scrapeRstaichi(url);
          if (!product) throw new Error('scrape failed');

          const results: SyncResult[] = [];
          for (const item of cartItems) {
            // 找到對應的 variant (by color) 和 size
            const variant = product.variants.find(
              (v: any) => v.color === item.color,
            );
            const sizeInfo = variant?.sizes.find(
              (s: any) => s.name === item.size,
            );

            // variant.price 已包含 ¥ 前綴（如 "¥23980"），直接使用
            const currentPrice = variant ? variant.price : item.price;
            const inStock = sizeInfo?.isStock ?? false;
            const priceChanged = currentPrice !== item.price;

            results.push({
              product_code: item.product_code,
              color: item.color,
              size: item.size,
              currentPrice,
              inStock,
              isPromo: false,
              promoEndTs: null,
              priceChanged,
              stockChanged: !inStock,
            });
          }
          return results;
        } catch (err: any) {
          console.error(`❌ sync-cart RsTaichi: ${url} 失敗:`, err.message);
          return cartItems.map((item) => ({
            product_code: item.product_code,
            color: item.color,
            size: item.size,
            currentPrice: item.price,
            inStock: false,
            isPromo: false,
            promoEndTs: null,
            priceChanged: false,
            stockChanged: true,
          }));
        }
      }),
    );

    allResults.push(...rstResults.flat());
  }

  // ── UNIQLO 同步 ──
  if (!uniqloItems.length) {
    const hasChanges = allResults.some((r) => r.priceChanged || r.stockChanged);
    console.log(
      `🔄 sync-cart: ${items.length} 項檢查完成, hasChanges=${hasChanges}`,
    );
    return { results: allResults, hasChanges };
  }

  const BASE = 'https://www.uniqlo.com/jp/api/commerce/v5/ja';

  // 從 product_url 提取 price group（e.g. ".../E481040-000/02" → "02"）
  function extractPG(url?: string): string {
    if (!url) return '00';
    const m = url.match(/products\/E\d+-\d+\/(\d+)/);
    return m?.[1] || '00';
  }

  // 1. 按 「商品代碼 + price group」 分組（同商品同 PG 只查一次 API）
  const grouped = new Map<string, { pg: string; items: CartItem[] }>();
  for (const item of uniqloItems) {
    const code = item.product_code;
    if (!code) continue;
    const pg = extractPG(item.product_url);
    const key = `${code}|${pg}`;
    if (!grouped.has(key)) grouped.set(key, { pg, items: [] });
    grouped.get(key)!.items.push(item);
  }

  // 2. 並行取得所有不重複商品的「詳情 + 庫存 + L2s」
  const groupEntries = [...grouped.entries()];
  const fetchResults = await Promise.all(
    groupEntries.map(async ([key, { pg }]) => {
      const rawCode = key.split('|')[0]!;
      try {
        const [detailRes, stockRes, l2sRes] = await Promise.all([
          api
            .get(
              `${BASE}/products/${rawCode}/price-groups/${pg}/details?httpFailure=true`,
            )
            .catch(() => null),
          api
            .get(
              `${BASE}/products/${rawCode}/price-groups/${pg}/stock?httpFailure=true`,
            )
            .catch(() => null),
          api
            .get(
              `${BASE}/products/${rawCode}/price-groups/${pg}/l2s?httpFailure=true`,
            )
            .catch(() => null),
        ]);
        return {
          key,
          detail: detailRes?.data?.result || null,
          stockData: stockRes?.data?.result || {},
          l2sList: l2sRes?.data?.result?.l2s || [],
        };
      } catch (err: any) {
        console.error(`❌ sync-cart: ${key} 取得失敗:`, err.message);
        return { key, detail: null, stockData: {}, l2sList: [] };
      }
    }),
  );

  // 3. 對每個購物車項目，用 stock API 精確判斷庫存

  for (const { key, detail, stockData, l2sList } of fetchResults) {
    const rawCode = key.split('|')[0]!;
    const cartItems = grouped.get(key)?.items || [];

    if (!detail) {
      // API 失敗：標記為商品可能已下架
      for (const item of cartItems) {
        allResults.push({
          product_code: rawCode,
          color: item.color,
          size: item.size,
          currentPrice: item.price,
          inStock: false,
          isPromo: false,
          promoEndTs: null,
          priceChanged: false,
          stockChanged: true,
        });
      }
      continue;
    }

    // 建立 l2Id → { colorDC, sizeDC } 映射
    const l2Map = new Map<string, { colorDC: string; sizeDC: string }>();
    for (const entry of l2sList) {
      l2Map.set(entry.l2Id, {
        colorDC: entry.color.displayCode,
        sizeDC: entry.size.displayCode,
      });
    }

    // 建立 per-color-size stock: "colorDC|sizeDC" → boolean
    const stockSet = new Set<string>();
    for (const [l2Id, stock] of Object.entries(stockData)) {
      if ((stock as any)?.statusCode !== 'IN_STOCK') continue;
      const mapping = l2Map.get(l2Id);
      if (mapping) stockSet.add(`${mapping.colorDC}|${mapping.sizeDC}`);
    }

    // 尺寸名稱 → displayCode 對照表
    const sizeMap = new Map<string, string>();
    for (const s of detail.sizes || []) {
      sizeMap.set(s.name, s.displayCode);
    }

    // 價格和促銷資訊
    const baseVal = detail.prices?.base?.value;
    const currentPrice = baseVal ? `¥${baseVal}` : '';
    const priceFlags: any[] = detail.representative?.flags?.priceFlags || [];
    const limitedFlag = priceFlags.find((f: any) => f.code === 'limitedOffer');
    const isPromo = !!limitedFlag;
    const promoEndTs: number | null = limitedFlag?.effectiveTime?.end || null;

    for (const item of cartItems) {
      const colorDC = item.color.split(' ')[0] || ''; // "34" from "34 BROWN"
      const sizeDC = sizeMap.get(item.size);

      const inStock = sizeDC ? stockSet.has(`${colorDC}|${sizeDC}`) : false;

      const itemPrice = currentPrice || item.price;
      const priceChanged = itemPrice !== item.price;

      allResults.push({
        product_code: rawCode,
        color: item.color,
        size: item.size,
        currentPrice: itemPrice,
        inStock,
        isPromo,
        promoEndTs,
        priceChanged,
        stockChanged: !inStock,
      });
    }
  }

  const hasChanges = allResults.some((r) => r.priceChanged || r.stockChanged);

  console.log(
    `🔄 sync-cart: ${items.length} 項檢查完成, hasChanges=${hasChanges}`,
  );

  return { results: allResults, hasChanges };
});
