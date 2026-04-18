// ============================================================
// 💱 客戶端 auto-import 入口
// ============================================================
// Nuxt 自動掃描 utils/ 目錄，這裡只做 re-export。
// 所有邏輯的唯一來源在 shared/ 目錄。

// 定價
export {
  JPY_SELL_RATE,
  MIN_JPY_RATE,
  MIN_PROFIT_TWD,
  parseJpy,
  getRateMarkup,
  jpyToTwd,
  formatTwd,
  parsePriceTwd,
} from '#shared/pricing';

// 運費 & 重量
export {
  getCategoryWeight,
  getCategoryLabel,
  getShippingTwd,
  getDomesticShippingJpy,
  SERVICE_FEE_TWD,
  calculateQuote,
} from '#shared/shipping';

// 型別
export type {
  CartItemForQuote,
  QuoteResult,
  DomesticShippingResult,
} from '#shared/shipping';
