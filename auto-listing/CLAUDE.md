# Auto-Listing 自動上架系統說明

**網站：** roml-life.com（WooCommerce）  
**商業模式：** 日本代購，庫存在結帳時即時查日本官網，不在 WooCommerce 端管理庫存。

---

## 如何請 Claude 自動上架

只需說：**「請幫我上架這個商品：[RS TAICHI 商品頁 URL]」**

Claude 會依序：
1. 執行 `scrape.ts` 爬取商品資料 → 生成草稿 JSON
2. 填寫 SEO 文案（名稱、說明、關鍵字、meta）
3. 計算定價（代購算法單件結算）
4. 執行 `create.ts` 上架（狀態：草稿）

你只需要手動：
- 後台預覽確認 → 點「發布」
- 媒體庫移動圖片到正確 JoomUnited 資料夾

---

## 上架指令

```bash
# 步驟 1：爬取商品資料
npx tsx --env-file=.env auto-listing/src/scrape.ts <商品頁URL>

# 步驟 2（Claude 填好文案後）：上架
npx tsx --env-file=.env auto-listing/src/create.ts auto-listing/drafts/<SKU>.json
```

---

## 定價算法（單件結算）

RS TAICHI 商品價格 = **商品台幣 + 國際運費**，設在所有變體的 `regular_price`。

```
商品台幣 = jpyToTwd(日幣價格)
         = 日幣 × (台銀賣出匯率 0.205 + 階梯加碼)
         階梯：≤¥990 +10%  ≤¥1990 +9%  ≤¥2990 +3%
               ≤¥3990 +2.5%  ≤¥4990 +2.3%  ≤¥5990 +2.2%  >¥5990 +2%
         利潤不足 NT$100 → 補足至 NT$100

國際運費 = 國際小包（RS TAICHI 強制），含包材重量 +8% 安全係數
         重量來自爬蟲（梱包重量 + 500g 包材，已含在 scraped.weightGrams）

售價 = 商品台幣 + 國際運費
```

定價計算在 `create.ts` 中呼叫 `shared/pricing.ts` 和 `shared/shipping.ts`。

---

## 商品設定規則（已固化在程式碼）

| 項目 | 設定 |
|---|---|
| 上架狀態 | `draft`（草稿）→ 後台確認後手動發布 |
| 庫存 | `instock` + `manage_stock: false` |
| 圖片 | 去重（先查媒體庫同檔名，有則用現有 ID） |
| 變體圖片 | 每個顏色各自指定對應圖片 ID（換色時主圖跟著換） |
| 變體建立 | Batch API（一次最多 100 個，快且穩） |

---

## SEO 文案規則

| 項目 | 規則 |
|---|---|
| 焦點關鍵字 | 中文產品類型詞（如「透氣機車手套」） |
| SEO 標題 | `{關鍵字} RS TAICHI {SKU} {英文品名} \| 騎旅生活`，關鍵字**必須在最前面**，像素寬約 350-520px（≤ 580px 上限）。**禁止**在標題中再加中文翻譯名稱，否則會超出 Yoast 可見長度。 |
| Meta description | **120~155 字元**，起頭放英文全名 `RS TAICHI {SKU} {English Name}`，再接關鍵字描述句 + 特色 + 規格 + 「日本原廠公司貨，騎旅生活代購直送台灣。」 |
| Slug | 英文小寫含品牌+型號，**結尾一定要加中文焦點關鍵字**（如 `rs-taichi-rst469-urban-air-glove-透氣機車手套`）。Yoast「代稱中的關鍵字詞」會檢查 slug decoded 值是否含關鍵字，英文 slug 無法通過。 |
| 商品說明 | 2 個 H2 含關鍵字，300字+，含外部連結到 rs-taichi.com |
| 短說明 | 2 段，第一段含關鍵字 |
| 圖片 alt | `{imageAlt} {顏色}`，imageAlt 含品牌+型號+中文名 |
| Yoast 橘燈 | Yoast Free 限制，3 項內容分析永遠橘燈，接受，實際 SEO 正確 |

