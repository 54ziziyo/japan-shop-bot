# 囉姆嚕日貨代購機器人（Japan Shop Bot）

LINE 官方帳號的日本代購服務，整合 Uniqlo 商品查詢、購物車、結帳、訂單管理、Google 試算表同步及自動化運維。

---

## 技術架構

| 類別      | 技術                                              |
| --------- | ------------------------------------------------- |
| 前端框架  | Nuxt 4（`ssr: false` SPA 模式）                   |
| UI 樣式   | Tailwind CSS                                      |
| 後端 API  | Nuxt server/api（Nitro）                          |
| 資料庫    | Supabase（PostgreSQL）                            |
| 部署平台  | Vercel（無伺服器）                                |
| LINE 整合 | @line/bot-sdk（Webhook）、@line/liff（前端 LIFF） |
| Email     | nodemailer（Gmail SMTP）                          |
| 定時任務  | Vercel Cron Jobs                                  |
| 試算表    | Google Sheets API（googleapis）                   |

---

## 目錄結構說明

```
japan-shop-bot/
│
├── pages/                     # 前端頁面（LIFF APP）
│   ├── index.vue              # 首頁（靜態導覽頁）
│   ├── cart.vue               # 購物車頁（管理品項、數量）
│   ├── checkout.vue           # 結帳頁（填寫收件資訊、選付款方式）
│   ├── orders.vue             # 訂單查詢頁（顯示進行中訂單狀態）
│   └── price.vue              # 運費試算工具頁（獨立工具）
│
├── components/
│   ├── AppNavbar.vue          # 頂部導覽列（共用）
│   ├── AppBottomBar.vue       # 底部導覽列（共用）
│   ├── AppLoading.vue         # 載入動畫（共用）
│   └── checkout/
│       ├── ItemCard.vue       # 結帳頁商品卡片
│       ├── OrderForm.vue      # 收件人資訊表單
│       ├── PriceSummary.vue   # 費用明細區塊
│       └── Success.vue        # 下單成功畫面
│
├── composables/
│   └── useExchangeRate.ts     # 匯率取得（含 localStorage 快取）
│
├── server/
│   ├── api/                   # 後端 API 路由
│   │   ├── webhook.post.ts            # LINE Webhook 入口（處理所有 LINE 事件）
│   │   ├── sync-cart.post.ts          # 結帳前同步驗證商品價格與庫存
│   │   ├── submit-order.post.ts       # 提交訂單（DB + 試算表 + email）
│   │   ├── checkout.post.ts           # 結帳 fallback（liff.sendMessages 失敗備案）
│   │   ├── exchange-rate.get.ts       # 取得當前 JPY 匯率
│   │   ├── update-order-status.post.ts# Google Apps Script Webhook（更新訂單狀態）
│   │   ├── update-order-address.post.ts # 客戶修改收件地址
│   │   ├── cancel-expired-orders.get.ts # Vercel Cron：刪除逾期訂單
│   │   └── cancel-expired-orders.get.ts
│   │
│   └── utils/                 # 後端共用工具
│       ├── scrapeUniqlo.ts    # 刮取 Uniqlo 商品資訊（價格、庫存、圖片）
│       ├── exchangeRate.ts    # 從玉山銀行網站抓 JPY 現金賣出匯率
│       ├── googleSheets.ts    # Google Sheets 讀寫（appendOrderRow / deleteOrderRows）
│       ├── pricing.ts         # re-export shared/pricing
│       └── shippingConfig.ts  # re-export shared/shipping
│
├── shared/                    # Server + Client 共用邏輯（唯一來源）
│   ├── pricing.ts             # 匯率換算公式、加碼表
│   ├── shipping.ts            # 運費計算、商品重量查表
│   └── address.ts             # 台灣縣市清單 TW_REGIONS
│
├── utils/
│   ├── pricing.ts             # re-export shared/pricing（Nuxt 自動 import）
│   └── address.ts             # re-export shared/address（Nuxt 自動 import）
│
├── nuxt.config.ts             # Nuxt 設定、環境變數宣告
├── vercel.json                # Vercel Cron Job 排程設定
└── tailwind.config.js         # Tailwind 設定
```

---

## 使用者操作流程

