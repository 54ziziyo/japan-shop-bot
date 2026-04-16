# 擴充指南

> 返回 [README](../README.md)

---

## 擴充支援新品牌

目前支援 **Uniqlo、GU、RS Taichi、Kushitani、FR2、BAPE** 六個品牌。若要新增第七個品牌，需修改以下部分：

### 1. 新增 scraper（`server/utils/scrape/xxx.ts`）

仿照現有 scraper，實作 `scrapeXxx(url)` 函式，解析目標網站 API 或 HTML，回傳統一的商品資料格式。

### 2. 新增 LINE 卡片產生器（`server/utils/line/cards/xxx.ts`）

仿照 `uniqlo.ts` 或 `kushitani.ts`（Overlay 設計），實作 `buildXxxCards()` 函式，並在 `cards/index.ts` 重新匯出。

### 3. 更新 `server/utils/brandConfig.ts`

在 `BrandId` 型別加入新品牌，並在 `detectBrand()` 新增網址匹配規則。

### 4. 更新 `server/api/webhook.post.ts`

在 URL 路由區塊新增分流，呼叫對應的 scraper 和卡片產生器。

### 5. 更新重量估算（`shared/shipping.ts`）

在 `getCategoryWeight()` 新增品牌格式解析，在 `calculateQuote()` 更新是否強制國際小包的條件。

### 6. 更新 `server/api/sync-cart.post.ts`

新增品牌的購物車同步分流（重新抓取價格和庫存）。

---

## 系統連動修改對照表

修改某項功能時，需一併更新的外部系統整理如下：

| 修改項目                               | 需同步更新的地方                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **新增訂單狀態**                       | ① `update-order-status.post.ts` → `ALLOWED_STATUSES`<br>② `orders.vue` → `STATUS_LABELS`、`statusBadgeClass`、`statusEmoji`<br>③ Google 試算表 → H 欄「狀態」下拉選單資料驗證<br>④（可選）LINE 通知訊息文字                                           |
| **更換銀行帳號**                       | ① `submit-order.post.ts` → `BANK_*`<br>② `components/checkout/OrderForm.vue` → `BANK_*`、`BANK_ACCOUNT_NAME`<br>③ `components/checkout/Success.vue` → `BANK_*`<br>④ `pages/orders.vue` → `BANK_*`                                                     |
| **變更截單時間（22:00）**              | ① `webhook.post.ts` → `promoWarning` 字串<br>② `components/checkout/OrderForm.vue` → 截單提醒文字                                                                                                                                                     |
| **更換 LINE Bot（換帳號或 Channel）**  | ① Vercel 環境變數 → `LINE_ACCESS_TOKEN`、`LINE_SECRET`<br>② LINE Developers → Webhook URL 設為 `https://your-domain/api/webhook`<br>③ LINE Developers → LIFF App，更新各 `LIFF_ID`<br>④ `nuxt.config.ts` → `public.liffIdCart`、`public.liffIdOrders` |
| **更換 Supabase 專案**                 | ① Vercel 環境變數 → `SUPABASE_URL`、`SUPABASE_ANON_KEY`<br>② 重新執行建表 SQL（`orders`、`cart_items`、`exchange_rates`）<br>③ 確認 RLS 政策（`anon` 角色的讀寫權限）                                                                                 |
| **更換 Google 帳號（試算表服務帳號）** | ① Google Cloud → 建立新服務帳號，下載 JSON 金鑰<br>② Vercel 環境變數 → `GOOGLE_SERVICE_ACCOUNT_JSON`（整個 JSON 字串）<br>③ 新增服務帳號 email 為試算表的「編輯者」<br>④ Apps Script → 腳本需在相同 Google 帳號的 Google Sheet 內執行                 |
| **更換 Google 試算表**                 | ① Vercel 環境變數 → `SHEETS_SPREADSHEET_ID`、`SHEETS_SHEET_NAME`<br>② 新試算表需設定 A–J 欄標題<br>③ H 欄資料驗證設為允許的狀態清單<br>④ Apps Script → 重新部署，設定觸發器                                                                           |
| **更換 Gmail SMTP**                    | ① Vercel 環境變數 → `MAIL_USER`（Gmail 帳號）、`MAIL_PASS`（App Password）<br>② Google 帳號需開啟「兩步驟驗證」才能建立 App Password                                                                                                                  |
| **更新 LIFF Endpoint URL**             | ① LINE Developers → LIFF → Endpoint URL<br>② `nuxt.config.ts` → `public.liffIdCart`、`public.liffIdOrders`（LIFF ID 不變則不需改）                                                                                                                    |
| **調整 Vercel Cron 排程**              | ① `vercel.json` → `schedule`（UTC cron expression）                                                                                                                                                                                                   |
| **調整逾期取消天數**                   | ① `cancel-expired-orders.get.ts` → `EXPIRE_MS`                                                                                                                                                                                                        |
| **新增需要資料庫的 API**               | ① 確認 Supabase `anon` 角色的 RLS 政策允許需要的操作<br>② 若需 Cron 觸發 → 更新 `vercel.json`                                                                                                                                                         |