---

## 全站 Code Snippets（roml-life.com）

### Snippet #9「ROML - 變體一律顯示 instock」（常駐啟用）

四重 filter，缺一不可：
```php
add_filter( 'woocommerce_variation_is_visible', '__return_true', 99 );
add_filter( 'woocommerce_available_variation', function ($data, $product, $variation) {
    $data['is_in_stock']         = true;
    $data['is_purchasable']      = true;
    $data['variation_is_active'] = true;
    $data['availability_html']   = '';
    return $data;
}, 10, 3 );
add_filter( 'woocommerce_variation_is_active', '__return_true', 99, 2 );
add_filter( 'woocommerce_is_purchasable', '__return_true', 99, 2 );
```

**為什麼需要四個：**
1. `variation_is_visible` → parent 非 publish 時變體 JSON 不嵌入頁面
2. `available_variation` → 覆蓋 JS 看到的變體狀態（instock/purchasable/active）
3. `variation_is_active` → 防止 JS 把變體標為 disabled
4. `is_purchasable` → server-side add-to-cart 驗證（price='' 也能買）

---

## 圖片資料夾（手動步驟）

JoomUnited WP Media Folder 沒有 REST API，每次上架後需手動：
- 後台 → 媒體庫 → 搜尋 `{SKU}` → 選取所有圖片 → 拖到正確資料夾

| 商品類型 | JoomUnited 資料夾 |
|---|---|
| RS TAICHI 春夏款手套 | 手套 > RS TAICHI > 春夏款 |
| RS TAICHI 秋冬款手套 | 手套 > RS TAICHI > 秋冬款 |
| RS TAICHI 春夏款防摔褲 | 防摔褲 > RS TAICHI > 春夏款 |
| RS TAICHI 車靴 | 車靴 > RS TAICHI > 春夏款 |
| RS TAICHI 雨具 | 雨具 |

---

## 已上架商品（2026 春夏手套系列）

| SKU | WooCommerce ID | 狀態 |
|---|---|---|
| RST469 URBAN AIR GLOVE | #8681 | publish |
| RST474 LIGHT AIR GLOVE | #8803 | publish |
| RST467 CHARGE AIR GLOVE | #8829 | publish |
| RST471 SMART AIR GLOVE | #8854 | publish |
| RST468 STROKE AIR GLOVE | #8892 | publish |
| RST470 BOLT AIR GLOVE | #8933 | publish |
| RST465 WRX PRO AIR GLOVE | #8974 | publish |
| RST442 RAPTOR MESH GLOVE | #9005 | publish |
| RST444 VELOCITY MESH GLOVE | #9047 | publish |
| RST441 RAPTOR LEATHER GLOVE | #9100 | publish |
| RST472 ELEMENT PROTECTION GLOVE | #9121 | publish |
| RST473 ORBIT-TECT CARBON GLOVE | #9154 | publish |
| RST449 DRYMASTER FIT RAIN GLOVE | #9186 | publish |
| RST450 DRYMASTER FIT EDGE RAIN GLOVE | #9208 | publish |
| RST451 DRYMASTER COMPASS GLOVE | #9227 | publish |

---

## 已上架商品（2026 春夏防摔衣系列）

| SKU | WooCommerce ID | 狀態 |
|---|---|---|
| RSJ356 LIGHT AIR JACKET | #9250 | draft |
| RSJ354 AIR PARKA | #9282 | draft |
| RSJ334 AIR FLIP PARKA | #9352 | draft |
| RSJ353 MILES AIR JACKET | #9422 | draft |
| RSJ345 TORQUE AIR JACKET | #9451 | draft |
| RSJ342 QUICK DRY RACER JACKET | #9483 | draft |
| RSJ335 QUICK DRY PARKA | #9508 | draft |
| RSJ351 AIR FLIGHT JACKET | #9566 | draft |
| RSJ343 QUICK DRY FLIGHT JACKET | #9595 | draft |
| RSJ355 QUICK DRY SMART JACKET | #9630 | draft |
| RSJ349 CORDURA CREW NECK | #9652 | draft |
| RSJ352 CORDURA HOODIE | #9675 | draft |
| RSJ340 COMPASS AIR JACKET | #9703 | draft |
| RSJ729 DRYMASTER COMPASS ALL-SEASON JACKET | #9731 | draft |
| RSJ337 PROTECTION MESH VEST | #9757 | draft |

