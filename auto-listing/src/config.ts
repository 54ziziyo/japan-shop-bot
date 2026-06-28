// ============================================================
// 設定載入與驗證
// auto-listing/src/config.ts
// ============================================================
// 從環境變數讀取 WooCommerce / Claude 設定並驗證。
// 執行時請用： npx tsx --env-file=.env auto-listing/src/listProduct.ts <url>
// （--env-file 會把專案根目錄的 .env 載入 process.env）

export interface WooConfig {
  storeUrl: string; // 例：https://roml-life.com（結尾不要斜線）
  consumerKey: string; // ck_xxx
  consumerSecret: string; // cs_xxx
}

export interface WpConfig {
  user: string; // WordPress 登入帳號（brian）
  appPassword: string; // 應用程式密碼（含空格沒關係）
}

export interface AppConfig {
  woo: WooConfig;
  /** WordPress 媒體上傳用（應用程式密碼）；沒填則圖片走 WooCommerce 由網址側載 */
  wp: WpConfig | null;
}

/** 讀取並驗證設定；缺少 WooCommerce 必要設定時直接報錯中止 */
export function loadConfig(): AppConfig {
  const storeUrl = (process.env.WC_STORE_URL || '').trim().replace(/\/+$/, '');
  const consumerKey = (process.env.WC_CONSUMER_KEY || '').replace(/\s+/g, '');
  const consumerSecret = (process.env.WC_CONSUMER_SECRET || '').replace(
    /\s+/g,
    '',
  );

  const missing: string[] = [];
  if (!storeUrl) missing.push('WC_STORE_URL');
  if (!consumerKey) missing.push('WC_CONSUMER_KEY');
  if (!consumerSecret) missing.push('WC_CONSUMER_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `❌ 缺少必要環境變數：${missing.join(', ')}\n` +
        `   請在專案根目錄 .env 補上後，用 --env-file=.env 執行。`,
    );
  }

  const wpUser = (process.env.WP_USER || '').trim();
  // 應用程式密碼內部空格是正常的，只去頭尾
  const wpAppPassword = (process.env.WP_APP_PASSWORD || '').trim();
  const wp: WpConfig | null =
    wpUser && wpAppPassword
      ? { user: wpUser, appPassword: wpAppPassword }
      : null;

  return {
    woo: { storeUrl, consumerKey, consumerSecret },
    wp,
  };
}
