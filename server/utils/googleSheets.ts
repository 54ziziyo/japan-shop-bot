// server/utils/googleSheets.ts
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function appendOrderRow(
  config: {
    googleServiceAccountJson: string;
    googleSpreadsheetId: string;
    googleSheetName: string;
  },
  order: {
    orderId: string;
    orderNo: string;
    createdAt: string;
    lineName: string;
    customerName: string;
    phone: string;
    address: string;
    paymentMethod: string;
    accountLast5: string | null;
    items: any[];
    subtotalTwd: number;
    shippingTwd: number;
    serviceFeeTwd: number;
    grandTotalTwd: number;
    totalJpy: number;
  },
) {
  const json = JSON.parse(config.googleServiceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: json.client_email,
      private_key: json.private_key.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // 🔄 關鍵改動：將每個商品展開成獨立的一列
  // 🔄 優化後的邏輯：只有第一列顯示訂單主資訊
  const rows = order.items.map((item, index) => [
    index === 0 ? order.orderNo : '',       // A 訂單編號 (僅首列顯示)
    index === 0 ? order.orderId : '',       // B 會員ID (僅首列顯示)
    index === 0 ? order.createdAt : '',     // C 下單時間 (僅首列顯示)
    index === 0 ? order.lineName : '',      // D LINE名稱 (僅首列顯示)
    index === 0 ? order.customerName : '',  // E 客人姓名 (僅首列顯示)
    index === 0 ? order.phone : '',         // F 手機號碼 (僅首列顯示)
    index === 0 ? order.address : '',       // G 地址 (僅首列顯示)
    index === 0 ? 'pending' : '',           // H 貨物狀態 (僅首列顯示)
    item.product_title,                     // I 商品名稱 (每列顯示)
    item.image_url,                         // J 商品照片 (每列顯示)
    item.color,                             // K 商品顏色 (每列顯示)
    item.size,                              // L 商品尺寸 (每列顯示)
    item.quantity,                          // M 商品數量 (每列顯示)
    item.price,                             // N 商品價格(日幣) (每列顯示)
    item.priceTwd,                          // O 商品單價(台幣) (每列顯示)
    item.priceTwd * item.quantity,          // P 商品總計(台幣) (每列顯示)
    index === 0 ? order.shippingTwd : '',   // Q 運費(台幣) (僅首列顯示)
    index === 0 ? order.grandTotalTwd : '', // R 含稅總額(台幣) (僅首列顯示)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!A:R`, // 範圍確保包含 R 欄
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}