# 商務規則

> 返回 [README](../README.md)

---

## 定價規則

> **注意**：此規則僅適用於 Uniqlo、GU、RS Taichi，以及**沒有**在 `kushitani-pricing.json` 設定自訂售價的 Kushitani 商品。

- 商品售價 = 日幣原價 × （玉山銀行現金賣出匯率 + 階級加碼）
- 加碼比例按商品日幣定價分段：
  - ≤ ¥990：+10%
  - ≤ ¥1,990：+9%
  - ≤ ¥2,990：+3%
  - ≤ ¥3,990：+2.5%
  - ≤ ¥4,990：+2.3%
  - ≤ ¥5,990：+2.2%
  - ¥5,991+：+2%
- **要修改加碼比例 → 改 [`shared/pricing.ts`](../shared/pricing.ts) 的 `getRateMarkup()`**

### 最低利潤保護（`MIN_PROFIT_TWD = 100`）

每件商品都保證至少賺 **NT$100**。計算流程：

1. 先算「正常售價」= 日幣 × （匯率 + 加碼）
2. 再算「我方成本」= 日幣 × 匯率（只有匯率，不含加碼）
3. 計算「利潤」= 正常售價 − 我方成本
4. 如果利潤 < NT$100 → 售價強制改為「成本 + NT$100」

**範例**（匯率 0.202，¥500 商品）：

| 項目                  | 計算         | 結果                |
| --------------------- | ------------ | ------------------- |
| 我方成本              | ¥500 × 0.202 | NT$101              |
| 正常售價（加碼 +10%） | ¥500 × 0.302 | NT$151              |
| 利潤（151 − 101）     | —            | NT$50 ← 不足 100 ⚠️ |
| **最終售價**          | 101 + 100    | **NT$201**          |

> 高價商品（¥3,000+）在正常匯率下利潤通常超過 NT$100，不受影響。低價小物（¥500 以下）才會觸發此保護。

- **要修改最低利潤 → 改 [`shared/pricing.ts`](../shared/pricing.ts) 的 `MIN_PROFIT_TWD`**

---

## 匯率規則

- 來源：玉山銀行（JPY 現金賣出）
- **最低匯率下限**：0.2（即使玉山匯率低於 0.2，系統一律以 0.2 計算，定義於 `shared/pricing.ts` → `MIN_JPY_RATE`）
- 備用值：0.205（玉山網站暫時無法存取時使用）
- 強制更新：`GET /api/exchange-rate?force=1`

### 匯率快取機制

系統有**兩層快取**：

| 層級          | 儲存位置                     | TTL     | 說明                                                         |
| ------------- | ---------------------------- | ------- | ------------------------------------------------------------ |
| **Server 端** | Supabase `exchange_rates` 表 | 24 小時 | `getJpyRate()` 從玉山銀行抓取後存入，24 小時內直接回傳快取值 |
| **Client 端** | 瀏覽器 localStorage          | 24 小時 | `useExchangeRate()` 的 `fetchRate()` 預設先讀 localStorage   |

### 各頁面匯率取得方式

| 頁面                          | 匯率來源                           | 快取策略                                             |
| ----------------------------- | ---------------------------------- | ---------------------------------------------------- |
| **LINE 商品卡片**             | Server → `getJpyRate()` → Supabase | 每次 Webhook 從 Supabase 讀取，`?force=1` 後立即生效 |
| **`/price`（內部試算）**      | Client → API → Supabase            | `skipCache: true`，**每次進頁面都從 API 即時取得**   |
| **`/estimate`（消費者試算）** | Client → API → Supabase            | `skipCache: true`，**每次進頁面都從 API 即時取得**   |
| **`/cart`（購物車）**         | Client → API → Supabase            | `skipCache: true`，**每次進頁面都從 API 即時取得**   |
| **`/checkout`（結帳）**       | Client → API → Supabase            | `skipCache: true`，**每次進頁面都從 API 即時取得**   |

> **重要**：所有前端頁面（`/price`、`/estimate`、`/cart`、`/checkout`）均使用 `fetchRate({ skipCache: true })`，跳過 localStorage 快取，確保每次開啟頁面都從 API 取得最新匯率。localStorage 仍會寫入（作為離線 fallback），但不會優先讀取。

