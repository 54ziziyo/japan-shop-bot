# 上架規則總覽 — roml-life.com

每次幫 roml-life.com 上架商品，Claude 必須遵守以下所有規則。
這份文件是唯一的上架規範，優先於任何其他說明。

---

## 流程

```
1. scrape      → 自動爬取官網圖片、顏色、尺寸、價格、重量
2. fill-content → Claude 填寫 ListingContent（本文件規範的部分）
3. create       → 自動上傳圖片、計算價格、建立 WooCommerce 商品、寫入 Yoast SEO + 社交 meta
```

步驟 1 和 3 全自動，不需要手動補跑任何 fix-social / fix-slug / fix-seo 腳本。

---

## 禁止事項

- ❌ 不得填寫任何價格數字（台幣、日幣都不行）
- ❌ 商品說明不得加入未經官方資料查證的規格數字（重量、防護等級、材質比例等）
- ❌ 不得使用日文字（顏色名稱、商品名稱全部用繁體中文）

---

## 一、name（商品名稱）

格式：`{品牌} {SKU} {英文型號名} {中文品名} {補充關鍵字}`

範例：
```
KUSHITANI K-2454 Air Contendo Jacket 網眼防摔衣 夏季機車騎士外套
RS TAICHI RSJ356 LIGHT AIR JACKET 輕量透氣防摔衣 夏季機車騎士外套
```

規則：
- 品牌全大寫，SKU 保持原廠格式
- 中文品名要能獨立作為搜尋關鍵字
- 不超過 70 字元（WooCommerce SEO 最佳實踐）

---

## 二、slug（網址代稱）

格式：`{品牌}-{sku}-{英文品名}-{中文焦點關鍵字}`（全小寫，連字號分隔）

範例：
```
kushitani-k-2454-air-contendo-jacket-網眼防摔衣
rs-taichi-rsj356-light-air-jacket-輕量透氣防摔衣
```

規則：
- **末尾必須有中文焦點關鍵字**，Yoast「代稱中的關鍵字詞」才能通過
- 中文直接寫，WordPress 會自動 URL encode，舊連結自動 301 轉址
- 英文部分全小寫，數字和連字號保留

---

## 三、focusKeyword（焦點關鍵字）

格式：`{品牌} {SKU} {中文品名}`

範例：
```
KUSHITANI K-2454 網眼防摔衣
RS TAICHI RSJ356 輕量透氣防摔衣
```

規則：
- 必須在 metaDescription、shortDescriptionHtml 第一段、slug 中出現
- 不能拆開（Yoast 的「連續出現」檢查）

---

## 四、seoTitle（SEO 標題）

格式：`{focusKeyword} {英文型號名} {補充說明}`

範例：
```
KUSHITANI K-2454 網眼防摔衣 Air Contendo Jacket 夏季騎士外套
RS TAICHI RSJ356 輕量透氣防摔衣 LIGHT AIR JACKET 夏季
HYOD STJ421D 夏季網眼防摔外套 ST-X THE MESH MINERVA
```

規則：
- **Yoast 用像素寬度計算，中文字約為英文字 2 倍寬**
- 目標像素寬度 400–600px（約等同 50–60 英文字元）
- 實際規則：**英文字元 + 中文字數×2 合計不超過 55**
- 焦點關鍵字放最前面
- **不要加「| 騎旅生活」** — 中文字佔寬，加了會超出上限，Yoast 會紅燈
- 不要加 `%%` 模板變數（REST API 上架不適用）
- 寫完後粗估：數英文字元 + 中文字數×2，確認 ≤ 55

---

## 五、metaDescription（中繼資料內容說明）

規則：
- **最短 120 字元，最長 156 字元**（Yoast 強制）
- 必須包含焦點關鍵字，且關鍵字必須**連續出現**（不能被其他詞拆開）
- 寫完之後必須用 `len()` 或手動數字數驗證，不能靠感覺
- 結尾可加「騎旅生活日本代購直送台灣。」補字數

範例（144字）：
```
KUSHITANI K-2454 網眼防摔衣採用高透氣網眼布料搭配 CE Level 1 護具，肩/肘/背三點防護，
多色可選，日本原廠規格直送台灣。騎旅生活日本代購，安心直送。
```

---

## 六、shortDescriptionHtml（商品簡短說明）

規則：
- **可見字元（去除 HTML 標籤後）必須 ≥ 300 字元**
- **第一個 `<p>` 必須包含焦點關鍵字，建議用 `<strong>` 包住**
- 建議兩段：第一段主打功能特色，第二段尺寸/顏色/購買說明
- 結尾提及「騎旅生活日本代購直送台灣」

