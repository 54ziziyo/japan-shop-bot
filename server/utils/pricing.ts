// ============================================================
// 💱 Server 端 auto-import 入口（定價）
// ============================================================
// Nuxt 自動掃描 server/utils/，這裡只做 re-export。
// 所有邏輯的唯一來源在 shared/ 目錄。

export {
  JPY_SELL_RATE,
  RATE_MARKUP,
  parseJpy,
  jpyToTwd,
  formatTwd,
} from '#shared/pricing';
