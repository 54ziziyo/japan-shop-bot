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
    couponDiscountTwd: number;
    grandTotalTwd: number;
    totalJpy: number;
    email: string;
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
    index === 0 ? order.orderNo : '', // A 訂單編號 (僅首列顯示)
    index === 0 ? order.orderId : '', // B 會員ID (僅首列顯示)
    index === 0 ? order.createdAt : '', // C 下單時間 (僅首列顯示)
    index === 0 ? order.lineName : '', // D LINE名稱 (僅首列顯示)
    index === 0 ? order.customerName : '', // E 客人姓名 (僅首列顯示)
    index === 0 ? order.phone : '', // F 手機號碼 (僅首列顯示)
    index === 0 ? order.address : '', // G 地址 (僅首列顯示)
    index === 0 ? 'pending' : '', // H 貨物狀態 (僅首列顯示)
    item.product_title, // I 商品名稱 (每列顯示)
    item.image_url, // J 商品照片 (每列顯示)
    item.color, // K 商品顏色 (每列顯示)
    item.size, // L 商品尺寸 (每列顯示)
    item.quantity, // M 商品數量 (每列顯示)
    item.price, // N 商品價格(日幣) (每列顯示)
    item.priceTwd, // O 商品單價(台幣) (每列顯示)
    item.priceTwd * item.quantity, // P 商品總計(台幣) (每列顯示)
    index === 0 ? order.shippingTwd : '', // Q 運費(台幣) (僅首列顯示)
    index === 0 ? (order.couponDiscountTwd > 0 ? order.couponDiscountTwd : '') : '', // R 折扣優惠金額(台幣) (僅首列顯示)
    index === 0 ? order.grandTotalTwd : '', // S 含稅總額(台幣) (僅首列顯示)
    index === 0 ? '' : '', // T 追蹤碼 (僅首列顯示，出貨時由管理員填入)
    index === 0 ? order.email : '', // U 電子信箱 (僅首列顯示)
    item.product_url || '', // V 商品網址 (每列顯示)
    item.costTwd ?? '', // W 單件商品成本(台幣) (每列顯示)
    item.costTwd != null ? item.priceTwd - item.costTwd : '', // X 單件利潤(台幣) (每列顯示)
    item.costTwd != null
      ? (item.priceTwd - item.costTwd) * item.quantity - (index === 0 ? order.couponDiscountTwd : 0)
      : '', // Y 總利潤(台幣)：第一列扣除折扣優惠金額 (每列顯示)
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!A:Y`, // 範圍確保包含 Y 欄
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

/**
 * 依 orderId（B 欄）搜尋並刪除試算表中對應的所有列
 * 一筆訂單可能佔多列（每種商品一列），全部刪除
 */
export async function deleteOrderRows(
  config: {
    googleServiceAccountJson: string;
    googleSpreadsheetId: string;
    googleSheetName: string;
  },
  orderIds: string[],
) {
  if (!orderIds.length) return;

  const json = JSON.parse(config.googleServiceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: json.client_email,
      private_key: json.private_key.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. 讀取 B 欄（orderId）以找出要刪除的列位置
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!B:B`,
  });

  const rows = res.data.values || [];
  const orderIdSet = new Set(orderIds);

  // 收集需要刪除的行號索引（0-based）
  const rowIndicesToDelete: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cellValue = rows[i]?.[0] ?? '';
    if (orderIdSet.has(cellValue)) {
      rowIndicesToDelete.push(i);
    }
  }

  if (rowIndicesToDelete.length === 0) {
    console.log('⚠️ 試算表中找不到對應的訂單列');
    return;
  }

  // 2. 取得 sheetId（數字 ID，非工作表名稱）
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSpreadsheetId,
  });
  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === config.googleSheetName,
  );
  const sheetId = sheet?.properties?.sheetId ?? 0;

  // 3. 由下往上刪除（避免索引偏移）
  const requests = rowIndicesToDelete
    .sort((a, b) => b - a)
    .map((rowIndex) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS' as const,
          startIndex: rowIndex,
          endIndex: rowIndex + 1,
        },
      },
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.googleSpreadsheetId,
    requestBody: { requests },
  });

  console.log(`✅ 已從試算表刪除 ${rowIndicesToDelete.length} 列`);
}

/**
 * 依 orderId（B 欄）搜尋並更新試算表中 H 欄的貨物狀態
 */
export async function updateOrderStatusInSheet(
  config: {
    googleServiceAccountJson: string;
    googleSpreadsheetId: string;
    googleSheetName: string;
  },
  orderIds: string[],
  newStatus: string,
) {
  if (!orderIds.length) return;

  const json = JSON.parse(config.googleServiceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: json.client_email,
      private_key: json.private_key.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // 讀取 B 欄找到對應的列
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!B:B`,
  });

  const rows = res.data.values || [];
  const orderIdSet = new Set(orderIds);

  // 收集需要更新狀態的行號（1-based，只取有 orderId 的首列）
  const rowsToUpdate: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cellValue = rows[i]?.[0] ?? '';
    if (orderIdSet.has(cellValue)) {
      rowsToUpdate.push(i + 1); // 轉為 1-based
    }
  }

  if (rowsToUpdate.length === 0) {
    console.log('⚠️ 試算表中找不到對應的訂單列');
    return;
  }

  // 批次更新 H 欄
  const data = rowsToUpdate.map((row) => ({
    range: `${config.googleSheetName}!H${row}`,
    values: [[newStatus]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.googleSpreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });

  console.log(`✅ 已更新試算表 ${rowsToUpdate.length} 列狀態為 ${newStatus}`);
}
