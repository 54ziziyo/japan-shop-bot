# 資料庫與外部服務

> 返回 [README](../README.md)

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

| 欄位                  | 類型        | 說明                                |
| --------------------- | ----------- | ----------------------------------- |
| `id`                  | uuid        | 主鍵，Supabase 自動產生             |
| `user_id`             | text        | LINE userId                         |
| `line_name`           | text        | LINE 顯示名稱                       |
| `customer_name`       | text        | 收件人姓名                          |
| `phone`               | text        | 手機號碼（格式：09xxxxxxxx）        |
| `address`             | text        | 收件地址                            |
| `payment_method`      | text        | `bank_transfer` 或 `ecpay`          |
| `account_last5`       | text        | 轉帳帳號末五碼（銀行轉帳才有）      |
| `items`               | jsonb       | 商品明細陣列                        |
| `total_jpy`           | int         | 商品小計（日幣）                    |
| `grand_total_twd`     | int         | 含稅總額（台幣）                    |
| `coupon_code`         | text        | 折扣碼代碼（可為 null）             |
| `coupon_partner_name` | text        | 網紅名稱 / 代碼（可為 null）        |
| `coupon_discount_twd` | int         | 折扣碼折抵金額（台幣）              |
| `coupon_commission_twd` | int       | 網紅分潤金額（台幣）                |
| `status`              | text        | 訂單狀態（見上方狀態表）            |
| `tracking_code`       | text        | 包裹追蹤碼（出貨後填入，可為 null） |
| `created_at`          | timestamptz | 建立時間（自動）                    |

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

### `exchange_rates`（匯率快取）

| 欄位         | 說明                               |
| ------------ | ---------------------------------- |
| `currency`   | 快取 key（固定為 `jpy_sell_rate`） |
| `rate`       | 匯率數值                           |
| `updated_at` | 更新時間                           |

### `coupon_codes`（折扣碼）

| 欄位             | 類型        | 說明                                                                 |
| ---------------- | ----------- | -------------------------------------------------------------------- |
| `id`             | uuid        | 主鍵，Supabase 自動產生                                              |
| `code`           | text        | 折扣碼代碼（唯一）                                                   |
| `partner_name`   | text        | 網紅名稱 / 代碼（可為 null）                                         |
| `discount_twd`   | int         | 固定折扣金額；若有 `discount_rules`，此欄會存 0 作為相容欄位           |
| `commission_twd` | int         | 固定分潤金額；若有階梯規則可作為預設分潤                              |
| `discount_rules` | jsonb       | 件數階梯折扣規則陣列，例如 `[{"minItems":3,"discountTwd":30,"commissionTwd":30}]` |
| `total_quantity` | int         | 發行數量（可使用總次數）                                              |
| `used_count`     | int         | 已使用次數                                                            |
| `is_active`      | bool        | 是否啟用                                                              |
| `expires_at`     | timestamptz | 到期時間，null = 永不過期                                            |
| `per_user_limit` | bool        | 是否每人限用一次                                                      |
| `created_at`     | timestamptz | 建立時間                                                              |

### `coupon_usages`（折扣碼使用紀錄）

| 欄位           | 類型        | 說明                     |
| -------------- | ----------- | ------------------------ |
| `id`           | uuid        | 主鍵，Supabase 自動產生  |
| `coupon_code`  | text        | 折扣碼代碼               |
| `line_user_id` | text        | LINE userId              |
| `created_at`   | timestamptz | 使用時間                 |

> 若資料庫尚未加入 `discount_rules`、`partner_name`、`commission_twd` 與訂單分潤欄位，請先執行：

```sql
alter table coupon_codes
add column if not exists discount_rules jsonb,
add column if not exists partner_name text,
add column if not exists commission_twd int;

alter table orders
add column if not exists coupon_code text,
add column if not exists coupon_partner_name text,
add column if not exists coupon_discount_twd int default 0,
add column if not exists coupon_commission_twd int default 0;
```

> 規則補充：若 `discount_rules` 有值，系統會依最高符合門檻自動套用折扣；`discount_twd` 保留作為舊固定折扣相容欄位。`discount_rules` 內也可加入 `commissionTwd`，若未填則會使用 `coupon_codes.commission_twd` 作為預設分潤金額。

---

## Google 試算表結構（訂單資訊）

H 欄「貨物狀態」為下拉選單，修改後由 Google Apps Script 觸發 Webhook 同步至 Supabase。

| 欄  | 內容                                                          |
| --- | ------------------------------------------------------------- |
| A   | 訂單編號（e.g. `RM2503181045ABCD`）                           |
| B   | 會員 ID（Supabase UUID，**Apps Script 用此欄比對**）          |
| C   | 下單時間                                                      |
| D   | LINE 名稱                                                     |
| E   | 客人姓名                                                      |
| F   | 手機號碼                                                      |
| G   | 地址                                                          |
| H   | 貨物狀態（下拉選單，選項需與 `ALLOWED_STATUSES` 一致）        |
| I   | 商品名稱（每件商品一列）                                      |
| J   | 商品照片 URL                                                  |
| K   | 商品顏色                                                      |
| L   | 商品尺寸                                                      |
| M   | 商品數量                                                      |
| N   | 商品價格（日幣）                                              |
| O   | 商品單價（台幣）                                              |
| P   | 商品總計（台幣）                                              |
| Q   | 國際運費（台幣，僅首列）                                      |
| R   | 折扣優惠金額（台幣，僅首列；無折扣時留空）                    |
| S   | 含稅總額（台幣，僅首列）                                      |
| T   | 追蹤碼（僅首列，出貨時由管理員填入，如 `EN507442770JP`）      |
| U   | 電子信箱（僅首列）                                            |
| V   | 商品網址（每件商品一列）                                      |
| W   | 單件商品成本（台幣，每列）                                    |
| X   | 單件利潤（台幣，每列）= 單價 − 成本                           |
| Y   | 總利潤（台幣，每列）= 單件利潤 × 數量；首列另扣除折扣優惠金額與網紅分潤 |
| Z   | 折扣碼（僅首列）                                              |
| AA  | 網紅名稱 / 代碼（僅首列）                                     |
| AB  | 網紅分潤（台幣，僅首列）                                      |

> **重要**：若要新增狀態選項，H 欄下拉選單的「選項文字」必須是英文小寫（e.g. `cancelled`），且需同步更新 `server/api/update-order-status.post.ts` 的 `ALLOWED_STATUSES` 陣列。

---

## Google Apps Script 說明

Google 試算表有一個觸發器 `handleStatusEdit`，監聽 H 欄（貨物狀態列）與 T 欄（追蹤碼）的編輯事件。  
當管理員修改狀態下拉值，Apps Script 自動 POST 到 `https://romoru.vercel.app/api/update-order-status`（帶上 `x-webhook-secret` header），Nuxt 收到後更新 Supabase。

若管理員在 T 欄填入追蹤碼（如 `EN507442770JP`），Apps Script 會一併將 `trackingCode` 送至 API，同步寫入 Supabase `orders.tracking_code` 欄位。

**不需要在 Apps Script 加任何狀態白名單**，白名單在 Nuxt 端的 `ALLOWED_STATUSES` 控制。
