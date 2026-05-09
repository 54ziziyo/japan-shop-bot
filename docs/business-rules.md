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
- **重量安全係數 8%**：`calculateQuote()` 在查費率表前，先將商品總重量 × 1.08 作為緩衝，避免單品估算誤差導致向客戶收取的運費不足
  - 安全係數只加在**總重量**上，不是對運費金額做百分比加成
  - **`/price` 試算頁面不套用安全係數**：該頁為手動輸入精確重量查表，供內部報價用，直接反映費率表原始數值
  - **要修改係數 → 改 [`shared/shipping.ts`](../shared/shipping.ts) `calculateQuote()` 的 `safeWeight` 計算**
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

### Uniqlo 涼鞋重量特殊規則

- Uniqlo API 的 `breadcrumbs.category.name` 對所有鞋款（皮鞋/靴子/涼鞋）都回傳 `"shoes"`，無法單純從 name 區分
- scraper 額外讀取 `breadcrumbs.category.locale`，若含「サンダル」則將 category 儲存為 `accessories|sandals`（650g），否則維持 `accessories|shoes`（1200g）
- **所有包款（後背包/肩包/托特包）的 `category.name` 均為 `"bags"`**，Uniqlo API 無子分類，統一估算重量（見 `WEIGHT_MAP`）

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

## 航空禁運品封鎖

系統採**兩層封鎖機制**，任一層命中即回覆使用者「無法提供代購」訊息（不顯示商品卡片）：

### 第一層：品牌專屬封鎖

| 品牌          | 封鎖方式                                                      | 管理位置                                           |
| ------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| **RsTaichi**  | SKU 白名單黑名單（`RSTAICHI_BLOCKED_SKUS`）                   | `server/utils/brandConfig.ts`                      |
| **Kushitani** | PID 黑名單（`KUSHITANI_BLOCKED_PIDS`）                        | `server/utils/brandConfig.ts`                      |
| **FR2**       | 關鍵字比對商品標題 **+ body description**（比其他品牌更嚴格） | `server/utils/scrape/fr2.ts` `RESTRICTED_KEYWORDS` |
| **Uniqlo**    | 商品分類 `class.name === 'flower'` → 花卉/植物類全部封鎖      | `server/api/webhook.post.ts`                       |

### 第二層：跨品牌全局關鍵字（標題比對）

定義於 `server/utils/brandConfig.ts` → `GLOBAL_RESTRICTED_KEYWORDS`，適用所有品牌：

| 類別           | 關鍵字範例                                                      |
| -------------- | --------------------------------------------------------------- |
| 點火/燃料      | ライター、lighter、アルコール、ガソリン、灯油                   |
| 電池/充電      | バッテリー、電池、充電式、リチウム、lithium                     |
| 噴霧           | スプレー、spray                                                 |
| 化妝品液體     | 香水、パルファム、マニキュア、nail polish                       |
| 花卉/植物      | 生花、花束、ブーケ、盆栽、鉢植え、種子、苗木                    |
| **液體護理品** | シャンプー、shampoo、コンディショナー、リンス、ヘアオイル、洗顔 |

> FR2 的 `RESTRICTED_KEYWORDS` 與全局關鍵字**內容相同**（液體類已同步），但 FR2 額外比對 description，因此可攔截標題未寫明成分但 description 有說明的商品（例如：洗髮精成分說明、充電電池規格描述）。

> **要新增封鎖關鍵字**：`GLOBAL_RESTRICTED_KEYWORDS`（全品牌標題）+ FR2 的 `RESTRICTED_KEYWORDS`（FR2 標題+描述）都要同步修改。

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

## 結帳頁金額變數定義（`pages/checkout.vue`）

結帳時每件商品會計算兩個台幣金額，兩者**定義不同**，不可混用：

| 變數       | 意義                                                | 計算方式                                                                                                      |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `priceTwd` | **客戶實際付的售價**                                | `parsePriceTwd(displayPrice, rate)` — ¥ 商品走「匯率 + 加碼」；NT$ 商品直接回傳面額                           |
| `costTwd`  | **我方代購成本**（寫入試算表 W/X/Y 欄，利潤計算用） | ¥ 商品：`parseJpy(displayPrice) × rate`（只有匯率，不含加碼）；NT$ 自訂售價：成本不明，保守以 `priceTwd` 代入 |

