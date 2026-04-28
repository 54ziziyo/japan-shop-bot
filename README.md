# 洛姆日貨代購機器人（Japan Shop Bot）

LINE 官方帳號的日本代購服務，整合 **Uniqlo**、**GU**、**RS Taichi（重機）**、**Kushitani（重機）**、**FR2（潮流服飾）**、**BAPE（潮流服飾）**、**AAPE（潮流服飾）** 等多品牌商品查詢、購物車、結帳、訂單管理、Google 試算表同步及自動化運維。

---

## 近期重要更新（2026-04-29）

| 項目                                  | 說明                                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🐛 BAPE jp.bape.com CDN store ID 修正 | cards/bape.ts 壓縮前綴與 webhook.post.ts 重建路徑均更新為正確的 `1/0326/3660/0451`（原錯誤 `1/0553/6863/3473`），修正前所有 jp.bape.com 圖片無法壓縮，postback 超長                                                    |
| 🐛 bapepirate.com productUrl 修正     | webhook.post.ts brand=bape 區塊改以 `BAPEP:` 前綴判斷，bapepirate 商品正確重建為 `bapepirate.com/products/{handle}`                                                                                                    |
| ✨ bapepirate.com 國內運費邏輯        | bapepirate 商品以 `category='bape\|{g}'` 存儲，shared/shipping.ts 的 bape 判斷已涵蓋，固定 ¥400                                                                                                                        |
| ✨ BAPE 重量規則擴充                  | 新增 `アイウェア`(100g)、`ニット`(400g)、`シューズ`(800g) product_type；name 規則新增眼鏡、手機殼、吊飾、公仔、填充玩具、靠枕、水瓶/保溫瓶、項鍊/錶帶、泳裝、內衣；KEYRING 加入 KEYCHAIN 規則；BANDANA 加入 SCARF 規則 |
| ✨ AAPE 重量規則擴充                  | name 規則新增眼鏡、腰帶、手錶、項鍊/手環、錢包/小物、保溫瓶/馬克杯、泳裝（涵蓋 食器/キッチン、ファッション雑貨 等分類）                                                                                                |
| ✨ AAPE 後背包重量修正                | backpack 規則移至 bag 通用規則之前，後背包淨重 800g + 500g 包材 = 1300g（原錯誤走 bag 規則 800g）                                                                                                                      |
| 🎨 AAPE LINE 卡片顏色統一             | overlay/footer 背景色改為與 BAPE 一致的 `#3d4e4a`；footer 文字移除獅子 emoji                                                                                                                                           |
| 🎨 F size 按鈕文字優化                | BAPE、AAPE 商品尺寸為 Free size 時，按鈕顯示「加入購物車」而非「加入購物車 \| F」                                                                                                                                      |

**2026-04-29（先前批次）**

| 項目                       | 說明                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| ✨ AAPE（aape.jp）全新支援 | 支援 aape.jp 商品網址、LINE 卡片、庫存、結帳前同步檢查。國內運費固定 ¥440 含稅               |
| ✨ bapepirate.com 支援     | BAPE 官方貿易商店商品網址直接支援、與 jp.bape.com 共用同一爬蟲                               |
| ✨ 通用非日本版官網偵測    | 移除硬編碼 kr.bape.com，改用 `detectNonJapaneseSite()` 涵蓋 BAPE/Uniqlo/GU/AAPE 非日本子網域 |

**2026-04-28**

| 項目                                  | 說明                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| 🔒 移除 checkout.post.ts 公開端點     | 該 fallback 端點為死碼且無身分驗證，已直接刪除消除攻擊面                                   |
| 🔒 折扣碼查詢統一錯誤訊息             | `validate-coupon.post.ts` 不存在/停用/過期統一回傳「折扣碼無效」，防止外部試探碼的存在狀態 |
| 🔒 sync-cart 新增最大 30 件上限       | 防止惡意送入大量商品觸發爬蟲請求                                                           |
| 🐛 Kushitani 國內運費邏輯新增         | 訂單日幣總額（含稅）< ¥22,000 收 ¥1,100；≥ ¥22,000 免運                                    |
| 🧹 移除 checkout.vue 偵錯 console.log | `formatTaiwanDeadline` 中殘留的開發期 log 已清除                                           |

**2026-04-27**

