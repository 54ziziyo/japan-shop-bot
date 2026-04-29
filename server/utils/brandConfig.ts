// ============================================================
// 🏷️ 品牌設定（所有品牌的 URL 匹配、路由與限制）
// ============================================================

/** 品牌識別碼 */
export type BrandId =
  | 'uniqlo'
  | 'gu'
  | 'rstaichi'
  | 'kushitani'
  | 'fr2'
  | 'bape'
  | 'aape';

/** 禁止販售的 RsTaichi 商品（含電池、酒精、油類、液體等國際郵寄違禁品） */
export const RSTAICHI_BLOCKED_SKUS = new Set([
  'rsp501',
  'rsp516',
  'rsp510',
  'rsp511',
  'rsp064',
  'rsp065',
  'rsa070',
  'tsv001',
  'nxp001',
  'nxp007',
  'rso012',
  'rso013',
  'rso016',
]);

/** RsTaichi 安全帽型號前綴（需專人報價，不提供線上加購） */
export const RSTAICHI_HELMET_PREFIXES = ['hjh', 'hja', 'hjp'];

/** 禁止販售的 Kushitani 商品（含電池、酒精、油類、液體等國際郵寄違禁品） */
export const KUSHITANI_BLOCKED_PIDS = new Set([
  'k-8226',
  'k-8227',
  'k-8228',
  'k-8229',
  'k-8230',
  'k-8231',
  'k-8232',
  'ex-4233',
]);

/**
 * 從 URL 辨識品牌
 * @returns BrandId 或 null（不支援的品牌）
 */
export function detectBrand(url: string): BrandId | null {
  if (/(?:www\.)?uniqlo\.com\/jp\/[^\s]*\/products\/E[^\s]*/i.test(url))
    return 'uniqlo';
  if (/(?:www\.)?gu-global\.com\/jp\/[^\s]*\/products\/E[^\s]*/i.test(url))
    return 'gu';
  if (/(?:www\.)?ec\.rs-taichi\.com\/[a-z0-9]+\.html/i.test(url))
    return 'rstaichi';
  if (/(?:www\.)?kushitanionline\.com\/.*[?&]pid=\d+/i.test(url))
    return 'kushitani';
  if (/(?:www\.)?fr2\.tokyo\/.*products\/[a-z0-9-]+/i.test(url)) return 'fr2';
  if (
    /(?:www\.)?jp\.bape\.com\/.*products\/[a-z0-9-]+/i.test(url) ||
    /(?:www\.)?bapepirate\.com\/products\/[a-z0-9-]+/i.test(url)
  )
    return 'bape';
  // /item/{itemId}.html 或 /category/{type}/{itemId}.html
  if (/(?:www\.)?aape\.jp\/(?:item|category\/[^/]+)\/\d+\.html/i.test(url))
    return 'aape';
  return null;
}

/**
 * 偵測已知品牌的非日本版官網 URL
 * 僅在 detectBrand() 返回 null 時才需呼叫
 */
export function detectNonJapaneseSite(
  url: string,
): { brandName: string; jpUrl: string } | null {
  // BAPE：jp.bape.com / bapepirate.com 以外的所有 bape.com 網域
  // 涵蓋全球版 bape.com、www.bape.com、kr.bape.com、us.bape.com 等
  // （bapepirate.com 字串中不含 bape.com，不需額外排除）
  if (url.includes('bape.com') && !url.includes('jp.bape.com')) {
    return { brandName: 'BAPE', jpUrl: 'https://jp.bape.com/' };
  }
  // Uniqlo：有 /products/ 但路徑非 /jp/（美國、英國、台灣等官網）
  if (
    /uniqlo\.com/i.test(url) &&
    /\/products\//i.test(url) &&
    !/uniqlo\.com\/jp\//i.test(url)
  ) {
    return { brandName: 'Uniqlo', jpUrl: 'https://www.uniqlo.com/jp/ja/' };
  }
  // GU：有 /products/ 但路徑非 /jp/
  if (
    /gu-global\.com/i.test(url) &&
    /\/products\//i.test(url) &&
    !/gu-global\.com\/jp\//i.test(url)
  ) {
    return { brandName: 'GU', jpUrl: 'https://www.gu-global.com/jp/ja/' };
  }
  // AAPE：非 aape.jp 的 AAPE 網域（aape.com / www.aape.com 等全球網域）
  // 原 /(?:^|\.)aape\.com/ 正則對 https://aape.com/... 無法匹配（:// 後非 . 亦非字串開頭）
  if (url.includes('aape.com')) {
    return { brandName: 'AAPE', jpUrl: 'https://aape.jp/' };
  }
  return null;
}

/**
 * 從 URL 提取 Kushitani 商品 PID
 */
export function extractKushitaniPid(url: string): string | null {
  const m = url.match(/[?&]pid=(\d+)/);
  return m ? m[1]! : null;
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
/**
 * 從 URL 提取 FR2 商品 handle
 */
export function extractFr2Handle(url: string): string | null {
  const m = url.match(/fr2\.tokyo\/.*products\/([a-z0-9-]+)/i);
  return m ? m[1]! : null;
}

/**
 * 從 URL 提取 BAPE 商品 handle（jp.bape.com 與 bapepirate.com 均支援）
 */
export function extractBapeHandle(url: string): string | null {
  const m = url.match(
    /(?:jp\.bape\.com|bapepirate\.com)\/.*products\/([a-z0-9-]+)/i,
  );
  return m ? m[1]! : null;
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

/**
 * 檢查 Kushitani 商品是否為禁售品
 */
export function isKushitaniBlocked(pid: string): boolean {
  return KUSHITANI_BLOCKED_PIDS.has(pid.toLowerCase());
}
