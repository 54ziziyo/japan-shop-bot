// ============================================================
// 💱 日幣 → 台幣 定價計算（唯一來源）
// ============================================================
// server 與 client 都透過 #shared/pricing 引用此檔案。

/** 預設日本賣出匯率 */
export const JPY_SELL_RATE = 0.205;

/**
 * 解析日幣字串為數字
 * e.g. "¥1,990" → 1990
 */
export function parseJpy(priceStr: string): number {
  return parseInt((priceStr || '').replace(/[^\d]/g, '')) || 0;
}

export function getRateMarkup(jpyPrice: number): number {
  if (jpyPrice <= 990) return 0.07;
  if (jpyPrice <= 1990) return 0.06;
  if (jpyPrice <= 2990) return 0.0289;
  if (jpyPrice <= 3990) return 0.025;
  if (jpyPrice <= 4990) return 0.023;
  if (jpyPrice <= 5990) return 0.022;
  return 0.02;
}

/**
 * 日幣商品價格 → 台幣商品價格
 * 公式: JPY × [階級匯率 + 加碼]
 */
export function jpyToTwd(jpyPrice: number): number {
  if (jpyPrice <= 0) return 0;
  // 取得該區間的加碼值
  const markup = getRateMarkup(jpyPrice);

  // 最終套用的報價匯率 (例如: 0.205 + 0.045 = 0.25) 0.05
  const finalRate = JPY_SELL_RATE + markup;

  return Math.round(jpyPrice * finalRate);
}

/** 格式化台幣顯示 */
export function formatTwd(amount: number): string {
  return `NT$${amount.toLocaleString()}`;
}