| 項目                            | 說明                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| 🐛 RS Taichi 運費多算 500g 修正 | 爬蟲與 `getCategoryWeight` 都在加 500g 包材，現已統一只加一次           |
| 🐛 Kushitani 強制國際小包修正   | `checkout.vue` 的 `forceIntlPacket` 現在正確偵測 `kushitani\|{grams>0}` |
| 🕐 訂單時間改為台灣時區         | 訂單編號與 Google 試算表 C 欄時間均改為 UTC+8                           |
| ✅ Kushitani 自訂售價全部含運   | `kushitani-pricing.json` 所有條目確認 `skipShipping: true`              |

> 詳細變更說明見 [docs/changelog.md](docs/changelog.md)

---

## 📖 文件導覽

| 文件                                               | 內容                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **README.md**（本頁）                              | 技術架構、目錄結構、操作流程、快速開始                                                                     |
| [docs/business-rules.md](docs/business-rules.md)   | 定價、匯率、運費、國內運費、品牌規則、試算頁面、驗證規則、**結帳頁金額變數定義**（`priceTwd` / `costTwd`） |
| [docs/database.md](docs/database.md)               | 環境變數、Supabase 資料表、Google 試算表、Apps Script                                                      |
| [docs/operations.md](docs/operations.md)           | 維運費用、爬蟲監控、效能設計、Vercel/Supabase 額度                                                         |
| [docs/extension-guide.md](docs/extension-guide.md) | 擴充新品牌步驟、系統連動修改對照表                                                                         |
| [docs/changelog.md](docs/changelog.md)             | 更新紀錄                                                                                                   |

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
│   ├── price.vue              # 運費試算工具頁（內部人員用，含完整計算細節）
│   └── estimate.vue           # 消費者價格試算頁（簡化版，僅顯示最終結果）
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
│   └── useExchangeRate.ts     # 匯率取得（含 localStorage 快取 + skipCache 選項）
│
├── server/
│   ├── api/                   # 後端 API 路由
│   │   ├── webhook.post.ts            # LINE Webhook 入口（處理所有 LINE 事件）
│   │   ├── sync-cart.post.ts          # 結帳前同步驗證商品價格與庫存（最多 30 件）
│   │   ├── submit-order.post.ts       # 提交訂單（DB + 試算表 + email）
│   │   ├── exchange-rate.get.ts       # 取得當前 JPY 匯率
│   │   ├── update-order-status.post.ts# Google Apps Script Webhook（更新訂單狀態）
│   │   ├── update-order-address.post.ts # 客戶修改收件地址
│   │   ├── cancel-expired-orders.get.ts # Vercel Cron：刪除逾期訂單
│   │   └── scraper-health.get.ts      # Vercel Cron：爬蟲健康檢查
│   │
│   └── utils/                 # 後端共用工具
│       ├── scrape/            # 各品牌爬蟲（uniqlo / gu / rstaichi / kushitani / fr2 / bape / aape）
│       ├── line/
│       │   ├── cards/         # 各品牌 LINE Flex Message 卡片產生器（...、bape / aape）
│       │   ├── shopCarousel.ts# 開始購物品牌導覽輪播
│       │   ├── faq.ts         # 購物須知 FAQ 內容
│       │   └── helpers.ts     # LINE API 工具
│       ├── brandConfig.ts     # 多品牌路由工具（detectBrand / 禁售清單）
│       ├── kushitaniPricing.ts# Kushitani 自訂售價查表
│       ├── exchangeRate.ts    # 從玉山銀行抓 JPY 現金賣出匯率
│       ├── googleSheets.ts    # Google Sheets 讀寫
│       └── supabase.ts        # Supabase 單例客戶端
│
├── shared/                    # Server + Client 共用邏輯（唯一來源）
│   ├── pricing.ts             # 匯率換算公式、加碼表、MIN_JPY_RATE
│   ├── shipping.ts            # 運費計算、商品重量查表
│   └── address.ts             # 台灣縣市清單 TW_REGIONS
│
├── utils/                     # Nuxt 自動 import（re-export shared/）
│   ├── pricing.ts
│   └── address.ts
│
├── docs/                      # 詳細文件（見上方文件導覽）
├── nuxt.config.ts             # Nuxt 設定、環境變數宣告
├── vercel.json                # Vercel Cron Job 排程設定
└── tailwind.config.js         # Tailwind 設定
```

---

## 使用者操作流程

```
LINE 官方帳號
    │
    ├─ 傳送商品網址（Uniqlo / GU / RS Taichi / Kushitani / FR2 / BAPE / AAPE）
    │       ↓
    │   webhook.post.ts → detectBrand() 辨識品牌 → 對應 scraper 抓商品資料
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

