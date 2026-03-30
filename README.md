# 囉姆嚕日貨代購機器人（Japan Shop Bot）

LINE 官方帳號的日本代購服務，整合 **Uniqlo**、**GU**、**RS Taichi（重機齒輪）**、**Kushitani（重機皮衣）** 等多品牌商品查詢、購物車、結帳、訂單管理、Google 試算表同步及自動化運維。

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
│       ├── scrape/
│       │   ├── uniqlo.ts      # 刮取 Uniqlo 商品資訊（價格、庫存、圖片）
│       │   ├── gu.ts          # 刮取 GU 商品資訊（與 Uniqlo 同 v5 API 結構）
│       │   ├── rstaichi.ts    # 刮取 RS Taichi 商品資訊（Magento 2 jsonConfig 解析）
│       │   └── kushitani.ts   # 刮取 Kushitani 商品資訊（Color Me Shop 平台）
│       ├── line/
│       │   ├── cards/         # 各品牌 LINE Flex Message 卡片產生器（uniqlo / gu / rstaichi / kushitani）
│       │   ├── shopCarousel.ts# 開始購物品牌導覽輪播
│       │   ├── faq.ts         # 購物須知 FAQ 內容
│       │   └── helpers.ts     # LINE API 工具（showLoadingAnimation 等）
│       ├── brandConfig.ts     # 多品牌路由工具（detectBrand / extractRstaichiSku / extractKushitaniPid / isRstaichiBlocked）
│       ├── kushitaniPricing.ts# 讀取 server/data/kushitani-pricing.json 自訂售價查表
│       ├── exchangeRate.ts    # 從玉山銀行網站抓 JPY 現金賣出匯率
│       ├── googleSheets.ts    # Google Sheets 讀寫（appendOrderRow / deleteOrderRows）
│       ├── pricing.ts         # re-export shared/pricing
│       └── shippingConfig.ts  # re-export shared/shipping
│
└── data/
    └── kushitani-pricing.json  # Kushitani 自訂台幣售價設定（型號 → 台幣價格）
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
    ├─ 傳送 GU 商品網址（gu-global.com）
    │       ↓
    │   webhook.post.ts detectBrand() 辨識品牌 → scrapeGu 呼叫 GU v5 API
    │       ↓
    │   回傳 LINE Flex Message（與 Uniqlo 相同卡片格式）
    │       ↓
    │   選好後加入購物車
    │
    ├─ 傳送 RS Taichi 商品網址（ec.rs-taichi.com）
    │       ↓
    │   webhook.post.ts detectBrand() 辨識品牌 → scrapeRstaichi 讀 Magento jsonConfig
    │       ↓
    │   回傳 LINE Flex Message（Overlay 設計 + 動態 aspectRatio）
    │       ↓
    │   選好後加入購物車（category 儲存為 rstaichi|{grams} 格式）
    │
    ├─ 傳送 Kushitani 商品網址（kushitanionline.com）
    │       ↓
    │   webhook.post.ts detectBrand() 辨識品牌 → scrapeKushitani 解析 Color Me Shop HTML
    │       ↓
    │   查詢 kushitaniPricing（若型號有自訂台幣售價，直接顯示；否則用匯率換算）
    │       ↓
    │   回傳 LINE Flex Message（與 RS Taichi 相同 Overlay 設計）
    │       ↓
    │   選好後加入購物車（category 儲存為 kushitani|{grams} 格式）
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

> **注意**：此規則僅適用於 Uniqlo、GU、RS Taichi，以及**沒有**在 `kushitani-pricing.json` 設定自訂售價的 Kushitani 商品。

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

#### RS Taichi 運費特殊規則

- 只要購物車含有任何 RS Taichi 商品（包含混合 Uniqlo），**一律強制使用國際小包**計算運費
- RS Taichi 商品重量 = 爬蟲抓到的實際重量（公克）**+ 500g 包材緩衝**
- RS Taichi 商品 category 欄位格式：`rstaichi|{grams}`（e.g. `rstaichi|1700`）
- 部分商品（如頭盔）為禁購品，在 `server/utils/brandConfig.ts` 的 `BLOCKED_SKUS` 管理

#### Kushitani 運費特殊規則

