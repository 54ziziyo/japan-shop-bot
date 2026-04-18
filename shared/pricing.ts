// ============================================================
// 💱 日幣 → 台幣 定價計算（唯一來源）
// ============================================================
// server 與 client 都透過 #shared/pricing 引用此檔案。

/** 預設日本賣出匯率 */
export const JPY_SELL_RATE = 0.205;

/** 最低匯率下限 — 即使玉山匯率低於此值，仍以此為準 */
export const MIN_JPY_RATE = 0.2;

/** 最低利潤下限（台幣）— 單件商品利潤低於此值時，強制補足至此金額 */
export const MIN_PROFIT_TWD = 100;

/**
 * 解析日幣字串為數字
 * e.g. "¥1,990" → 1990
 */
export function parseJpy(priceStr: string): number {
  return parseInt((priceStr || '').replace(/[^\d]/g, '')) || 0;
}

export function getRateMarkup(jpyPrice: number): number {
  if (jpyPrice <= 990) return 0.1;
  if (jpyPrice <= 1990) return 0.09;
  if (jpyPrice <= 2990) return 0.03;
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
  const baseCost = Math.round(jpyPrice * baseRate);
  const rawResult = Math.round(jpyPrice * finalRate);
  const profit = rawResult - baseCost;
  const result =
    profit < MIN_PROFIT_TWD ? baseCost + MIN_PROFIT_TWD : rawResult;

  console.log(
    `💱 jpyToTwd: ¥${jpyPrice} × ${finalRate.toFixed(4)} = NT$${rawResult}（利潤 NT$${profit}${profit < MIN_PROFIT_TWD ? ` → 補足至 NT$${MIN_PROFIT_TWD}，售價 NT$${result}` : ''}）${rate ? '' : ' ⚠️ 使用預設匯率'}`,
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