```
pending → confirmed → processing → packing
  （待付款）  （採購中）  （包裝中）   （已出貨）

任何狀態 → cancelled（手動取消）
pending  → 【自動刪除】（3 天未付款）
```

| 狀態值       | 中文顯示     | 說明                         |
| ------------ | ------------ | ---------------------------- |
| `pending`    | 待付款確認中 | 訂單剛建立，等待客戶銀行轉帳 |
| `confirmed`  | 商品採購中   | 已確認收款，開始採購         |
| `processing` | 商品包裝中   | 商品已到手，打包中           |
| `packing`    | 已出貨成功   | 已寄出，等待配送             |
| `cancelled`  | 訂單已取消   | 手動取消                     |

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
# 強制更新匯率快取（更新 Supabase，前端重開頁面即生效）
GET https://romoru.vercel.app/api/exchange-rate?force=1

# 手動觸發逾期訂單刪除（需帶 CRON_SECRET）
GET https://romoru.vercel.app/api/cancel-expired-orders?secret={CRON_SECRET}

# 本機測試逾期刪除
GET http://localhost:3000/api/cancel-expired-orders?secret={CRON_SECRET 值}
```

---

## 常見修改位置速查

| 想改什麼                  | 去哪改                                                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 加碼比例 / 定價公式       | `shared/pricing.ts` → `getRateMarkup()`                                                                                                                                                                                           |
| 最低匯率下限              | `shared/pricing.ts` → `MIN_JPY_RATE`                                                                                                                                                                                              |
| 商品重量估算              | `shared/shipping.ts` → `WEIGHT_MAP`                                                                                                                                                                                               |
| 服務費金額                | `shared/shipping.ts` → `SERVICE_FEE_TWD`                                                                                                                                                                                          |
| 國內運費常數              | `shared/shipping.ts` → `DOMESTIC_FLAT_FEE_JPY`（BAPE/FR2 固定 ¥400）、`AAPE_DOMESTIC_FEE_JPY`（AAPE 固定 ¥440）、`DOMESTIC_FREE_THRESHOLD_JPY`（Uniqlo/GU 門檻 ¥4,990）、`KUSHITANI_FREE_THRESHOLD_JPY`（Kushitani 門檻 ¥22,000） |
| 匯率備用值                | `server/utils/exchangeRate.ts` → `FALLBACK_RATE`                                                                                                                                                                                  |
| 逾期天數（3 天 → 改幾天） | `server/api/cancel-expired-orders.get.ts` → `EXPIRE_MS`                                                                                                                                                                           |
| 自動刪除執行時間          | `vercel.json` → `schedule`                                                                                                                                                                                                        |
| 訂單狀態新增 / 修改       | `server/api/update-order-status.post.ts` → `ALLOWED_STATUSES`、`orders.vue` 的 `STATUS_LABELS`、Google 試算表 H 欄下拉選單                                                                                                        |
| 銀行帳號 / 行名           | `submit-order.post.ts`、`OrderForm.vue`、`Success.vue`、`orders.vue` 各自的 `BANK_*` 常數（四處都要改）                                                                                                                           |
| Kushitani 自訂售價        | `server/data/kushitani-pricing.json`                                                                                                                                                                                              |
| Kushitani 禁售商品        | `server/utils/brandConfig.ts` → `KUSHITANI_BLOCKED_PIDS`                                                                                                                                                                          |
| 品牌分類選擇器            | `server/utils/line/shopCarousel.ts` → `buildCategorySelector()`                                                                                                                                                                   |
| 截單時間（22:00）         | `webhook.post.ts` → `promoWarning` + `OrderForm.vue` → 截單提醒文字（兩處都要改）                                                                                                                                                 |
| 結帳頁金額變數說明        | `pages/checkout.vue` inline 注釋 + [`docs/business-rules.md`](docs/business-rules.md) →「結帳頁金額變數定義」章節（`priceTwd` 客戶售價、`costTwd` 代購成本、`shippingInfo.costTwd` 運費，三者語意不同）                           |
