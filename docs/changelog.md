# 更新紀錄

> 返回 [README](../README.md)

---

### 2026-04-18

**新增國際運費 1% 包材附加費**

- 查費率表得到的日幣運費再乘以 1.01（無條件進位）後才換算台幣
- 修改位置：`shared/shipping.ts` → `getShippingTwd()`
- 全專案自動生效（前台、結帳、LINE Bot 皆同步）

**新增最低利潤保護（`MIN_PROFIT_TWD = 100`）**

- 每件商品保證至少賺 NT$100
- 若加碼後利潤仍不足 → 售價 = 我方成本 + NT$100
- 修改位置：`shared/pricing.ts` → `jpyToTwd()`
- `/price` 頁面以 ⚠️ 標示觸發最低利潤保護的商品

**/price 頁面運費重量選項改為完整費率表**

- ePacket：100g 起每 100g 一格（共 20 個選項）
- 國際小包：1000g 起每 1000g 一格（共 30 個選項）

---

### 2026-04-17

**修正前端匯率快取導致頁面顯示過期匯率**

- **問題**：`useExchangeRate()` 的 `fetchRate()` 預設使用 24 小時 localStorage 快取，導致透過 `?force=1` 更新 Supabase 匯率後，前端頁面仍顯示舊匯率
- **影響範圍**：`/price`、`/estimate`、`/cart`、`/checkout` 四個頁面
- **修正方式**：
  - `composables/useExchangeRate.ts` — `fetchRate()` 新增 `{ skipCache: true }` 選項，可跳過 localStorage 直接從 API 取得最新匯率
  - `pages/price.vue`、`pages/estimate.vue`、`pages/cart.vue`、`pages/checkout.vue` — 全部改用 `fetchRate({ skipCache: true })`
  - localStorage 仍會寫入（作為離線 fallback），但不會優先讀取
- **效果**：手動 `?force=1` 更新匯率後，使用者重新開啟任何頁面即立即生效

**新增日本國內運費手動輸入欄位**

- `/price` 和 `/estimate` 頁面新增日本國內運費輸入框（自由輸入日幣金額）
- 輸入值即時加入費用計算

---

### 2026-04-16

**新增最低匯率下限（`MIN_JPY_RATE = 0.2`）**

- 新增 `shared/pricing.ts` → `MIN_JPY_RATE` 常數，統一管理最低匯率下限
- `jpyToTwd()`、`getShippingTwd()`、`getDomesticShippingJpy()` 全部套用 `Math.max(rate, MIN_JPY_RATE)`
- `useExchangeRate.ts`（前端）、`exchangeRate.ts`（後端） 同步套用

**重寫價格試算頁（`/price`）**

- 改用即時匯率（玉山銀行）而非硬編碼 0.2
- 計算邏輯改用 `shared/pricing.ts` 的 `getRateMarkup()` + `shared/shipping.ts` 的 `getShippingTwd()`
- 新增服務費 5% 與消費稅 5%（因開立發票）
- 重量選擇區分 ePacket / 國際小包，每個選項即時顯示運費
- UI 改為與其他 LIFF 頁面一致的綠色系 Tailwind 設計

**新增消費者價格試算頁（`/estimate`）**

- 簡化版試算器，僅顯示：商品售價、國際運費、服務費、消費稅、預估總計
- 不顯示匯率、加碼比例、運送方式等內部細節
- 重量選項用生活化描述（如「上衣・T恤」、「外套・褲子」）

---

### 2026-04-12

**新增日本國內運費功能**

- `shared/shipping.ts` 新增 `getDomesticShippingJpy()` 函式，依品牌計算國內運費
- BAPE / FR2：每個品牌固定 ¥400；UNIQLO / GU：品牌總額 < ¥4,990 時加收 ¥500
- 結帳頁費用明細新增「日本國內運費」獨立顯示列，帶品牌名稱
- `QuoteResult` 新增 `domesticShippingJpy` / `domesticShippingTwd` 欄位，`grandTotalTwd` 包含國內運費

**新增 Kushitani 禁止販售商品檢查**

- `brandConfig.ts` 新增 `KUSHITANI_BLOCKED_PIDS` 清單與 `isKushitaniBlocked()` 函式
- `webhook.post.ts` 在爬蟲前檢查禁售清單，命中時回覆提示

**新增 LINE 品牌分類選擇器**

- 「開始購物」改為先顯示分類選擇（潮牌服飾 / 重機部品），選擇後才顯示對應品牌輪播
- `shopCarousel.ts` 新增 `buildCategorySelector()` Flex Message

**新增 FR2 、 BAPE 品牌支援**

- FR2（fr2.tokyo）：Shopify JSON API 爬蟲，三層 variant 結構（ColorType→Color→Size）
- BAPE（jp.bape.com）：Shopify JSON API 爬蟲，二層 variant 結構（COLOR, SIZE）
- 兩者皆使用包材估重，category 存為 `fr2|{grams}` / `bape|{grams}`