```
LINE 官方帳號
    │
    ├─ 傳送 Uniqlo 商品網址
    │       ↓
    │   webhook.post.ts 解析網址 → scrapeUniqlo 抓商品資料
    │       ↓
    │   回傳 LINE Flex Message（商品卡片 + 顏色/尺寸選擇）
    │       ↓
    │   選好後加入購物車（寫入 Supabase cart_items）
    │
    ├─ 開啟購物車 LIFF（cart.vue）
    │       ↓
    │   查看商品、調整數量、刪除品項
    │       ↓
    │   前往結帳 →
    │
    ├─ 結帳 LIFF（checkout.vue）
    │       ↓
    │   sync-cart.post.ts 重新驗證價格與庫存（若有變動會提示）
    │       ↓
    │   填寫姓名、手機、地址、付款方式
    │       ↓
    │   submit-order.post.ts 送出訂單
    │       ├─ 寫入 Supabase orders（status: 'pending'）
    │       ├─ 寫入 Google 試算表（appendOrderRow）
    │       └─ 發送確認 email 給管理員
    │
    └─ 訂單查詢 LIFF（orders.vue）
            ↓
        查看進行中訂單狀態
```

---

## 訂單狀態流程

訂單狀態存在 Supabase `orders.status` 欄位，由 Google 試算表 H 欄下拉選單觸發 Apps Script Webhook 更新。

```
pending → confirmed → processing → packing
  （待付款）  （採購中）  （包裝中）   （已出貨）

任何狀態 → cancelled（手動取消）
pending  → 【自動刪除】（3 天未付款，見下方）
```

| 狀態值       | 中文顯示     | 說明                         |
| ------------ | ------------ | ---------------------------- |
| `pending`    | 待付款確認中 | 訂單剛建立，等待客戶銀行轉帳 |
| `confirmed`  | 商品採購中   | 已確認收款，開始採購         |
| `processing` | 商品包裝中   | 商品已到手，打包中           |
| `packing`    | 已出貨成功   | 已寄出，等待配送             |
| `cancelled`  | 訂單已取消   | 手動取消                     |

> **注意**：`orders.vue` 查詢時排除 `completed`（完成），已完成訂單不顯示在查詢頁面中。

---

## 商務規則

### 定價規則

- 商品售價 = 日幣原價 × （玉山銀行現金賣出匯率 + 階級加碼）
- 加碼比例按商品日幣定價分段：
  - ≤ ¥990：+7%
  - ≤ ¥1,990：+6%
  - ≤ ¥2,990：+2.89%
  - ≤ ¥3,990：+2.5%
  - ≤ ¥4,990：+2.3%
  - ≤ ¥5,990：+2.2%
  - ¥6,000+：+2%
- **要修改加碼比例 → 改 [`shared/pricing.ts`](shared/pricing.ts) 的 `getRateMarkup()`**

### 匯率規則

- 來源：玉山銀行（JPY 現金賣出）
- 快取：Supabase 快取 24 小時，前端 localStorage 亦快取 24 小時
- 備用值：0.205（玉山網站暫時無法存取時使用）
- 強制更新：`GET /api/exchange-rate?force=1`
- **要修改備用匯率 → 改 [`server/utils/exchangeRate.ts`](server/utils/exchangeRate.ts) 的 `FALLBACK_RATE`**

### 運費規則

- 運送方式：ePacket、國際小包
- 運費按商品總重量查表計算（日幣運費 × 匯率，自動換算台幣）
- 商品重量依 Uniqlo 商品分類（class/category）查表估算
- 代購服務費另計（見 `SERVICE_FEE_TWD`）
- **要修改商品重量估算 → 改 [`shared/shipping.ts`](shared/shipping.ts) 的 `WEIGHT_MAP`**
- **要修改服務費 → 改 [`shared/shipping.ts`](shared/shipping.ts) 的 `SERVICE_FEE_TWD`**

### 銀行轉帳優惠

- 付款方式選「銀行轉帳」→ 享有 3% 折扣（相較信用卡/綠界）
- 折扣在 `checkout.vue` 計算，結帳時以 `discountTwd` 傳給 `submit-order`
- 目前將綠界拿掉了，若未來需要串接綠界再打開 `OrderForm.vue` 隱藏的綠界支付方式。

### 逾期訂單自動刪除規則

- 條件：`status = 'pending'` AND `payment_method = 'bank_transfer'` AND 訂單建立超過 **3 天（72 小時）**
- 動作：
  1. 從 Supabase `orders` 表直接 **刪除**（不是改狀態）
  2. 從 Google 試算表「訂單資訊」工作表同步 **刪除對應列**
  3. 不發通知（不發 LINE push、不發 email）
