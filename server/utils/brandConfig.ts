// ============================================================
// 🏷️ 品牌設定（所有品牌的 URL 匹配、路由與限制）
// ============================================================

/** 品牌識別碼 */
export type BrandId = 'uniqlo' | 'rstaichi';

/** 禁止販售的 RsTaichi 商品（含電池、酒精、油類、液體等國際郵寄違禁品） */
export const RSTAICHI_BLOCKED_SKUS = new Set([
  'rsp501',
  'rsp516',
  'rsp510',
  'rsp511',
  'rsp064',
  'rsp065',
  'rsa070',
]);

/** RsTaichi 安全帽型號前綴（需專人報價，不提供線上加購） */
export const RSTAICHI_HELMET_PREFIXES = ['hjh', 'hja', 'hjp'];

/**
 * 從 URL 辨識品牌
 * @returns BrandId 或 null（不支援的品牌）
 */
export function detectBrand(url: string): BrandId | null {
  if (/(?:www\.)?uniqlo\.com\/[^\s]*\/products\/E[^\s]*/i.test(url))
    return 'uniqlo';
  if (/(?:www\.)?gu-global\.com\/[^\s]*\/products\/E[^\s]*/i.test(url))
    return 'uniqlo';
  if (/(?:www\.)?ec\.rs-taichi\.com\/[a-z0-9]+\.html/i.test(url))
    return 'rstaichi';
  return null;
}

/**
 * 從 URL 提取 RsTaichi 商品 SKU（例如 rsj334）
 */
export function extractRstaichiSku(url: string): string | null {
  const m = url.match(/ec\.rs-taichi\.com\/([a-z0-9]+)\.html/i);
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * 檢查 RsTaichi 商品是否為禁售品
 */
export function isRstaichiBlocked(sku: string): 'prohibited' | 'helmet' | null {
  const lower = sku.toLowerCase();
  if (RSTAICHI_BLOCKED_SKUS.has(lower)) return 'prohibited';
  for (const prefix of RSTAICHI_HELMET_PREFIXES) {
    if (lower.startsWith(prefix)) return 'helmet';
  }
  return null;
}
