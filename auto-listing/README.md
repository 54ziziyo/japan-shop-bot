# 自動上架（auto-listing）

把 RS Taichi 商品網址 → 自動爬取 → 產生 SEO/GEO 文案 → 在 roml-life.com（WooCommerce）
建立**「送件審閱」變體商品**。價格留空、狀態為送審，需到後台確認、設定價格後再發布。

> 隔離原則：本資料夾只「import」既有爬蟲（`server/utils/scrape/`），**不改動現有檔案**，方便日後拆成獨立 repo。

## 功能（目前）

- ✅ **去重**：同 SKU 已上架就略過，不重複建立
- ✅ **SEO 名稱**：`品牌 型號 英文名 中文名 + 關鍵字`（Claude 生成）
- ✅ **正確分類**：抓官網分類 → Claude 判斷 → 自動填（含上層）
- ✅ **顏色 / 尺寸變體**：每尺寸庫存對應 `instock/outofstock`，並填商品 SKU（解決「貨號:不提供」）
- ✅ **狀態 = 送件審閱**（pending）
- ✅ **Yoast SEO**：自動填焦點關鍵字 / SEO 標題 / 中繼描述
- ✅ **SEO+GEO 商品說明**：Claude 生成完整段落 + 簡短說明
- ✅ **圖片 alt / 標題**：帶 SEO 文字
- ✅ **季節解析**：從圖片檔名（如 `_26ss`）解析出「2026 春夏款」，存入 meta `_source_season`
- ⬜ **圖片實體檔名 + 丟進 JoomUnited 媒體資料夾**：需 WordPress 應用程式密碼（之後做）
- ⬜ 之後：列表批次爬 + 排程、HYOD 爬蟲、結帳即時查庫存

## 一、設定金鑰（只需做一次）

把 `auto-listing/.env.example` 裡的變數複製到專案根目錄的 `.env`：

| 變數 | 說明 |
|---|---|
| `WC_STORE_URL` | 例：`https://roml-life.com`（結尾不要斜線） |
| `WC_CONSUMER_KEY` | WooCommerce REST API 金鑰（`ck_`，讀/寫） |
| `WC_CONSUMER_SECRET` | WooCommerce REST API 密鑰（`cs_`） |
| `ANTHROPIC_API_KEY` | Claude 金鑰（**完整流程必填**，產名稱/說明/分類用） |

`.env` 已被 `.gitignore`，密鑰不會進版控。

## 二、先測連線

```bash
npx tsx --env-file=.env auto-listing/src/testConnection.ts
```

## 三、上架一個商品

```bash
npx tsx --env-file=.env auto-listing/src/listProduct.ts <RS Taichi 商品網址>
```

例（這些是真實存在的商品）：

```bash
npx tsx --env-file=.env auto-listing/src/listProduct.ts https://www.ec.rs-taichi.com/rst469.html
```

跑完印出後台編輯連結；商品為「送件審閱」、價格留空，到後台設定價格後即可發布。

## 檔案（單一功能）

```
listProduct.ts    主流程：爬→季節→分類→Claude文案→去重→組→建
season.ts         圖片檔名 → 西元年+春夏/秋冬
generate.ts       Claude 產 SEO/GEO 文案（名稱/說明/分類/Yoast 中繼/alt）
categories.ts     Claude 選的分類名稱 → WooCommerce id（含上層）
buildProduct.ts   組成 WooCommerce payload（純轉換）
woocommerce.ts    REST API：查分類 / 去重 / 建送審商品 + 變體
config.ts         讀取/驗證環境變數
testConnection.ts 金鑰連線測試
test-build.ts     離線轉換測試（npx tsx auto-listing/test-build.ts）
```