- 執行時機：每日台灣時間 **午夜 00:00**（UTC 16:00）由 Vercel Cron 自動觸發
- **要改逾期天數 → 改 [`server/api/cancel-expired-orders.get.ts`](server/api/cancel-expired-orders.get.ts) 的 `EXPIRE_MS`**
- **要改執行時間 → 改 [`vercel.json`](vercel.json) 的 `schedule`（cron 格式）**

---

## 環境變數一覽

所有環境變數在 Vercel 後台 → Settings → Environment Variables 設定。本機開發在 `.env` 設定（不進 git）。

| Key                           | 說明                                         |
| ----------------------------- | -------------------------------------------- |
| `LINE_CHANNEL_ACCESS_TOKEN`   | LINE Bot Channel Access Token                |
| `LINE_CHANNEL_SECRET`         | LINE Bot Channel Secret                      |
| `NUXT_PUBLIC_SUPABASE_URL`    | Supabase 專案 URL                            |
| `NUXT_PUBLIC_SUPABASE_KEY`    | Supabase Anon Key                            |
| `NUXT_PUBLIC_LIFF_ID_CART`    | 購物車 LIFF App ID                           |
| `NUXT_PUBLIC_LIFF_ID_ORDERS`  | 訂單查詢 LIFF App ID                         |
| `MAIL_USER`                   | Gmail 寄件信箱（e.g. brian@roml-life.com）   |
| `MAIL_PASS`                   | Gmail App Password（非登入密碼）             |
| `ADMIN_EMAIL`                 | 管理員收件信箱                               |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Service Account 完整 JSON（字串格式） |
| `GOOGLE_SPREADSHEET_ID`       | Google 試算表的 Spreadsheet ID               |
| `GOOGLE_SHEET_NAME`           | 工作表名稱（預設：`訂單資訊`）               |
| `SHEETS_WEBHOOK_SECRET`       | Google Apps Script → Nuxt Webhook 驗證金鑰   |
| `CRON_SECRET`                 | Vercel Cron Job 驗證金鑰                     |

---

## Supabase 資料表

### `orders`（訂單）

| 欄位              | 類型        | 說明                           |
| ----------------- | ----------- | ------------------------------ |
| `id`              | uuid        | 主鍵，Supabase 自動產生        |
| `user_id`         | text        | LINE userId                    |
| `line_name`       | text        | LINE 顯示名稱                  |
| `customer_name`   | text        | 收件人姓名                     |
| `phone`           | text        | 手機號碼（格式：09xxxxxxxx）   |
| `address`         | text        | 收件地址                       |
| `payment_method`  | text        | `bank_transfer` 或 `ecpay`     |
| `account_last5`   | text        | 轉帳帳號末五碼（銀行轉帳才有） |
| `items`           | jsonb       | 商品明細陣列                   |
| `total_jpy`       | int         | 商品小計（日幣）               |
| `grand_total_twd` | int         | 含稅總額（台幣）               |
| `status`          | text        | 訂單狀態（見上方狀態表）       |
| `created_at`      | timestamptz | 建立時間（自動）               |

### `cart_items`（購物車）

| 欄位            | 說明                                  |
| --------------- | ------------------------------------- |
| `user_id`       | LINE userId                           |
| `product_code`  | Uniqlo 商品代碼（e.g. `E480302-000`） |
| `product_title` | 商品名稱                              |
| `color`         | 選擇的顏色                            |
| `size`          | 選擇的尺寸                            |
| `price`         | 日幣價格字串（e.g. `¥1,990`）         |
| `image_url`     | 商品圖片 URL                          |
| `product_url`   | Uniqlo 商品頁網址                     |
| `quantity`      | 數量                                  |

### `exchange_rate_cache`（匯率快取）

| 欄位         | 說明                               |
| ------------ | ---------------------------------- |
| `key`        | 快取 key（固定為 `jpy_sell_rate`） |
| `rate`       | 匯率數值                           |
| `updated_at` | 更新時間                           |

---

## Google 試算表結構（訂單資訊）

H 欄「貨物狀態」為下拉選單，修改後由 Google Apps Script 觸發 Webhook 同步至 Supabase。