### 手動更新匯率流程

當匯率有異常或需要強制刷新時：

1. 呼叫 `GET /api/exchange-rate?force=1` → 重新從玉山抓取並更新 Supabase
2. 使用者重新開啟任何頁面 → 自動從 API 取得最新匯率（不受 localStorage 影響）

- **要修改備用匯率 → 改 [`server/utils/exchangeRate.ts`](../server/utils/exchangeRate.ts) 的 `FALLBACK_RATE`**
- **要修改最低匯率 → 改 [`shared/pricing.ts`](../shared/pricing.ts) 的 `MIN_JPY_RATE`**

---

## 運費規則

- 運送方式：ePacket、國際小包
- 運費按商品總重量查表計算
- **國際運費另加 1% 包材附加費**：查表日幣運費 × 1.01（無條件進位）後才換算台幣
- **要修改包材附加費 → 改 [`shared/shipping.ts`](../shared/shipping.ts) 的 `getShippingTwd()`**
- 商品重量依 Uniqlo 商品分類（class/category）查表估算
- 代購服務費另計（見 `SERVICE_FEE_TWD`）
- **日本國內運費**：部分品牌需額外加收日本國內配送費（見下方獨立章節）
- **要修改商品重量估算 → 改 [`shared/shipping.ts`](../shared/shipping.ts) 的 `WEIGHT_MAP`**
- **要修改服務費 → 改 [`shared/shipping.ts`](../shared/shipping.ts) 的 `SERVICE_FEE_TWD`**

### RS Taichi 運費特殊規則

- 只要購物車含有任何 RS Taichi 商品（包含混合 Uniqlo），**一律強制使用國際小包**計算運費
- RS Taichi 商品重量 = 爬蟲抓到的實際重量（公克）**+ 500g 包材緩衝**
- RS Taichi 商品 category 欄位格式：`rstaichi|{grams}`（e.g. `rstaichi|1700`）
- 部分商品（如頭盔）為禁購品，在 `server/utils/brandConfig.ts` 的 `BLOCKED_SKUS` 管理

### Kushitani 運費特殊規則

- 只要購物車含有 Kushitani 商品（且有重量），**一律強制使用國際小包**計算運費
- Kushitani 商品重量由爬蟲從商品描述解析，**已含 500g 包材緩衝**
- Kushitani 商品 category 欄位格式：`kushitani|{grams}`（e.g. `kushitani|2500`）
- **`skipShipping: true`（含運直送）的商品 → category 存為 `kushitani|0`，重量計為 0，不計入運費**
- 安全帽類型號以前綴識別，系統會提示聯繫專人客服，無法線上加購

### FR2 / BAPE 運費特殊規則

- FR2 與 BAPE 皆為 Shopify 平台商品，爬蟲取得商品資訊後以估算重量存入 category（格式：`fr2|{grams}`、`bape|{grams}`）
- 每個品牌固定加收 ¥400 日本國內運費
- 國際運費依重量正常計算

---

## 日本國內運費規則

部分品牌在日本國內配送時會收取國內運費，此費用獨立於國際運費之外。

| 品牌          | 收費規則                         | 金額          |
| ------------- | -------------------------------- | ------------- |
| **BAPE**      | 有買就收                         | ¥400 / 每品牌 |
| **FR2**       | 有買就收                         | ¥400 / 每品牌 |
| **UNIQLO**    | 該品牌日幣商品總額 < ¥4,990 才收 | ¥500          |
| **GU**        | 該品牌日幣商品總額 < ¥4,990 才收 | ¥500          |
| **RS Taichi** | 無國內運費                       | —             |
| **Kushitani** | 無國內運費                       | —             |

- 結帳頁「日本國內運費」會獨立顯示在國際運費下方，並列出涉及的品牌名稱
- 國內運費以日幣計算後按匯率換算台幣，一併計入總金額
- **要修改國內運費常數 → 改 [`shared/shipping.ts`](../shared/shipping.ts) 的 `DOMESTIC_FLAT_FEE_JPY`、`DOMESTIC_FREE_THRESHOLD_JPY`、`DOMESTIC_THRESHOLD_FEE_JPY`**

