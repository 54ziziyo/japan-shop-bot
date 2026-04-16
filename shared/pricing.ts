// ============================================================
// 💱 日幣 → 台幣 定價計算（唯一來源）
// ============================================================
// server 與 client 都透過 #shared/pricing 引用此檔案。

/** 預設日本賣出匯率 */
export const JPY_SELL_RATE = 0.205;

/** 最低匯率下限 — 即使玉山匯率低於此值，仍以此為準 */
export const MIN_JPY_RATE = 0.2;

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
 * 公式: JPY × [台銀現金賣出匯率 + 階級加碼]
 * @param jpyPrice 日幣價格
 * @param rate     台銀現金賣出匯率（可選，預設使用 JPY_SELL_RATE）
 */
export function jpyToTwd(jpyPrice: number, rate?: number): number {
  if (jpyPrice <= 0) return 0;
  const baseRate = Math.max(rate ?? JPY_SELL_RATE, MIN_JPY_RATE);
  const markup = getRateMarkup(jpyPrice);
  const finalRate = baseRate + markup;
  const result = Math.round(jpyPrice * finalRate);

  console.log(
    `💱 jpyToTwd: ¥${jpyPrice} × (${baseRate} + ${markup}) = ¥${jpyPrice} × ${finalRate.toFixed(4)} = NT$${result}${rate ? '' : ' ⚠️ 使用預設匯率'}`,
  );

  return result;
}

/** 格式化台幣顯示 */
export function formatTwd(amount: number): string {
  return `NT$${amount.toLocaleString()}`;
}

/**
 * 智慧解析商品價格 → 台幣數字
 * - "NT$7920"  → 直接回傳 7920（自訂台幣售價，不做匯率換算）
 * - "¥1,990"  → jpyToTwd(1990, rate)（日幣，正常換算）
 */
export function parsePriceTwd(priceStr: string, rate?: number): number {
  if ((priceStr || '').startsWith('NT$')) {
    return parseInt(priceStr.replace(/[^\d]/g, ''), 10) || 0;
  }
  return jpyToTwd(parseJpy(priceStr), rate);
}