| 欄  | 內容                                                   |
| --- | ------------------------------------------------------ |
| A   | 訂單編號（e.g. `RM2503181045ABCD`）                    |
| B   | 會員 ID（Supabase UUID，**Apps Script 用此欄比對**）   |
| C   | 下單時間                                               |
| D   | LINE 名稱                                              |
| E   | 客人姓名                                               |
| F   | 手機號碼                                               |
| G   | 地址                                                   |
| H   | 貨物狀態（下拉選單，選項需與 `ALLOWED_STATUSES` 一致） |
| I   | 商品名稱（每件商品一列）                               |
| J   | 商品照片 URL                                           |
| K   | 商品顏色                                               |
| L   | 商品尺寸                                               |
| M   | 商品數量                                               |
| N   | 商品價格（日幣）                                       |
| O   | 商品單價（台幣）                                       |
| P   | 商品總計（台幣）                                       |
| Q   | 國際運費（台幣，僅首列）                               |
| R   | 含稅總額（台幣，僅首列）                               |

> **重要**：若要新增狀態選項，H 欄下拉選單的「選項文字」必須是英文小寫（e.g. `cancelled`），且需同步更新 `server/api/update-order-status.post.ts` 的 `ALLOWED_STATUSES` 陣列。

---

## Google Apps Script 說明

Google 試算表有一個觸發器 `handleStatusEdit`，監聽 H 欄（貨物狀態列）的編輯事件。  
當管理員修改狀態下拉值，Apps Script 自動 POST 到 `https://romoru.vercel.app/api/update-order-status`（帶上 `x-webhook-secret` header），Nuxt 收到後更新 Supabase。

**不需要在 Apps Script 加任何狀態白名單**，白名單在 Nuxt 端的 `ALLOWED_STATUSES` 控制。

---

## 本機開發

```bash
# 安裝套件
pnpm install

# 啟動開發伺服器（port 3000）
pnpm dev

# 對外開放（LINE Webhook 需要 HTTPS 公開網址）
ngrok http 3000
```

> ngrok 免費版每次啟動會換網址，需到 LINE Developers Console 更新 Webhook URL。  
> 固定網址已在 `nuxt.config.ts` 的 `vite.server.allowedHosts` 設定。

---

## 部署

```bash
# 建置確認（本機）
pnpm build

# 推送至 Vercel（自動部署）
git push
```

Vercel 部署後會自動讀取 `vercel.json` 建立 Cron Job。

---

## 常用維護指令

```bash
# 強制更新匯率快取
GET https://romoru.vercel.app/api/exchange-rate?force=1

# 手動觸發逾期訂單刪除（需帶 CRON_SECRET）
GET https://romoru.vercel.app/api/cancel-expired-orders?secret={CRON_SECRET}

# 本機測試逾期刪除
GET http://localhost:3000/api/cancel-expired-orders?secret={CRON_SECRET 值}
```

---

## 常見修改位置速查

| 想改什麼                  | 去哪改                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 加碼比例 / 定價公式       | `shared/pricing.ts` → `getRateMarkup()`                                                                                                                          |
| 商品重量估算              | `shared/shipping.ts` → `WEIGHT_MAP`                                                                                                                              |
| 服務費金額                | `shared/shipping.ts` → `SERVICE_FEE_TWD`                                                                                                                         |
| 匯率備用值                | `server/utils/exchangeRate.ts` → `FALLBACK_RATE`                                                                                                                 |
| 逾期天數（3 天 → 改幾天） | `server/api/cancel-expired-orders.get.ts` → `EXPIRE_MS`                                                                                                          |
| 自動刪除執行時間          | `vercel.json` → `schedule`                                                                                                                                       |
| 訂單狀態新增 / 修改       | `server/api/update-order-status.post.ts` → `ALLOWED_STATUSES`、`orders.vue` 的 `STATUS_LABELS`、Google 試算表 H 欄下拉選單                                       |
| 銀行帳號 / 行名           | `server/api/submit-order.post.ts`、`components/checkout/OrderForm.vue`、`components/checkout/Success.vue`、`pages/orders.vue` 各自的 `BANK_*` 常數（四處都要改） |
| 管理員 LINE ID            | `server/api/webhook.post.ts` 的 `ADMIN_USER_ID`（同一個值在多個 api 檔案都有，搜尋 `ADMIN_USER_ID` 一起改）                                                      |
| Email SMTP 設定           | `server/api/submit-order.post.ts` → nodemailer transport                                                                                                         |
| 截單時間（22:00）         | `server/api/webhook.post.ts` → `promoWarning` 字串、`components/checkout/OrderForm.vue` → 截單提醒文字（兩處都要改）                                             |

---

## 特價商品與截單時間

### 特價偵測原理

