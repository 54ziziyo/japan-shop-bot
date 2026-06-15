// server/middleware/rate-limit.ts
// 速率限制：防止 admin API 暴力破解 & 折扣碼枚舉攻擊
//
// 限制規則：
//   /api/admin/* → 每個 IP 每分鐘最多 15 次請求（登入嘗試不超過 15 次）
//   /api/validate-coupon → 每個 IP 每分鐘最多 10 次請求

type RateBucket = { count: number; resetAt: number };

// 使用 Map 做記憶體內計數器
// ⚠️ Vercel 無狀態部署：只在同一個 Lambda 暖啟動期間有效，
//    但已足夠阻擋自動化腳本；跨 Lambda 攻擊需升級 Vercel KV
const adminBuckets = new Map<string, RateBucket>();
const couponBuckets = new Map<string, RateBucket>();

const ADMIN_LIMIT = 15;
const COUPON_LIMIT = 10;
const WINDOW_MS = 60_000; // 1 分鐘

function checkLimit(map: Map<string, RateBucket>, ip: string, limit: number): boolean {
  const now = Date.now();
  const entry = map.get(ip);

  if (!entry || now > entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true; // 允許
  }

  if (entry.count >= limit) return false; // 超限

  entry.count++;
  return true; // 允許
}

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname;

  // 取得真實 IP（Vercel 會在 x-forwarded-for 傳入原始 IP）
  const forwarded = getRequestHeader(event, 'x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0].trim() || '0.0.0.0';

  if (path.startsWith('/api/admin/')) {
    if (!checkLimit(adminBuckets, ip, ADMIN_LIMIT)) {
      throw createError({
        statusCode: 429,
        statusMessage: '請求過於頻繁，請一分鐘後再試',
      });
    }
  }

  if (path === '/api/validate-coupon') {
    if (!checkLimit(couponBuckets, ip, COUPON_LIMIT)) {
      throw createError({
        statusCode: 429,
        statusMessage: '請求過於頻繁，請一分鐘後再試',
      });
    }
  }
});