- 只要購物車含有 Kushitani 商品（且有重量），**一律強制使用國際小包**計算運費
- Kushitani 商品重量由爬蟲從商品描述解析，**已含 500g 包材緩衝**
- Kushitani 商品 category 欄位格式：`kushitani|{grams}`（e.g. `kushitani|2500`）
- **`skipShipping: true`（含運直送）的商品 → category 存為 `kushitani|0`，重量計為 0，不計入運費**
- 安全帽類型號以前綴識別，系統會提示聯繫專人客服，無法線上加購

### Kushitani 自訂售價規則

- Kushitani 部分商品有**事先談好的台幣含運直送報價**，不走匯率換算公式
- 設定方式：編輯 `server/data/kushitani-pricing.json`，填入型號與售價
- 格式範例：`{ "K-5381": { "priceTwd": 7920, "skipShipping": true } }`
- `skipShipping: true` 表示含運直送，結帳時這件商品不計算國際運費
- `skipShipping: false`（或不填）表示還是要另外加運費
- **該商品在 LINE 輪播、購物車、結帳頁，全程都顯示台幣售價，不受匯率影響**
- 不在 JSON 中的 Kushitani 商品 → 照正常匯率換算公式計算
- **要新增或修改自訂售價 → 改 `server/data/kushitani-pricing.json`**

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

| 欄位              | 類型        | 說明                                |
| ----------------- | ----------- | ----------------------------------- |
| `id`              | uuid        | 主鍵，Supabase 自動產生             |
| `user_id`         | text        | LINE userId                         |
| `line_name`       | text        | LINE 顯示名稱                       |
| `customer_name`   | text        | 收件人姓名                          |
| `phone`           | text        | 手機號碼（格式：09xxxxxxxx）        |
| `address`         | text        | 收件地址                            |
| `payment_method`  | text        | `bank_transfer` 或 `ecpay`          |
| `account_last5`   | text        | 轉帳帳號末五碼（銀行轉帳才有）      |
| `items`           | jsonb       | 商品明細陣列                        |
| `total_jpy`       | int         | 商品小計（日幣）                    |
| `grand_total_twd` | int         | 含稅總額（台幣）                    |
| `status`          | text        | 訂單狀態（見上方狀態表）            |
| `tracking_code`   | text        | 包裹追蹤碼（出貨後填入，可為 null） |
| `created_at`      | timestamptz | 建立時間（自動）                    |

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

| 欄  | 內容                                                     |
| --- | -------------------------------------------------------- |
| A   | 訂單編號（e.g. `RM2503181045ABCD`）                      |
| B   | 會員 ID（Supabase UUID，**Apps Script 用此欄比對**）     |
| C   | 下單時間                                                 |
| D   | LINE 名稱                                                |
| E   | 客人姓名                                                 |
| F   | 手機號碼                                                 |
| G   | 地址                                                     |
| H   | 貨物狀態（下拉選單，選項需與 `ALLOWED_STATUSES` 一致）   |
| I   | 商品名稱（每件商品一列）                                 |
| J   | 商品照片 URL                                             |
| K   | 商品顏色                                                 |
| L   | 商品尺寸                                                 |
| M   | 商品數量                                                 |
| N   | 商品價格（日幣）                                         |
| O   | 商品單價（台幣）                                         |
| P   | 商品總計（台幣）                                         |
| Q   | 國際運費（台幣，僅首列）                                 |
| R   | 含稅總額（台幣，僅首列）                                 |
| S   | 追蹤碼（僅首列，出貨時由管理員填入，如 `EN507442770JP`） |

> **重要**：若要新增狀態選項，H 欄下拉選單的「選項文字」必須是英文小寫（e.g. `cancelled`），且需同步更新 `server/api/update-order-status.post.ts` 的 `ALLOWED_STATUSES` 陣列。

---

## Google Apps Script 說明

Google 試算表有一個觸發器 `handleStatusEdit`，監聽 H 欄（貨物狀態列）與 S 欄（追蹤碼）的編輯事件。  
當管理員修改狀態下拉值，Apps Script 自動 POST 到 `https://romoru.vercel.app/api/update-order-status`（帶上 `x-webhook-secret` header），Nuxt 收到後更新 Supabase。

若管理員在 S 欄填入追蹤碼（如 `EN507442770JP`），Apps Script 會一併將 `trackingCode` 送至 API，同步寫入 Supabase `orders.tracking_code` 欄位。