Uniqlo API 的商品資料含有 `priceFlags[]` 陣列。`server/utils/scrapeUniqlo.ts` 讀取此陣列，若存在 `code === 'limitedOffer'` 的旗標，代表該商品為**期間限定特價**：

| 欄位             | 說明                             |
| ---------------- | -------------------------------- |
| `isLimitedOffer` | `true` = 期間限定特價            |
| `promoEndTs`     | 特價截止時間戳（毫秒，日本時間） |

API 回傳的截止時間為日本時間，系統會自動換算為台灣時間，顯示在 LINE 商品卡片的警告訊息中（`webhook.post.ts` 的 `promoWarning` 字串）。

若商品特價旗標為 `discount`（非 `limitedOffer`），代表此為無截止日的長期降價，不顯示截止時間提醒。

### 每日截單時間

系統每日**台灣時間 22:00** 統一至日本下單，為 hardcoded 字串，非動態計算。

> **要修改截單時間 → 須同步修改兩個地方**：
>
> 1. `server/api/webhook.post.ts` — `promoWarning` 字串（含「系統每日採購時間約為 22:00」）
> 2. `components/checkout/OrderForm.vue` — 購物車頁面對使用者顯示的截單提醒文字

---

## 表單輸入驗證規則

驗證分為前端與後端兩層，後端驗證為最終防線。

### 前端驗證（`components/checkout/OrderForm.vue`）

在使用者點擊送出前即時顯示錯誤提示：

| 欄位            | 驗證規則                                      |
| --------------- | --------------------------------------------- |
| `customerName`  | 必填，不得空白                                |
| `phone`         | 必填，格式 `09xxxxxxxx`（10 位數字，09 開頭） |
| `address`       | 必填，不得空白                                |
| `paymentMethod` | 必填（目前僅 `bank_transfer`）                |
| `accountLast5`  | 選擇銀行轉帳時必填，5 位數字                  |

### 後端驗證（`server/api/submit-order.post.ts`）

API 層二次驗證，防止繞過前端直接呼叫 API：

| 欄位                  | 驗證邏輯                                     |
| --------------------- | -------------------------------------------- |
| `userId`              | 必填（來自 LINE LIFF session）               |
| `customerName`        | 必填                                         |
| `phone`               | Regex `/^09\d{8}$/`（10 位，09 開頭）        |
| `address`             | 必填                                         |
| `paymentMethod`       | 必填                                         |
| `items`               | 陣列，至少一件商品                           |
| `website`（Honeypot） | 隱藏欄位，若有值則靜默丟棄請求（機器人陷阱） |

---

## 匯款資訊修改位置

銀行帳號資訊目前以常數形式**硬編碼於四個檔案**，若需更換帳戶，必須全部一起修改：

