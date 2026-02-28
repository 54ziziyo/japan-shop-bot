// ============================================================
// 💱 日幣 → 台幣 定價計算（唯一來源）
// ============================================================
// server 與 client 都透過 #shared/pricing 引用此檔案。

/** 預設日本賣出匯率 */
export const JPY_SELL_RATE = 0.205;

/** 匯率加碼（0.205 + 0.035 = 0.24） */
export const RATE_MARKUP = 0.035;

// ── 工具函式 ──

/**
 * 解析日幣字串為數字
 * e.g. "¥1,990" → 1990
 */
export function parseJpy(priceStr: string): number {
  return parseInt((priceStr || '').replace(/[^\d]/g, '')) || 0;
}

/**
 * 商品定價費率（依日幣價格區間）
 *   ¥0 ~ ¥3,000   → 10%
 *   ¥3,001 ~ ¥10,000  → 8%
 *   ¥10,001 ~ ¥20,000 → 6%
 *   ¥20,001 以上    → 5%
 */
function getServiceRate(jpyPrice: number): number {
  if (jpyPrice <= 3000) return 0.1;
  if (jpyPrice <= 10000) return 0.08;
  if (jpyPrice <= 20000) return 0.06;
  return 0.05;
  // if (jpyPrice <= 1000) return 0.09;
  // if (jpyPrice <= 2000) return 0.085;
  // if (jpyPrice <= 3000) return 0.08;
  // if (jpyPrice <= 4000) return 0.015;
  // if (jpyPrice <= 5000) return 0.014;
  // if (jpyPrice <= 6000) return 0.013;
  // if (jpyPrice <= 7000) return 0.012;
  // if (jpyPrice <= 8000) return 0.011;
  // if (jpyPrice <= 9000) return 0.01;
  // if (jpyPrice <= 10000) return 0.009;
  // if (jpyPrice <= 20000) return 0.008;
  // return 0.007;
}

/**
 * 日幣商品價格 → 台幣商品價格
 * 公式: JPY × (匯率 + 加碼) + JPY × 服務費率
 */
export function jpyToTwd(jpyPrice: number): number {
  if (jpyPrice <= 0) return 0;
  const rate = JPY_SELL_RATE + RATE_MARKUP; // 0.24
  const base = jpyPrice * rate;
  const service = jpyPrice * getServiceRate(jpyPrice);
  return Math.round(base + service);
}

/** 格式化台幣顯示 */
export function formatTwd(amount: number): string {
  return `NT$${amount.toLocaleString()}`;
}
