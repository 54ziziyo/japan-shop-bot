# japan-shop-bot

日本代購爬蟲 + 自動上架機器人。Nuxt 4 + TypeScript,部署在 Vercel(hnd1)。GitHub:`54ziziyo/japan-shop-bot`。

## ⚠️ 這個專案會直接寫入正式站,風險等級高

`auto-listing/` 這支流程會透過 WooCommerce REST API,把商品**直接寫進正式站 roml-life.com**(建立 pending 狀態商品)。這不是測試環境,是真的上架流程。

### 動手前的鐵律

- **絕對不要在沒有子芸明確指示的情況下執行 `auto-listing/src/listProduct.ts` 或任何會呼叫 WooCommerce API 寫入資料的腳本**——就算是「順手測試一下」也不行,那不是 dry-run,是真的會建立商品
- Vercel Cron 排程的兩支 API(取消逾期訂單、爬蟲健康檢查)是既有自動化,**不要新增/修改任何會自動觸發上架的排程**,上架永遠要維持人工觸發 + 人工審核 pending 商品
- 之後如果要建 CI/CD,測試只能測「爬蟲解析邏輯」「buildWooProduct 轉換邏輯」這類不連網的純邏輯,**CI 絕對不能連正式 WooCommerce API**

## Git 流程

commit / push / 開 PR 不用先問,可以直接做。**CI 綠燈就自動 merge;CI 紅燈或有 conflict,不能 merge,要主動跟子芸說清楚哪裡出錯。**

**這個規則只管「程式碼變更」的流程,跟上面「寫入正式站」的鐵律是兩件事,不能混為一談**——CI 綠燈只代表程式碼邏輯測試過關,不代表可以觸發 `listProduct.ts` 這類會寫入正式 WooCommerce 站的腳本。執行寫入正式站的動作,永遠需要子芸明確指示,這條不受「不用先問」規則影響。

## 敏感資訊

`.env` 裡有 `WC_CONSUMER_KEY`、`WC_CONSUMER_SECRET`(WooCommerce 正式站金鑰)、`ANTHROPIC_API_KEY`、Supabase key、LINE token 等 41 個變數,已確認在 `.gitignore` 內、未被 git 追蹤。**絕對不要把 `.env` 內容輸出到任何回覆、log、或 commit 進 git。**

## Package Manager

目前 npm 和 pnpm 的 lockfile 混用,尚未統一(待處理,見 CI/CD 規劃)。
