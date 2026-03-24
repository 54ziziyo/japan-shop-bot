// server/utils/line/faq.ts
// FAQ 回答內容 + 購物須知選單 Flex 訊息
import type { FlexMessage, FlexComponent } from '@line/bot-sdk';

/** FAQ 回答文字 (key = postback action) */
export const FAQ_ANSWERS: Record<string, string> = {
  faq_order: [
    '🛒 訂購流程',
    '',
    '1️⃣ 在日本官網找到喜歡的商品',
    '2️⃣ 複製商品頁網址，貼到這個聊天室',
    '3️⃣ 系統會自動產生商品卡片，選擇顏色和尺寸後點擊「加入購物車」',
    '4️⃣ 點擊選單「購物車」查看已選商品',
    '5️⃣ 確認無誤後進入結帳頁，填寫收件資訊並送出訂單',
    '',
    '⚠️ 庫存動態：下單不代表購買成功，若遇官網缺貨，客服會主動聯繫並退款。',
    '⚠️ 代購性質：下單後即進入採購流程，不接受取消、改單或併單。',
  ].join('\n'),
  faq_payment: [
    '💳 付款與匯款',
    '',
    '【銀行轉帳】',
    '• 銀行：玉山銀行（808）',
    '• 帳號：0624940150560',
    '• 請於訂單送出後 3 天內 完成匯款，逾期系統自動取消。',
    '• 金額須與訂單總額完全一致。',
    '• 對帳約需 1-2 個工作天，付款後 24 小時未更新狀態請主動聯繫客服。',
    '',
    '【轉帳優惠】',
    '• 選擇銀行轉帳可享 3% 折扣！',
    '',
    '⚠️ 惡意棄單、故意匯錯金額者，將永久停止服務。',
  ].join('\n'),
  faq_shipping: [
    '📦 運送與物流',
    '',
    '• 所有商品由日本空運直送台灣。',
    '• 正常現貨約 7-14 個工作天到貨。',
    '• 若遇海關查驗或物流狀況，最長需 30 個工作天。',
    '• 商品寄出後會提供追蹤編號，可自行查詢物流進度。',
    '',
    '💡 急單請斟酌下單，代購無法保證確切到貨日期。',
  ].join('\n'),
  faq_return: [
    '🔄 退換貨政策',
    '',
    '• 代購屬「客製化給付」，恕不接受個人因素退換貨（如尺寸不合、不喜歡）。',
    '• 收到商品如有破損或品項錯誤，請於 3 天內 拍照並透過 LINE 聯繫。',
    '• 收貨拆封時請務必全程錄影，無錄影存證恕不受理爭議。',
    '',
    '⚠️ 輕微線頭、溢膠、螢幕色差等不屬瑕疵範圍。',
  ].join('\n'),
  faq_promo: [
    '🏷️ 特價與促銷',
    '',
    '• 系統會自動偵測期間限定特價，並在商品卡片中提示。',
    '• 每日採購時間約為 22:00（台灣時間），請在截止前提交訂單。',
    '• 若採購時特價已結束恢復原價，客服會主動聯繫確認是否補差額或取消。',
    '',
    '💡 限時特價隨時可能結束，建議看到特價就盡快下單！',
  ].join('\n'),
};

/** 購物須知 FAQ 分類選單 Flex 訊息 */
export function buildFaqMenu(): FlexMessage {
  const faqCategories = [
    { emoji: '🛒', label: '訂購流程', key: 'faq_order' },
    { emoji: '💳', label: '付款與匯款', key: 'faq_payment' },
    { emoji: '📦', label: '運送與物流', key: 'faq_shipping' },
    { emoji: '🔄', label: '退換貨政策', key: 'faq_return' },
    { emoji: '🏷️', label: '特價與促銷', key: 'faq_promo' },
  ];

  const faqButtons: FlexComponent[] = faqCategories.map((cat) => ({
    type: 'box',
    layout: 'horizontal',
    paddingAll: 'lg',
    backgroundColor: '#FFFFFF',
    cornerRadius: 'lg',
    margin: 'lg',
    action: {
      type: 'postback',
      label: cat.label,
      data: `action=${cat.key}`,
      displayText: cat.label,
    },
    contents: [
      { type: 'text', text: cat.emoji, size: 'xl', flex: 0 },
      {
        type: 'text',
        text: cat.label,
        size: 'sm',
        weight: 'bold',
        color: '#4A5D59',
        margin: 'md',
        gravity: 'center',
      },
    ],
  }));

  return {
    type: 'flex',
    altText: '📖 購物須知 — 選擇問題分類',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F4F9F5',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: '📖 購物須知',
            weight: 'bold',
            size: 'lg',
            color: '#4A5D59',
          },
          {
            type: 'text',
            text: '請點選想了解的問題分類',
            size: 'xs',
            color: '#999999',
            margin: 'sm',
          },
          { type: 'separator', margin: 'md', color: '#E0E8E4' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            contents: faqButtons,
          },
        ],
      },
    },
  } as FlexMessage;
}
