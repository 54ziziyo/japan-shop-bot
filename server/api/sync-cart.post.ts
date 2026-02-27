// server/api/sync-cart.post.ts
// 結帳前同步檢查：重新驗證每個購物車商品的「價格」和「庫存」
import axios from 'axios';

interface CartItem {
  product_code: string;
  color: string;
  size: string;
  price: string;
}

interface SyncResult {
  product_code: string;
  color: string;
  size: string;
  currentPrice: string;
  inStock: boolean;
  isPromo: boolean;
  priceChanged: boolean;
  stockChanged: boolean;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const items: CartItem[] = body?.items || [];

  if (!items.length) return { results: [], hasChanges: false };

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.uniqlo.com/',
  };

  const BASE = 'https://www.uniqlo.com/jp/api/commerce/v5/ja';

  // 1. 按商品代碼分組（同商品只查一次 API）
  const grouped = new Map<string, CartItem[]>();
  for (const item of items) {
    const code = item.product_code;
    if (!code) continue;
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code)!.push(item);
  }

  // 2. 並行取得所有不重複商品的詳情（同時查 price-group 00 和 01）
  const productEntries = [...grouped.entries()];
  const detailResults = await Promise.all(
    productEntries.map(async ([rawCode]) => {
      try {
        // 同一商品可能有多個 price group（不同顏色不同價格）
        const [pg00, pg01] = await Promise.all([
          axios
            .get(
              `${BASE}/products/${rawCode}/price-groups/00/details?httpFailure=true`,
              { headers },
            )
            .catch(() => null),
          axios
            .get(
              `${BASE}/products/${rawCode}/price-groups/01/details?httpFailure=true`,
              { headers },
            )
            .catch(() => null),
        ]);
        const results = [pg00?.data?.result, pg01?.data?.result].filter(
          Boolean,
        );
        return { rawCode, results, error: null };
      } catch (err: any) {
        console.error(`❌ sync-cart: ${rawCode} 詳情取得失敗:`, err.message);
        return { rawCode, results: [], error: err.message };
      }
    }),
  );

  // 3. 對每個商品，檢查每個購物車項目的庫存
  const allResults: SyncResult[] = [];

  for (const { rawCode, results } of detailResults) {
    const cartItems = grouped.get(rawCode) || [];

    if (!results.length) {
      // API 失敗：標記為商品可能已下架
      for (const item of cartItems) {
        allResults.push({
          product_code: rawCode,
          color: item.color,
          size: item.size,
          currentPrice: item.price,
          inStock: false,
          isPromo: false,
          priceChanged: false,
          stockChanged: true,
        });
      }
      continue;
    }

    // 建立 colorCode → priceGroupResult 的對照表
    const colorToPG = new Map<string, any>();
    for (const pgResult of results) {
      for (const c of pgResult.colors || []) {
        colorToPG.set(c.displayCode, pgResult);
      }
    }

    // 合併所有 price group 的尺寸對照表
    const sizeMap = new Map<string, string>();
    for (const pgResult of results) {
      for (const s of pgResult.sizes || []) {
        sizeMap.set(s.name, s.displayCode);
      }
    }

    // 並行檢查該商品所有項目的庫存
    const stockChecks = await Promise.all(
      cartItems.map(async (item) => {
        const colorDC = item.color.split(' ')[0]; // "08" from "08 DARK GRAY"
        const sizeDC = sizeMap.get(item.size);

        if (!sizeDC) {
          return { item, inStock: false };
        }

        try {
          const stockUrl = `${BASE}/products?productIds=${rawCode}&colorCodes=COL${colorDC}&sizeCodes=SMA${sizeDC}&offset=0&limit=1&httpFailure=true`;
          const res = await axios.get(stockUrl, { headers });
          const inStock = (res.data?.result?.items?.length ?? 0) > 0;
          return { item, inStock };
        } catch {
          return { item, inStock: false };
        }
      }),
    );

    for (const { item, inStock } of stockChecks) {
      // 找到該顏色對應的 price group 結果
      const colorDC = item.color.split(' ')[0] || '';
      const pgResult = colorToPG.get(colorDC) || results[0]!;

      const baseVal = pgResult.prices?.base?.value;
      const currentPrice = baseVal ? `¥${baseVal}` : item.price;

      const priceFlags: any[] =
        pgResult.representative?.flags?.priceFlags || [];
      const isPromo = priceFlags.some((f: any) => f.code === 'limitedOffer');

      const priceChanged = currentPrice !== item.price;

      allResults.push({
        product_code: rawCode,
        color: item.color,
        size: item.size,
        currentPrice,
        inStock,
        isPromo,
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