> ⚠️ **`costTwd` 命名注意**：`getShippingTwd()` 回傳的物件也有 `costTwd` 欄位（`shippingInfo.costTwd`），代表的是**國際運費台幣金額**，與上方代購進貨成本完全不同。兩者一個透過物件存取，一個是 `.map()` 內的 local 變數，作用域不重疊，不會 runtime 衝突，但閱讀時需注意語意差異。

> **NT$ 自訂售價（Kushitani 含運直送）為什麼 `costTwd = priceTwd`？**
> 這類商品是談好的固定報價，日幣成本與台幣售價的換算關係不透明，
> 因此系統無法分拆利潤。以 `priceTwd` 代入 `costTwd` 意味著利潤登記為 0，
> 這是刻意保守的做法，**不代表真的沒有利潤**。
> 如未來需要追蹤 Kushitani 自訂售價的實際成本，
> 可以在 `server/data/kushitani-pricing.json` 加入 `costTwd` 欄位並在此處讀取。

---

## 銀行轉帳優惠

- 付款方式選「銀行轉帳」→ 享有 3% 折扣（相較信用卡/綠界）
- 折扣在 `checkout.vue` 計算，結帳時以 `discountTwd` 傳給 `submit-order`
- 目前將綠界拿掉了，若未來需要串接綠界再打開 `OrderForm.vue` 隱藏的綠界支付方式。

## 折扣碼規則

- 折扣碼驗證在 `server/api/validate-coupon.post.ts` 與 `server/api/submit-order.post.ts` 會共用同一套計算邏輯
- 固定折扣：沿用 `coupon_codes.discount_twd`
- 件數階梯折扣：使用 `coupon_codes.discount_rules` JSON 陣列，例如 `[{"minItems":3,"discountTwd":100},{"minItems":5,"discountTwd":300}]`
- 判定基準是購物車「實際件數總和」（`quantity` 加總），不是商品列數
- checkout 送出時會帶 `itemCount` 供前端即時驗證，但送單時仍會由後端重新計算一次，避免前端被竄改
- 階梯折扣若同時設了多個門檻，系統會套用「符合條件的最高門檻」

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

Uniqlo / GU API 的商品資料含有 `priceFlags[]` 陣列。Scraper（`scrape/uniqlo.ts`、`scrape/gu.ts`）讀取此陣列，若存在**含 `effectiveTime.end` 欄位**的旗標，即視為限時特價：

| flag code 範例       | 說明                                      |
| -------------------- | ----------------------------------------- |
| `limitedOffer`       | 一般期間限定特價                          |
| `appmemberLimited`   | APP 會員特別價格（同樣有截止日）          |
| `discount`           | 無截止日的長期降價，**不觸發**截止提醒    |

> 偵測條件：`priceFlags.find(f => f.effectiveTime?.end)`，只要有截止時間就觸發，不限定 code 名稱。

Scraper 回傳以下欄位：

| 欄位               | 說明                                                         |
| ------------------ | ------------------------------------------------------------ |
| `isLimitedOffer`   | `true` = 有截止日的限時特價                                  |
| `promoEndTs`       | 截止時間戳（秒，UTC+7 為基準，Uniqlo/GU API 內部格式）       |
| `promoDisplayDate` | API `nameWording.substitutions.date` 字串（e.g. `"5/7"`），與官網顯示一致 |

> **重要**：`promoEndTs` 的時間戳以 UTC+7 為基準，直接用 UTC+8 換算會出現「隔天」，因此系統**優先使用 `promoDisplayDate`** 字串顯示截止日，而非從時間戳推算。

### 截止日顯示邏輯（`webhook.post.ts`）

用戶加入購物車後，若為限時特價，LINE Bot 會傳送以下格式的提醒：

```
⏰ 此商品為期間限定特價（至 5/7 止）。
本店採購截止為 5/7 22:00（台灣時間），請於此時間前提交訂單。
逾時若特價已結束，隔日將通知補足差額；如不願補差額，退款時將扣除手續費後退回，敬請知悉。
```

- **截止日** = `promoDisplayDate`（直接沿用 Uniqlo/GU 官網顯示的日期字串，e.g. `5/7`）
- **本店採購截止** = 截止日當天 22:00 台灣時間（即截止日**當天**都還有優惠，22:00 是我方採購下單時間）
- 無 `promoDisplayDate` 時 fallback 為從 `promoEndTs` 換算 UTC+8

### 每日截單時間

系統每日**台灣時間 22:00** 統一至日本下單，為 hardcoded 字串，非動態計算。

> **要修改截單時間 → 須同步修改兩個地方**：
>
> 1. `server/api/webhook.post.ts` — `promoWarning` 字串（含「22:00（台灣時間）」）
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