| 檔案                                | 常數                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| `server/api/submit-order.post.ts`   | `BANK_NAME`, `BANK_CODE`, `BANK_ACCOUNT`                              |
| `components/checkout/OrderForm.vue` | `BANK_NAME`, `BANK_CODE`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`（戶名） |
| `components/checkout/Success.vue`   | `BANK_NAME`, `BANK_CODE`, `BANK_ACCOUNT`                              |
| `pages/orders.vue`                  | `BANK_NAME`, `BANK_CODE`, `BANK_ACCOUNT`                              |

> `BANK_ACCOUNT_NAME`（戶名「騎旅生活股份有限公司」）目前僅在 `OrderForm.vue` 定義與顯示，其他三個檔案不顯示戶名。若需改戶名，只改 `OrderForm.vue` 即可。

---

## 擴充支援非 Uniqlo 網站

目前系統僅支援 Uniqlo 。若要擴充至其他日本購物網站（如 GU），需修改以下部分：

### 1. 新增 scraper（`server/utils/scrapeXxx.ts`）

仿照 `scrapeUniqlo.ts` 的結構，實作 `scrapeXxx(url)` 函式，需解析目標網站 API 或 HTML，回傳統一格式：

```ts
{
  name: string,
  imageUrl: string,
  priceJpy: number,
  isLimitedOffer: boolean,
  promoEndTs: number | null,  // Unix ms，日本時間
  colorName?: string,
  sizeName?: string,
  inStock: boolean,
}
```

### 2. 修改 `server/api/webhook.post.ts`

在收到商品 URL 後，依 domain 分流至對應的 scraper：

```ts
let product;
if (url.includes('uniqlo.com')) {
  product = await scrapeUniqlo(url);
} else if (url.includes('gu-global.com')) {
  product = await scrapeGu(url);
} else {
  // 不支援的網站
  await replyText(replyToken, '目前僅支援 Uniqlo 商品連結');
  return;
}
```

### 3. 更新重量估算（`shared/shipping.ts`）

若新網站的商品分類不同，需在 `WEIGHT_MAP` 補上對應的品類與估重（單位：公克）。

### 4. 更新 `server/api/sync-cart.post.ts`（若有）

購物車商品資訊同步（例如即時刷新價格）需呼叫對應網站的 scraper，需一併加入分流邏輯。

---

## 系統連動修改對照表

修改某項功能時，需一併更新的外部系統整理如下：

| 修改項目                               | 需同步更新的地方                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **新增訂單狀態**                       | ① `update-order-status.post.ts` → `ALLOWED_STATUSES`<br>② `orders.vue` → `STATUS_LABELS`、`statusBadgeClass`、`statusEmoji`<br>③ Google 試算表 → H 欄「狀態」下拉選單資料驗證<br>④（可選）LINE 通知訊息文字                                           |
| **更換銀行帳號**                       | ① `submit-order.post.ts` → `BANK_*`<br>② `components/checkout/OrderForm.vue` → `BANK_*`、`BANK_ACCOUNT_NAME`<br>③ `components/checkout/Success.vue` → `BANK_*`<br>④ `pages/orders.vue` → `BANK_*`                                                     |
| **變更截單時間（22:00）**              | ① `webhook.post.ts` → `promoWarning` 字串<br>② `components/checkout/OrderForm.vue` → 截單提醒文字                                                                                                                                                     |
| **更換 LINE Bot（換帳號或 Channel）**  | ① Vercel 環境變數 → `LINE_ACCESS_TOKEN`、`LINE_SECRET`<br>② LINE Developers → Webhook URL 設為 `https://your-domain/api/webhook`<br>③ LINE Developers → LIFF App，更新各 `LIFF_ID`<br>④ `nuxt.config.ts` → `public.liffIdCart`、`public.liffIdOrders` |
| **更換 Supabase 專案**                 | ① Vercel 環境變數 → `SUPABASE_URL`、`SUPABASE_ANON_KEY`<br>② 重新執行建表 SQL（`orders`、`cart_items`、`exchange_rate_cache`）<br>③ 確認 RLS 政策（`anon` 角色的讀寫權限）                                                                            |
| **更換 Google 帳號（試算表服務帳號）** | ① Google Cloud → 建立新服務帳號，下載 JSON 金鑰<br>② Vercel 環境變數 → `GOOGLE_SERVICE_ACCOUNT_JSON`（整個 JSON 字串）<br>③ 新增服務帳號 email 為試算表的「編輯者」<br>④ Apps Script → 腳本需在相同 Google 帳號的 Google Sheet 內執行                 |
| **更換 Google 試算表**                 | ① Vercel 環境變數 → `SHEETS_SPREADSHEET_ID`、`SHEETS_SHEET_NAME`<br>② 新試算表需設定 A–J 欄標題<br>③ H 欄資料驗證設為允許的狀態清單<br>④ Apps Script → 重新部署，設定觸發器                                                                           |
| **更換 Gmail SMTP**                    | ① Vercel 環境變數 → `MAIL_USER`（Gmail 帳號）、`MAIL_PASS`（App Password）<br>② Google 帳號需開啟「兩步驟驗證」才能建立 App Password                                                                                                                  |
| **更換管理員（接收通知的 LINE 帳號）** | ① `webhook.post.ts` → `ADMIN_USER_ID` 常數<br>② 全域搜尋 `ADMIN_USER_ID`，確認其他 api 檔案也同步更新                                                                                                                                                 |
| **更新 LIFF Endpoint URL**             | ① LINE Developers → LIFF → Endpoint URL<br>② `nuxt.config.ts` → `public.liffIdCart`、`public.liffIdOrders`（LIFF ID 不變則不需改）                                                                                                                    |
| **調整 Vercel Cron 排程**              | ① `vercel.json` → `schedule`（UTC cron expression）                                                                                                                                                                                                   |
| **調整逾期取消天數**                   | ① `cancel-expired-orders.get.ts` → `EXPIRE_MS`                                                                                                                                                                                                        |
| **新增需要資料庫的 API**               | ① 確認 Supabase `anon` 角色的 RLS 政策允許需要的操作<br>② 若需 Cron 觸發 → 更新 `vercel.json`                                                                                                                                                         |