**不需要在 Apps Script 加任何狀態白名單**，白名單在 Nuxt 端的 `ALLOWED_STATUSES` 控制。

---

## 更新紀錄

### 2026-03-30

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

### 2026-03-23

**RS Taichi 庫存狀態解析修正（`server/utils/scrapeRstaichi.ts`）**

- **Bug 1 修正**：原本 `inStock` 只認 `「在庫あり」` 為有貨，導致 `「在庫切れ※ご注文受付中」`（接受預購）被誤標為完售
  - 新邏輯：只有包含 `「完売」` 才視為完售；`在庫切れ※ご注文受付中`、`入荷待ち` 等都視為可購買
- **Bug 2 修正**：某顏色若在 Magento index 中沒有某尺寸的組合，該尺寸直接消失，不顯示在 LINE 卡片上
  - 新邏輯：收集所有顏色的尺寸聯集，讓每個顏色都展示完整尺寸列表，缺少的組合標記為「完售」

**RS Taichi 包材重量修正（`shared/shipping.ts`）**

- `getCategoryWeight` 對 `rstaichi|{grams}` 格式的商品，在實際重量基礎上**額外加 500g** 作為包材緩衝

---

## 維運與費用規劃

> 本節供老闆與技術負責人確認，涵蓋爬蟲監控、效能、費用與平台商業使用政策。

---

### 爬蟲健康監控

本系統設有自動爬蟲健康檢查機制（[`server/api/scraper-health.get.ts`](server/api/scraper-health.get.ts)），每日自動偵測各品牌爬蟲是否正常。

| 項目 | 說明 |
| ---- | ---- |
| 觸發時機 | 每天台灣時間早上 09:00（Vercel Cron）|
| 測試方式 | 對 Uniqlo、GU、RS Taichi、Kushitani 各抓一件穩定商品，確認回傳有效資料 |
| 失敗通知 | 任一品牌失敗，自動寄送警報 Email 至管理員信箱 |
| 回傳格式 | `{ ok, timestamp, results[] }` – 每個品牌帶 ok/error/durationMs |
| 測試 URL | 在 `TEST_URLS` 常數中設定，應選**長期不下架**的基本款商品 |

**⚠️ 注意**：若測試商品下架，爬蟲健康檢查會誤報警報。建議定期確認測試商品仍在架。

---

### 效能現況與優化說明

#### 已有的效能設計

| 機制 | 說明 |
| ---- | ---- |
| `sync-cart` 並行抓取 | 同一次結帳，多件商品同時發出請求（`Promise.all`），且同一商品只抓一次 |
| 匯率雙層快取 | Supabase 24 小時快取 + 前端 localStorage 24 小時，避免重複打外部 API |
| `keepAlive` Agent | 所有爬蟲 axios 實例使用 HTTP keep-alive，減少 TLS handshake 耗時 |
| Supabase 單例 | [`server/utils/supabase.ts`](server/utils/supabase.ts) 在同一容器暖啟動期間共用同一個 client |

#### 不需要擔心的地方

本專案是**個人代購、低流量**場景，**不需要** Redis、CDN Edge、Connection Pooling 等企業級優化。  
目前架構在 Vercel Pro + Supabase Free 上為最合理的配置。

---

### Vercel 是否需要升級？

**結論：需要升級至 Pro 方案（$20/月）。**

Vercel Hobby（免費）方案明確禁止商業用途：