---

## 開始購物 — 品牌分類選擇器

LINE 官方帳號輸入「開始購物」後，系統會先顯示分類選擇器：

| 分類        | 包含品牌              |
| ----------- | --------------------- |
| 👕 潮牌服飾 | BAPE、FR2、UNIQLO、GU |
| 🏍️ 重機部品 | Kushitani、RS Taichi  |

選擇分類後才顯示對應品牌的輪播卡片。

- **要修改分類 → 改 [`server/utils/line/shopCarousel.ts`](../server/utils/line/shopCarousel.ts) 的 `fashionBrands` / `motogearBrands` 陣列與 `buildCategorySelector()`**

---

## Kushitani 禁止販售商品

以下 Kushitani 商品因含電池、酒精、液體等航空禁運物品，無法國際配送：

`k-8226`、`k-8227`、`k-8228`、`k-8229`、`k-8230`、`k-8231`、`k-8232`、`ex-4233`

使用者傳送這些商品的網址時，LINE Bot 會回覆無法販售的提示訊息。

- **要修改禁售清單 → 改 [`server/utils/brandConfig.ts`](../server/utils/brandConfig.ts) 的 `KUSHITANI_BLOCKED_PIDS`**

---

## 價格試算頁面

系統提供兩個價格試算頁面：

| 路由        | 對象     | 說明                                                         |
| ----------- | -------- | ------------------------------------------------------------ |
| `/price`    | 內部人員 | 顯示完整計算細節（匯率、加碼比例、運送方式等），用於預估報價 |
| `/estimate` | 消費者   | 簡化版，僅顯示商品售價、國際運費、服務費、消費稅、預估總計   |

兩頁共用相同計算邏輯：

- 商品售價 = 日幣含稅價 ×（匯率 + 階級加碼）
- 國際運費 = 依選擇的重量查表（ePacket ≤ 2kg / 國際小包 > 2kg）
- 服務費 = 5%
- 消費稅 = 5%（因開立發票）
- 最終結果為預估金額，實際以客服報價為主

---

## Kushitani 自訂售價規則

- Kushitani 部分商品有**事先談好的台幣含運直送報價**，不走匯率換算公式
- 設定方式：編輯 `server/data/kushitani-pricing.json`，填入型號與售價
- 格式範例：`{ "K-5381": { "priceTwd": 7920, "skipShipping": true } }`
- `skipShipping: true` 表示含運直送，結帳時這件商品不計算國際運費
- `skipShipping: false`（或不填）表示還是要另外加運費
- **該商品在 LINE 輪播、購物車、結帳頁，全程都顯示台幣售價，不受匯率影響**
- 不在 JSON 中的 Kushitani 商品 → 照正常匯率換算公式計算
- **要新增或修改自訂售價 → 改 `server/data/kushitani-pricing.json`**

---

## 銀行轉帳優惠

- 付款方式選「銀行轉帳」→ 享有 3% 折扣（相較信用卡/綠界）
- 折扣在 `checkout.vue` 計算，結帳時以 `discountTwd` 傳給 `submit-order`
- 目前將綠界拿掉了，若未來需要串接綠界再打開 `OrderForm.vue` 隱藏的綠界支付方式。

---

## 逾期訂單自動刪除規則

- 條件：`status = 'pending'` AND `payment_method = 'bank_transfer'` AND 訂單建立超過 **3 天（72 小時）**
- 動作：
  1. 從 Supabase `orders` 表直接 **刪除**（不是改狀態）
  2. 從 Google 試算表「訂單資訊」工作表同步 **刪除對應列**
  3. 不發通知（不發 LINE push、不發 email）
- 執行時機：每日台灣時間 **午夜 00:00**（UTC 16:00）由 Vercel Cron 自動觸發
- **要改逾期天數 → 改 [`server/api/cancel-expired-orders.get.ts`](../server/api/cancel-expired-orders.get.ts) 的 `EXPIRE_MS`**
- **要改執行時間 → 改 [`vercel.json`](../vercel.json) 的 `schedule`（cron 格式）**

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