**新增爬蟲健康檢查（`server/api/scraper-health.get.ts`）**

- 每日台灣時間 09:00 自動測試四個品牌爬蟲是否正常運作
- 任一品牌失敗時自動寄送警報 Email 給管理員
- 在 `vercel.json` 中新增對應 Cron Job 排程

**Supabase 客戶端改為單例模式（`server/utils/supabase.ts`）**

- 新增 `useSupabase()` 共用函式，同一個 Vercel 容器暖啟動期間只建立一次 client
- `webhook`、`submit-order`、`cancel-expired-orders`、`update-order-status`、`update-order-address` 五支 API 全面改用 `useSupabase()`，移除各自的 `createClient()` 呼叫

**新增 `@types/nodemailer` 型別宣告**

- `pnpm add -D @types/nodemailer`，消除 nodemailer 的 TypeScript 型別警告

**README 新增「維運與費用規劃」章節**

- 說明爬蟲監控機制、效能設計、Vercel 商業使用政策、Supabase 免費額度與費用總覽

---

### 2026-03-26

**新增 GU 商品支援（`server/utils/scrape/gu.ts`）**

- 新增 GU（gu-global.com）品牌爬蟲，與 Uniqlo 共用 Fast Retailing v5 API 架構
- `detectBrand()` 同時支援辨識 GU 網址，回傳 `'gu'` 品牌識別碼
- `sync-cart.post.ts` 新增 GU 商品同步分流邏輯

**新增 Kushitani 商品支援（`server/utils/scrape/kushitani.ts`）**

- 新增 Kushitani（kushitanionline.com）品牌爬蟲，解析 Color Me Shop 平台的 HTML 商品資料
- 自動提取顏色、尺寸、庫存狀態、商品重量（用於運費估算）
- `detectBrand()` 支援辨識 Kushitani 網址（`?pid=xxx` 格式），回傳 `'kushitani'`
- `extractKushitaniPid()` 從網址提取商品 PID
- 安全帽等特殊商品會提示聯繫客服，無法線上加購

**新增 Kushitani 自訂售價系統**

- 新增 `server/data/kushitani-pricing.json`：管理員可在 JSON 中設定特定型號的台幣含運直送售價
- 新增 `server/utils/kushitaniPricing.ts`：讀取 JSON 並提供 `getKushitaniCustomPrice(modelNumber)` 查詢函式
- `skipShipping: true` 的商品，結帳時不計算國際運費（`category` 儲存為 `kushitani|0`）
- `sync-cart.post.ts` 修正：購物車裡 `NT$` 開頭的自訂台幣售價，同步時不會被爬蟲日幣價覆蓋

**scraper 目錄重構**

- `server/utils/scrape/` 新目錄，統一放各品牌爬蟲（`uniqlo.ts` / `gu.ts` / `rstaichi.ts` / `kushitani.ts`）
- LINE 卡片產生器移至 `server/utils/line/cards/`（`uniqlo.ts` / `gu.ts` / `rstaichi.ts` / `kushitani.ts` / `index.ts`）

**`shared/pricing.ts` 新增 `parsePriceTwd()`**

- 新增智慧解析函式：`NT$` 開頭直接回傳台幣數字，其餘走正常日幣 × 匯率換算
- `cart.vue`、`checkout.vue`（ItemCard、PriceSummary）全面改用此函式，確保 Kushitani 自訂台幣售價全程顯示正確

**結帳頁費用明細更新（`components/checkout/PriceSummary.vue`）**

- 費用明細新增「營業稅（5%）」獨立顯示列，位於運費下方
- 訂單總計含稅邏輯不變

**`shared/shipping.ts` 新增 Kushitani 運費支援**

- `getCategoryWeight()` 新增 `kushitani|{grams}` 格式解析（`kushitani|0` 表示含運直送，重量為 0）
- `calculateQuote()` 更新：含 Kushitani 有重量商品時，強制使用國際小包
- `getCategoryLabel()` 新增 `kushitani` 對應中文標籤「重機部品」

---

### 2026-03-23

**RS Taichi 庫存狀態解析修正（`server/utils/scrapeRstaichi.ts`）**

- **Bug 1 修正**：原本 `inStock` 只認 `「在庫あり」` 為有貨，導致 `「在庫切れ※ご注文受付中」`（接受預購）被誤標為完售
  - 新邏輯：只有包含 `「完売」` 才視為完售；`在庫切れ※ご注文受付中`、`入荷待ち` 等都視為可購買
- **Bug 2 修正**：某顏色若在 Magento index 中沒有某尺寸的組合，該尺寸直接消失，不顯示在 LINE 卡片上
  - 新邏輯：收集所有顏色的尺寸聯集，讓每個顏色都展示完整尺寸列表，缺少的組合標記為「完售」

**RS Taichi 包材重量修正（`shared/shipping.ts`）**

- `getCategoryWeight` 對 `rstaichi|{grams}` 格式的商品，在實際重量基礎上**額外加 500g** 作為包材緩衝