> *"Commercial usage of Hobby projects is not allowed."*  
> — [Vercel Fair Use Policy](https://vercel.com/docs/limits/fair-use-policy)

只要網站有代購收費行為，即屬商業用途，使用 Hobby 方案違反服務條款。

| 項目 | Hobby（免費） | Pro（$20/月 ≈ NT$650） |
| ---- | ------------ | ---------------------- |
| **商業使用** | ❌ 禁止 | ✅ 允許 |
| Serverless 執行時間 | 10 秒/次 | 60 秒/次 |
| Cron Jobs 數量 | 2 個（每日） | 40 個 |
| 每月頻寬 | 100 GB | 1 TB |
| Serverless 調用次數 | 100,000 次/月 | 1,000,000 次/月 |

> 爬蟲有時會接近 10 秒上限，Pro 的 60 秒可有效防止超時。

---

### Supabase 免費額度說明

**結論：Supabase Free plan 允許商業使用，個人代購規模數年內不會超額。**

| 資源 | 免費額度 | 預估用量（個人代購） |
| ---- | -------- | ------------------- |
| 資料庫容量 | 500 MB | 超低（見下表） |
| 資料列數 | 無限制（僅看容量） | — |
| API 請求 | 無限制 | — |
| Auth 用戶 | 50,000 MAU | — |

**資料量估算（500 MB 免費額度）**

| 資料表 | 每筆大小 | 10,000 筆佔用 |
| ------ | ------- | ------------ |
| `orders` | ~1 KB（含 jsonb items） | ~10 MB |
| `cart_items` | ~0.5 KB | ~5 MB（50,000 筆） |
| `exchange_rate_cache` | 可忽略 | < 1 KB |

**10,000 筆訂單僅佔 10 MB，500 MB 夠用數年。**

---

### 費用總覽

#### 目前每月固定支出

| 服務 | 方案 | 月費 |
| ---- | ---- | ---- |
| Supabase | Free | $0 |
| LINE Official Account | 免費方案（200 則推播/月） | $0 |
| Gmail SMTP（寄信） | 個人帳號 | $0 |
| Google Sheets API | 免費 | $0 |

#### 建議升級項目

| 服務 | 方案 | 月費 |
| ---- | ---- | ---- |
| **Vercel Pro**（商業合規必須） | Pro | **$20/月（≈ NT$650）** |
| LINE 加值（如需更多推播） | Light（800 則） | NT$200/月 起 |
| 自訂網域（選配） | 年費 | ~$10–15/年 |

#### 最低合規運營成本

**Vercel Pro $20/月（≈ NT$650）** 是唯一必要固定支出。  
Supabase、Gmail、Google Sheets 現有免費額度對此業務規模完全足夠。

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
| Email SMTP 設定           | `server/api/submit-order.post.ts` → nodemailer transport                                                                                                         |
| Kushitani 自訂售價        | `server/data/kushitani-pricing.json`                                                                                                                             |
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

## 擴充支援新品牌

目前支援 **Uniqlo、GU、RS Taichi、Kushitani** 四個品牌。若要新增第五個品牌，需修改以下部分：

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
| **更換 Supabase 專案**                 | ① Vercel 環境變數 → `SUPABASE_URL`、`SUPABASE_ANON_KEY`<br>② 重新執行建表 SQL（`orders`、`cart_items`、`exchange_rate_cache`）<br>③ 確認 RLS 政策（`anon` 角色的讀寫權限）                                                                            |
| **更換 Google 帳號（試算表服務帳號）** | ① Google Cloud → 建立新服務帳號，下載 JSON 金鑰<br>② Vercel 環境變數 → `GOOGLE_SERVICE_ACCOUNT_JSON`（整個 JSON 字串）<br>③ 新增服務帳號 email 為試算表的「編輯者」<br>④ Apps Script → 腳本需在相同 Google 帳號的 Google Sheet 內執行                 |
| **更換 Google 試算表**                 | ① Vercel 環境變數 → `SHEETS_SPREADSHEET_ID`、`SHEETS_SHEET_NAME`<br>② 新試算表需設定 A–J 欄標題<br>③ H 欄資料驗證設為允許的狀態清單<br>④ Apps Script → 重新部署，設定觸發器                                                                           |
| **更換 Gmail SMTP**                    | ① Vercel 環境變數 → `MAIL_USER`（Gmail 帳號）、`MAIL_PASS`（App Password）<br>② Google 帳號需開啟「兩步驟驗證」才能建立 App Password                                                                                                                  |
| **更新 LIFF Endpoint URL**             | ① LINE Developers → LIFF → Endpoint URL<br>② `nuxt.config.ts` → `public.liffIdCart`、`public.liffIdOrders`（LIFF ID 不變則不需改）                                                                                                                    |
| **調整 Vercel Cron 排程**              | ① `vercel.json` → `schedule`（UTC cron expression）                                                                                                                                                                                                   |
| **調整逾期取消天數**                   | ① `cancel-expired-orders.get.ts` → `EXPIRE_MS`                                                                                                                                                                                                        |
| **新增需要資料庫的 API**               | ① 確認 Supabase `anon` 角色的 RLS 政策允許需要的操作<br>② 若需 Cron 觸發 → 更新 `vercel.json`                                                                                                                                                         |