範例：
```html
<p>KUSHITANI K-2454 是 KUSHITANI 最新款<strong>網眼防摔衣</strong>，採用…</p>
<p>共有 白色/黑色、深紅色、深藍色、黑色 四色，尺寸 S～4XL。…騎旅生活代購直送台灣。</p>
```

---

## 七、descriptionHtml（商品說明）

必須包含，字數目標 **1000 字以上（可見文字）**：

### 結構（必須照此順序展開）

```html
<h2>💡 核心技術與規格特色</h2>

<h3>1. {主要材質/技術名稱}</h3>
<p>官方技術說明 + 對騎士的實際體感差異</p>
<ul>
  <li><strong>重點一：</strong>說明</li>
  <li><strong>重點二：</strong>說明</li>
</ul>

<h3>2. {第二大技術點}</h3>
<p>說明</p>

<h3>3. {防護系統}</h3>
<p>出廠護具規格：部位、型號、CE 認證等級</p>
<ul>
  <li><strong>肩部與肘部：</strong>護具型號 + CE Level</li>
  <li><strong>背部脊椎：</strong>護具型號 + CE Level</li>
</ul>

<h3>4. {版型/剪裁特色}</h3>
<p>說明</p>

<h2>🎯 貼心細節設計</h2>
<p>2–4 個小細節，用文字段落或列表說明</p>

<h2>🇹🇼 台灣在地選購指南與推薦理由</h2>
<p>為什麼台灣騎士特別適合？（氣候、騎乘習慣）</p>
<p>顏色、尺寸說明</p>
<p>穿搭建議（搭配防摔褲等）</p>
<p>外連結到官方網站 + 內連結到店內相關商品</p>
```

### 外連結（必須有）
連結到日本官方品牌網站，用 `target="_blank" rel="noopener"`：
```html
詳細規格請參考 <a href="https://www.hyod-products.com/" target="_blank" rel="noopener">HYOD PRODUCTS 官方網站</a>。
```

### 內連結（必須有）
連結到 roml-life.com 店內相關商品：
```html
搭配 <a href="https://roml-life.com/product-category/重機部品/防摔褲">HYOD 防摔褲</a> 整套防護效果更佳。
```

### 官方資料查證（必須做）
- 防護等級（CE Level 1 / Level 2）必須查官方規格頁確認
- 護具型號（D3O® Diablo™ 等）必須查官方確認
- 材質（牛皮 / 聚酯纖維比例）必須查官方確認
- **不確定的規格不填**，避免誤導消費者
- 禁止在描述中填寫任何價格數字

---

## 八、imageAlt（圖片 alt 文字基底）

格式：`{品牌} {SKU} {中文品名}`

範例：
```
KUSHITANI K-2454 網眼防摔衣
```

規則：
- 系統會自動組成 `{imageAlt} {顏色}` 格式套用到每張圖
- 例如：`KUSHITANI K-2454 網眼防摔衣 黑色`、`KUSHITANI K-2454 網眼防摔衣 深紅色`
- 不需要手動填每個顏色，只填基底即可

---

## 九、category（商品分類）

使用路徑格式，斜線分隔：
```
KUSHITANI/防摔衣
KUSHITANI/防摔褲
KUSHITANI/手套
RS TAICHI/防摔衣
```

---

## 十、自動處理（不需要手動）

以下由腳本全自動完成，填 content 時不需要考慮：

| 項目 | 說明 |
|------|------|
| 圖片爬取 | 從日本官網自動抓各顏色主圖 |
| 圖片 alt | `{imageAlt} {顏色}` 自動組合 |
| 顏色選圖 | 每個顏色 variation 自動綁定對應圖片 |
| 尺寸建立 | 從官網 Colorme 資料自動解析有庫存的尺寸 |
| 定價計算 | 日幣 × 匯率 + 運費（按重量自動計算）|
| 社交 meta | OG + Twitter title/description/image 在 create 時自動寫入 |
| Yoast SEO | focusKeyword/seoTitle/metaDescription 在 create 時自動寫入 |

---

## 十一、Yoast 永久橘燈（正常，不需處理）

Yoast Free 對 WooCommerce 只讀 `short_description`（`post_excerpt`），無法讀 `description`（`post_content`）。
以下橘燈屬正常現象，不是錯誤：
- 子標題中的關鍵字詞
- 文字長度
- 第一段無關鍵字（指 post_content 的第一段）

---

## 十二、上架後手動確認

1. 進後台確認排版、價格、變體是否正確
2. 把圖片移到對應媒體資料夾（例：KUSHITANI > 防摔衣 > 2025 秋冬款）
3. 確認 OK 後點「發布」上線
