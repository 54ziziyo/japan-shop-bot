// ============================================================
// 📦 Server 端 auto-import 入口（運費 & 重量）
// ============================================================
// Nuxt 自動掃描 server/utils/，這裡只做 re-export。
// 所有邏輯的唯一來源在 shared/ 目錄。

export {
  getCategoryWeight,
  getCategoryLabel,
  getShippingTwd,
  getDomesticShippingJpy,
  SERVICE_FEE_TWD,
  calculateQuote,
} from '#shared/shipping';

export type {
  CartItemForQuote,
  QuoteResult,
  DomesticShippingResult,
} from '#shared/shipping';