---

## 已上架商品（2026 春夏防摔褲系列）

| SKU | WooCommerce ID | 狀態 |
|---|---|---|
| RSY273 CORDURA LIGHT AIR PANTS | #9766 | draft |
| RSY274 CORDURA LIGHT DENIM PANTS | #9792 | draft |
| RSY258 QUICK DRY CARGO PANTS | #9809 | draft |
| RSY271 QUICK DRY STRAIGHT PANTS | #9858 | draft |
| RSY272 QUICK DRY MESH PANTS | #9910 | draft |
| RSY263 QUICK DRY JOGGER PANTS | #9947 | draft |
| RSY269 COMPASS AIR PANTS | #9972 | draft |

---

## 已上架商品（2026 春夏車靴系列）

| SKU | WooCommerce ID | 狀態 |
|---|---|---|
| RSS016 DRYMASTER STRIKER SHOES | #10005 | draft |
| RSS011 DRYMASTER-FIT HOOP SHOES | #10080 | draft |
| RSS012 HOOP AIR SHOES | #10135 | draft |
| RSS014 DRYMASTER BRAKE SHOES | #10163 | draft |
| RSS013 DRYMASTER ARROW SHOES | #10228 | draft |
| RSS010 DRYMASTER COMBAT SHOES | #10283 | draft |

---

## 已上架商品（雨具）

| SKU | WooCommerce ID | 狀態 |
|---|---|---|
| RSR048 DRYMASTER RAIN SUIT | #10311 | draft |

---

## 上架後修正腳本

### 2026 春夏手套系列

```bash
npx tsx --env-file=.env auto-listing/src/fix-seo-spring-gloves.ts
npx tsx --env-file=.env auto-listing/src/fix-categories-spring-gloves.ts
npx tsx --env-file=.env auto-listing/src/fix-short-desc-spring-gloves.ts
npx tsx --env-file=.env auto-listing/src/fix-social-spring-gloves.ts
npx tsx --env-file=.env auto-listing/src/fix-slug-spring-gloves.ts
```

### 2026 春夏防摔衣系列

```bash
npx tsx --env-file=.env auto-listing/src/fix-seo-spring-jackets.ts
npx tsx --env-file=.env auto-listing/src/fix-slug-spring-jackets.ts
```

> 防摔衣系列在上架時已直接寫入完整 SEO 文案（slug、shortDesc、metaDesc、focusKeyword），
> fix-seo 和 fix-slug 只需執行一次以確認 Yoast 重新分析。
> 分類修正（防摔衣 > RS TAICHI > 春夏款）待後台確認分類樹後另行建立 fix-categories-spring-jackets.ts。

### 2026 春夏防摔褲、車靴、雨具系列

```bash
npx tsx --env-file=.env auto-listing/src/fix-seo-spring-pants-boots-rain.ts
npx tsx --env-file=.env auto-listing/src/fix-slug-spring-pants-boots-rain.ts
npx tsx --env-file=.env auto-listing/src/fix-social-spring-pants-boots-rain.ts
```

---

## 常見錯誤根因

**完整踩坑紀錄見：** `~/.claude/projects/-/memory/woo-autolisting-pitfalls.md`

速查：
- 已下架 → status 必須 publish + Snippet #9 四重 filter
- 不能選購 → `woocommerce_is_purchasable` filter 缺失
- 圖片不隨色變 → 變體沒設 `image: { id }`
- 圖片重複 → 用 `wp.ensureImage()` 去重，不用 `{ src: url }`
- Yoast 橘燈（內容相關） → Yoast Free 限制，接受
