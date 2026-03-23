// server/api/webhook.post.ts
import {
  Client,
  WebhookEvent,
  Message,
  FlexMessage,
  FlexBubble,
  FlexComponent,
} from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

import { scrapeUniqlo } from '../utils/scrapeUniqlo';
import { scrapeRstaichi } from '../utils/scrapeRstaichi';
import {
  detectBrand,
  extractRstaichiSku,
  isRstaichiBlocked,
} from '../utils/brandConfig';
import { parseJpy, jpyToTwd, formatTwd } from '#shared/pricing';
import { getJpyRate } from '../utils/exchangeRate';

// 🔑 老闆的 User ID
const ADMIN_USER_ID = 'Ud2d92728dfaf5241e62b1cb167e6973a';

const ensureLineImageUrl = (url?: string) => {
  if (!url) return 'https://placehold.co/600x600.png?text=No+Image';
  let normalized = url.trim();
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  return normalized;
};

export default defineEventHandler(async (event) => {
  console.log('🔥🔥🔥 Webhook 收到請求！🔥🔥🔥');

  const config = useRuntimeConfig(event);
  console.log(
    'Token Check:',
    config.line.channelAccessToken ? 'Exists' : 'Missing',
  );

  const client = new Client({
    channelAccessToken: config.line.channelAccessToken,
    channelSecret: config.line.channelSecret,
  });

  // 🔑 初始化 Supabase 客戶端
  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabaseKey,
  );
  // const supabase = createClient('https://nvjdoyvfqirutumsvbmy.supabase.co', 'sb_publishable_YuroylBYd91dLKYhSF-yMA_plP7C-wx')

  const body = await readRawBody(event);
  if (!body) return 'No Body';
  const bodyJson = JSON.parse(body);
  const events: WebhookEvent[] = bodyJson.events || [];

  // 💱 取得台銀即時匯率
  const jpyRate = await getJpyRate({
    supabaseUrl: config.public.supabaseUrl,
    supabaseKey: config.public.supabaseKey,
  });
  console.log(`💱 Webhook 使用匯率: ${jpyRate}`);

  await Promise.all(
    events.map(async (webhookEvent) => {
      const userId = webhookEvent.source.userId;

      if (webhookEvent.deliveryContext?.isRedelivery) {
        console.warn('⚠️ 跳過 redelivery 事件，避免重複推播');
        return;
      }

      let replyTokenUsed = false;

      const isInvalidReplyTokenError = (error: any) => {
        const errorDetail =
          error?.originalError?.response?.data || error?.response?.data || {};
        const topLevelMessage =
          typeof errorDetail?.message === 'string'
            ? errorDetail.message.toLowerCase()
            : '';
        const nestedDetailMessages = Array.isArray(errorDetail?.details)
          ? errorDetail.details
              .map((detail: any) =>
                typeof detail?.message === 'string'
                  ? detail.message.toLowerCase()
                  : '',
              )
              .join(' ')
          : '';

        return (
          topLevelMessage.includes('invalid reply token') ||
          nestedDetailMessages.includes('invalid reply token')
        );
      };

      const sendPushOnly = async (message: Message | Message[]) => {
        if (!userId) {
          throw new Error('無法推播：缺少 userId');
        }
        await client.pushMessage(userId, message);
      };

      const sendReplyOrPush = async (message: Message | Message[]) => {
        const replyToken =
          'replyToken' in webhookEvent ? webhookEvent.replyToken : undefined;
        const canReply = !replyTokenUsed && !!replyToken;

        if (canReply) {
          try {
            await client.replyMessage(replyToken, message);
            replyTokenUsed = true;
            return;
          } catch (replyErr: any) {
            if (!isInvalidReplyTokenError(replyErr)) {
              throw replyErr;
            }
            replyTokenUsed = true;
            console.warn('⚠️ replyToken 無效，改用 pushMessage 發送');
          }
        }

        await sendPushOnly(message);
      };

      // --- 1. 處理 Postback (點擊加入購物車按鈕) ---
      if (webhookEvent.type === 'postback' && userId) {
        const data = new URLSearchParams(webhookEvent.postback.data);
        const action = data.get('action');

        if (action === 'buy') {
          // 💡 顯示 LINE Loading Animation（讓客人知道系統正在處理）
          if (userId) {
            try {
              const loadRes = await fetch(
                'https://api.line.me/v2/bot/chat/loading',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.line.channelAccessToken}`,
                  },
                  body: JSON.stringify({ chatId: userId, loadingSeconds: 5 }),
                },
              );
              if (!loadRes.ok) {
                const errBody = await loadRes.text();
                console.warn(
                  `⚠️ Loading animation 失敗 [${loadRes.status}]:`,
                  errBody,
                );
              }
            } catch (loadErr) {
              console.warn('⚠️ Loading animation 例外:', loadErr);
            }
          }

          // ✅ 檢查輪播是否過期（2 小時）
          const createdTs = data.get('ts');
          if (createdTs) {
            const ageMs = Date.now() - Number(createdTs) * 1000;
            if (ageMs > 2 * 60 * 60 * 1000) {
              await sendReplyOrPush({
                type: 'text',
                text: '⚠️ 此商品輪播已超過 2 小時，為確保價格與庫存是最新狀況，請重新貼上商品網址以取得最新資訊再加入購物車喔！',
              });
              return;
            }
          }

          const itemTitle = data.get('t') || '未知商品';
          const itemColor = data.get('c') || 'F';
          const itemSize = data.get('s') || 'F';
          const itemPrice = data.get('p') || '¥0';
          const productCode = data.get('code') || '';
          const itemCategory = data.get('cat') || '';
          const pg = data.get('pg') || '00';
          const brand = data.get('brand') || 'uniqlo';

          // 💡 還原圖片網址：依品牌使用不同前綴
          const imgPath = data.get('img') || '';
          let itemImg = '';
          if (brand === 'rstaichi') {
            // 將 postback 壓縮的 RST: 前綴還原為完整 URL
            itemImg = imgPath.startsWith('RST:')
              ? `https://media-www.ec.rs-taichi.com/${imgPath.slice(4)}`
              : imgPath;
          } else {
            itemImg = imgPath ? `https://image.uniqlo.com/${imgPath}` : '';
          }

          let productUrl = '';
          if (brand === 'rstaichi') {
            productUrl = `https://www.ec.rs-taichi.com/${productCode.toLowerCase()}.html`;
          } else {
            productUrl = `https://www.uniqlo.com/jp/ja/products/${productCode}/${pg}`;
          }
          const promoEnd = data.get('pd') || null; // 期間限定截止 unix timestamp

          console.log(
            `🛒 檢查購物車是否存在: ${itemTitle} | ${itemColor} | ${itemSize}`,
          );

          // 💡 1. 先查詢資料庫中是否已有「同一人、同商品、同色、同尺寸」的項目
          const { data: existingItem, error: fetchError } = await supabase
            .from('cart_items')
            .select('id, quantity')
            .match({
              user_id: userId,
              product_title: itemTitle,
              color: itemColor,
              size: itemSize,
            })
            .maybeSingle();

          let cartError = null;

          if (existingItem) {
            // ✅ 已存在：數量 + 1（同時回填 product_url 給舊資料）
            const { error: updateError } = await supabase
              .from('cart_items')
              .update({
                quantity: (existingItem.quantity || 1) + 1,
                product_url: productUrl,
                ...(promoEnd ? { promo_end: promoEnd } : {}),
              })
              .eq('id', existingItem.id);
            cartError = updateError;
          } else {
            // ✅ 不存在：新增一筆
            const { error: insertError } = await supabase
              .from('cart_items')
              .insert({
                user_id: userId,
                product_title: itemTitle,
                product_code: productCode,
                category: itemCategory,
                color: itemColor,
                size: itemSize,
                price: itemPrice,
                image_url: itemImg,
                product_url: productUrl,
                promo_end: promoEnd,
                quantity: 1,
              });
            cartError = insertError;
          }

          if (cartError) {
            console.error('❌ Supabase 錯誤:', cartError.message);
            await sendReplyOrPush({
              type: 'text',
              text: `抱歉，加入失敗。原因：${cartError.message}`,
            });
          } else {
            const qtyText = existingItem
              ? `（已累計 ${(existingItem.quantity || 1) + 1} 件）`
              : '';
            const codeText = productCode ? `\n代號：${productCode}` : '';
            const isPromo = data.get('pm') === '1';
            let promoWarning = '';
            if (isPromo) {
              const pdTs = data.get('pd');
              if (pdTs) {
                // 計算台灣截止時間：UTC + 8hr 再扣 1hr 預留日本下單緩衝 = UTC + 7hr
                const utcMs = Number(pdTs) * 1000;
                const twDate = new Date(utcMs + 7 * 60 * 60 * 1000);
                const twMonth = twDate.getUTCMonth() + 1;
                const twDay = twDate.getUTCDate();
                const twHour = twDate.getUTCHours();
                const twMin = twDate.getUTCMinutes();
                const twTimeStr = `${twMonth}/${twDay} ${String(twHour).padStart(2, '0')}:${String(twMin).padStart(2, '0')}`;
                promoWarning = `\n\n⏰ 此商品為期間限定特價，台灣截止時間為 ${twTimeStr}。\n系統每日採購時間約為 22:00，請盡早提交訂單以確保特價。如遇價格變動或庫存完售，將另行通知。`;
              } else {
                promoWarning =
                  '\n\n⚠️ 此商品目前為期間限定特價。系統非即時下單，每日採購時間約為 22:00。如遇價格變動或庫存完售，將另行通知。';
              }
            }
            const twdItemPrice = jpyToTwd(parseJpy(itemPrice), jpyRate);
            await sendReplyOrPush({
              type: 'text',
              text: `✅ 已成功加入購物車！${qtyText}\n\n商品：${itemTitle}${codeText}\n顏色：${itemColor}\n尺寸：${itemSize}\n價格：NT$${twdItemPrice.toLocaleString()}\n\n🛒 點擊選單「查看購物車」即可查看所有商品。${promoWarning}`,
            });
          }
        }

        // --- 無庫存按鈕提醒 ---
        if (action === 'soldout') {
          const itemSize = data.get('s') || '';
          await sendReplyOrPush({
            type: 'text',
            text: `❌ 抱歉，尺寸 ${itemSize} 目前無庫存，暫時無法下單唷！\n\n建議稍後再查看，或選擇其他有庫存的尺寸 🙏`,
          });
        }

        // --- 📖 FAQ 回覆 ---
        const faqAnswers: Record<string, string> = {
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

        if (action && faqAnswers[action]) {
          await sendReplyOrPush({
            type: 'text',
            text: faqAnswers[action],
          });
        }

        return;
      }

      // --- 2. 處理文字訊息 (原有邏輯) ---
      if (
        webhookEvent.type !== 'message' ||
        webhookEvent.message.type !== 'text'
      )
        return;
      const userText = webhookEvent.message.text.trim();

      // 🔍 查 ID
      if (userText === '查ID') {
        await sendReplyOrPush({
          type: 'text',
          text: `您的 User ID 是：\n${userId}`,
        });
        return;
      }

      // 🚨 攔截「專人客服」
      if (userText.startsWith('🙋‍♂️')) {
        await sendReplyOrPush({
          type: 'text',
          text: '收到您的詢問！👩‍💻\n專員正在確認日本庫存與今日匯率，請稍候，我們會盡快以人工回覆您！',
        });
        let userName = '未知客戶';
        if (userId) {
          try {
            const profile = await client.getProfile(userId);
            userName = profile.displayName;
          } catch (e) {}
        }
        if (ADMIN_USER_ID) {
          try {
            await client.pushMessage(ADMIN_USER_ID, {
              type: 'text',
              text: `🔔 新的報價請求！\n------------------\n👤 客人：${userName}\n\n📝 內容：\n${userText}`,
            });
          } catch (err) {}
        }
        return;
      }

      // 「開始購物」— 回傳品牌導覽輪播
      if (userText === '開始購物' || userText.includes('請輸入商品內頁網址')) {
        const shopBubbles: FlexBubble[] = [
          // 1. 教學全圖卡 — 改用 micro 尺寸
          {
            type: 'bubble',
            size: 'micro',
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'image',
                  url: 'https://romoru.vercel.app/image/guide.jpg',
                  size: 'full',
                  aspectMode: 'cover',
                  aspectRatio: '800:1240',
                },
              ],
              paddingAll: '0px',
            },
          },
          // 2. 品牌卡 RS Taichi — 圖片+按鈕
          {
            type: 'bubble',
            size: 'micro',
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '0px',
              contents: [
                {
                  type: 'image',
                  url: 'https://romoru.vercel.app/image/rstaichi-logo.jpg',
                  size: 'full',
                  aspectMode: 'cover',
                  aspectRatio: '800:894',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  paddingAll: '0px',
                  backgroundColor: '#FFFFFF',
                  height: '68px', // 👈 固定的高度
                  justifyContent: 'center', // 👈 垂直置中關鍵
                  alignItems: 'center', // 👈 水平置中關鍵
                  action: {
                    type: 'uri',
                    label: '前往日本官網',
                    uri: 'https://ec.rs-taichi.com/',
                  },
                  contents: [
                    {
                      type: 'text',
                      text: '前往日本官網',
                      size: 'sm',
                      color: '#000000',
                      weight: 'bold',
                    },
                  ],
                },
              ],
            },
          },
          // 3. 品牌卡 UNIQLO — 圖片+按鈕
          {
            type: 'bubble',
            size: 'micro',
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '0px',
              contents: [
                {
                  type: 'image',
                  url: 'https://romoru.vercel.app/image/uniqlo-logo.jpg',
                  size: 'full',
                  aspectMode: 'cover',
                  aspectRatio: '800:894',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  paddingAll: '0px',
                  backgroundColor: '#FFFFFF',
                  height: '68px', // 👈 固定的高度
                  justifyContent: 'center', // 👈 垂直置中關鍵
                  alignItems: 'center', // 👈 水平置中關鍵
                  action: {
                    type: 'uri',
                    label: '前往日本官網',
                    uri: 'https://www.uniqlo.com/jp/ja/',
                  },
                  contents: [
                    {
                      type: 'text',
                      text: '前往日本官網',
                      size: 'sm',
                      color: '#000000',
                      weight: 'bold',
                    },
                  ],
                },
              ],
            },
          },
          // 4. 敬請期待卡
          {
            type: 'bubble',
            size: 'micro',
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '0px',
              contents: [
                {
                  type: 'image',
                  url: 'https://romoru.vercel.app/image/customer-service.jpg',
                  size: 'full',
                  aspectMode: 'cover',
                  aspectRatio: '800:894',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  paddingAll: '0px',
                  backgroundColor: '#FFFFFF',
                  height: '68px', // 👈 固定的高度
                  justifyContent: 'center', // 👈 垂直置中關鍵
                  alignItems: 'center', // 👈 水平置中關鍵
                  action: {
                    type: 'uri',
                    label: '呼叫真人客服',
                    uri: 'https://www.uniqlo.com/jp/ja/',
                  },
                  contents: [
                    {
                      type: 'text',
                      text: '呼叫真人客服',
                      size: 'sm',
                      color: '#285748',
                      weight: 'bold',
                    },
                  ],
                },
              ],
            },
          },
        ];

        await sendReplyOrPush({
          type: 'flex',
          altText: '🛍️ 開始購物 — 選擇品牌',
          contents: { type: 'carousel', contents: shopBubbles },
        } as FlexMessage);
        return;
      }
      // if (userText === '開始購物' || userText.includes('請輸入商品內頁網址')) {
      //   const shopBubbles: FlexBubble[] = [
      //     // 1. 教學全圖卡 — guide.jpg 尺寸 800×1240 (比例 20:31)，純圖無按鈕
      //     {
      //       type: 'bubble',
      //       size: 'mega',
      //       hero: {
      //         type: 'image',
      //         url: 'https://romoru.vercel.app/image/guide.jpg',
      //         size: 'full',
      //         aspectRatio: '20:31',
      //         aspectMode: 'cover',
      //       },
      //     },
      //     // 2. 品牌卡 UNIQLO — brand-uniqlo.jpg 尺寸 800×620 (比例 40:31)
      //     //    上半圖片 / 下半按鈕
      //     {
      //       type: 'bubble',
      //       size: 'mega',
      //       hero: {
      //         type: 'image',
      //         url: 'https://romoru.vercel.app/image/brand-uniqlo.jpg',
      //         size: 'full',
      //         aspectRatio: '40:31',
      //         aspectMode: 'cover',
      //       },
      //       body: {
      //         type: 'box',
      //         layout: 'vertical',
      //         spacing: 'sm',
      //         paddingAll: 'lg',
      //         contents: [
      //           {
      //             type: 'button',
      //             action: {
      //               type: 'uri',
      //               label: '前往官網',
      //               uri: 'https://www.uniqlo.com/jp/ja/',
      //             },
      //             style: 'primary',
      //             color: '#749D8E',
      //             height: 'sm',
      //           },
      //         ],
      //       },
      //     },
      //     // 3. 品牌卡 RS Taichi — brand-taichi.jpg 尺寸 800×620 (比例 40:31)
      //     //    上半圖片 / 下半按鈕
      //     {
      //       type: 'bubble',
      //       size: 'mega',
      //       hero: {
      //         type: 'image',
      //         url: 'https://romoru.vercel.app/image/brand-taichi.jpg',
      //         size: 'full',
      //         aspectRatio: '40:31',
      //         aspectMode: 'cover',
      //       },
      //       body: {
      //         type: 'box',
      //         layout: 'vertical',
      //         spacing: 'sm',
      //         paddingAll: 'lg',
      //         contents: [
      //           {
      //             type: 'button',
      //             action: {
      //               type: 'uri',
      //               label: '前往官網',
      //               uri: 'https://ec.rs-taichi.com/',
      //             },
      //             style: 'primary',
      //             color: '#749D8E',
      //             height: 'sm',
      //           },
      //         ],
      //       },
      //     },
      //   ];

      //   await sendReplyOrPush({
      //     type: 'flex',
      //     altText: '🛍️ 開始購物 — 選擇品牌',
      //     contents: { type: 'carousel', contents: shopBubbles },
      //   } as FlexMessage);
      //   return;
      // }

      // 📖 「購物須知」— FAQ 分類選單
      if (userText === '購物須知' || userText === 'FAQ') {
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
            {
              type: 'text',
              text: cat.emoji,
              size: 'xl',
              flex: 0,
            },
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

        await sendReplyOrPush({
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
                {
                  type: 'separator',
                  margin: 'md',
                  color: '#E0E8E4',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'md',
                  contents: faqButtons,
                },
              ],
            },
          },
        } as FlexMessage);
        return;
      }

      // ── 🔍 多品牌 URL 偵測與路由 ──

      // 提取使用者訊息中的 URL
      const urlMatch = userText.match(/https?:\/\/[^\s]+/i);
      if (!urlMatch) return;
      const pastedUrl = urlMatch[0];

      const brand = detectBrand(pastedUrl);

      if (!brand) {
        // 包含已知品牌域名但不符合商品頁格式 → 提示
        if (
          pastedUrl.includes('uniqlo.com') ||
          pastedUrl.includes('gu-global.com')
        ) {
          await sendReplyOrPush({
            type: 'text',
            text: '⚠️ 請貼上「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.uniqlo.com/jp/ja/products/E469077-000/00\n\n❌ 首頁或分類頁無法使用\n\n💡 在 Uniqlo/GU 官網找到喜歡的商品 → 點進商品頁 → 複製網址 → 貼到這裡即可！',
          });
        } else if (pastedUrl.includes('ec.rs-taichi.com')) {
          await sendReplyOrPush({
            type: 'text',
            text: '⚠️ 請貼上 RS Taichi「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.ec.rs-taichi.com/rsj334.html\n\n❌ 首頁或分類頁無法使用',
          });
        }
        return;
      }

      // ── 🚫 RsTaichi 禁售品 & 安全帽檢查 ──
      if (brand === 'rstaichi') {
        const sku = extractRstaichiSku(pastedUrl);
        if (sku) {
          const blocked = isRstaichiBlocked(sku);
          if (blocked === 'prohibited') {
            await sendReplyOrPush({
              type: 'text',
              text: '🚫 很抱歉，此商品含有電池、酒精、油類或液體成分，屬於國際郵寄運送禁止品項，無法提供代購服務。\n\n如有疑問，歡迎聯繫專人客服 🙏',
            });
            return;
          }
          if (blocked === 'helmet') {
            await sendReplyOrPush({
              type: 'text',
              text: '🪖 安全帽類商品因規格與尺寸較為特殊，目前不提供線上直接加入購物車。\n\n如需購買安全帽，請直接聯繫專人客服為您報價與處理！\n\n👉 請在聊天室輸入「🙋‍♂️」+想要的型號，專員會儘速回覆您 😊',
            });
            return;
          }
        }
      }

      // 💡 用 LINE Loading Animation（免費、不計訊息額度）取代 ACK 文字訊息
      if (userId) {
        try {
          const loadRes = await fetch(
            'https://api.line.me/v2/bot/chat/loading',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.line.channelAccessToken}`,
              },
              body: JSON.stringify({ chatId: userId, loadingSeconds: 20 }),
            },
          );
          if (!loadRes.ok) {
            const errBody = await loadRes.text();
            console.warn(
              `⚠️ Loading animation 失敗 [${loadRes.status}]:`,
              errBody,
            );
          } else {
            console.log('✅ Loading animation 已發送');
          }
        } catch (loadErr) {
          console.warn('⚠️ Loading animation 例外:', loadErr);
        }
      }

      try {
        console.log(`🕷️ [${brand}] 收到網址：${pastedUrl}`);

        let bubbles: FlexBubble[] = [];
        let productTitle = '';

        // ── UNIQLO 抓取 + 卡片 ──
        if (brand === 'uniqlo') {
          const productData = await scrapeUniqlo(pastedUrl);
          if (!productData) throw new Error('無法識別的網站資料');
          productTitle = productData.title;
          console.log(`✅ 抓取成功：${productTitle}`);

          bubbles = productData.variants.map((v: any) => {
            const safeImageUrl = ensureLineImageUrl(v.image);
            const imgPath = (v.image || '')
              .replace(/^https?:\/\/image\.uniqlo\.com\//, '')
              .split('?')[0];

            const sizeButtons: FlexComponent[] = v.sizes.map((s: any) => {
              const compactData = `action=buy&t=${encodeURIComponent(productData.title.slice(0, 5))}&c=${encodeURIComponent(v.color)}&s=${encodeURIComponent(s.name)}&p=${encodeURIComponent(v.price)}&code=${productData.rawCode}&img=${imgPath}&cat=${productData.category}&pg=${productData.priceGroup}&ts=${Math.floor(Date.now() / 1000)}${productData.isLimitedOffer ? `&pm=1&pd=${productData.promoEndTs || ''}` : ''}`;
              const themeColor = s.isStock ? '#ffffff' : '#888888';
              return {
                type: 'box',
                layout: 'vertical',
                justifyContent: 'center',
                alignItems: 'center',
                height: '32px',
                margin: 'sm',
                cornerRadius: 'sm',
                borderWidth: '1px',
                borderColor: s.isStock ? themeColor : '#00000000',
                backgroundColor: s.isStock ? '#00000000' : '#3d4e4ab3',
                action: s.isStock
                  ? { type: 'postback', label: s.name, data: compactData }
                  : {
                      type: 'postback',
                      label: s.name,
                      data: `action=soldout&s=${encodeURIComponent(s.name)}`,
                    },
                contents: [
                  {
                    type: 'text',
                    text: s.isStock
                      ? `加入購物車 | ${s.name}`
                      : `${s.name} 完售`,
                    color: themeColor,
                    align: 'center',
                    weight: 'bold',
                    size: 'xxs',
                  },
                ],
              };
            });

            return {
              type: 'bubble',
              size: 'mega',
              body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '0px',
                contents: [
                  {
                    type: 'image',
                    url: safeImageUrl,
                    size: 'full',
                    aspectRatio: '3:4',
                    aspectMode: 'cover',
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    position: 'absolute',
                    offsetBottom: '0px',
                    offsetStart: '0px',
                    offsetEnd: '0px',
                    backgroundColor: '#3d4e4ab8',
                    paddingAll: 'lg',
                    contents: [
                      {
                        type: 'text',
                        text: productData.title,
                        weight: 'bold',
                        size: 'md',
                        color: '#ffffff',
                        wrap: true,
                      },
                      {
                        type: 'text',
                        text: `${formatTwd(jpyToTwd(parseJpy(v.price), jpyRate))}`,
                        size: 'md',
                        weight: 'bold',
                        color: '#ffffff',
                        margin: 'md',
                      },
                      {
                        type: 'text',
                        text: `顏色：${v.color} ¥${parseJpy(v.price).toLocaleString()}`,
                        size: 'xs',
                        color: '#dddddd',
                        margin: 'xs',
                      },
                      {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'md',
                        contents: sizeButtons.slice(0, 7),
                      },
                    ],
                  },
                ],
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '0px',
                backgroundColor: '#3d4e4a',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '40px',
                    action: {
                      type: 'uri',
                      label: '查看詳情',
                      uri: pastedUrl,
                    },
                    contents: [
                      {
                        type: 'text',
                        text: '查看官網詳情',
                        color: '#ffffff',
                        weight: 'bold',
                        size: 'xs',
                        align: 'center',
                      },
                    ],
                  },
                ],
              },
            };
          }) as FlexBubble[];
        }

        // ── RS TAICHI 抓取 + 卡片 ──
        // 維持 overlay 風格（圖片 + 底部半透明遮罩），
        // 根據尺寸數量動態拉高圖片 aspectRatio，確保所有尺寸完整顯示
        if (brand === 'rstaichi') {
          const productData = await scrapeRstaichi(pastedUrl);
          if (!productData) throw new Error('無法識別的 RS Taichi 商品資料');
          productTitle = productData.title;
          console.log(`✅ 抓取成功：${productTitle}`);

          bubbles = productData.variants.map((v: any) => {
            const safeImageUrl = ensureLineImageUrl(v.image);
            const imgCompact = (v.image || '').replace(
              /^https?:\/\/media-www\.ec\.rs-taichi\.com\//,
              'RST:',
            );

            const sizeButtons: FlexComponent[] = v.sizes.map((s: any) => {
              // 動態計算標題可用長度，盡量塞入最多字（LINE postback 上限 300 字元）
              const baseData = `action=buy&brand=rstaichi&c=${encodeURIComponent(v.color)}&s=${encodeURIComponent(s.name)}&p=${encodeURIComponent(v.price)}&code=${productData.sku}&img=${encodeURIComponent(imgCompact)}&cat=rstaichi|${productData.weightGrams}&ts=${Math.floor(Date.now() / 1000)}`;
              const titleBudget = 300 - baseData.length - 3; // 3 = "&t="
              let titleSlice = productData.title;
              while (
                encodeURIComponent(titleSlice).length > titleBudget &&
                titleSlice.length > 0
              ) {
                titleSlice = titleSlice.slice(0, -1);
              }
              if (titleSlice.length < productData.title.length) {
                // 截斷時加省略號，且不在 | 或空格處斷開
                titleSlice =
                  titleSlice.length > 3
                    ? titleSlice.slice(0, -1) + '…'
                    : titleSlice;
              }
              const compactData = `${baseData}&t=${encodeURIComponent(titleSlice)}`;
              const themeColor = s.isStock ? '#ffffff' : '#888888';
              return {
                type: 'box',
                layout: 'vertical',
                justifyContent: 'center',
                alignItems: 'center',
                height: '32px',
                margin: 'sm',
                cornerRadius: 'sm',
                borderWidth: '1px',
                borderColor: s.isStock ? themeColor : '#00000000',
                backgroundColor: s.isStock ? '#00000000' : '#3d4e4ab3',
                action: s.isStock
                  ? { type: 'postback', label: s.name, data: compactData }
                  : {
                      type: 'postback',
                      label: s.name,
                      data: `action=soldout&s=${encodeURIComponent(s.name)}`,
                    },
                contents: [
                  {
                    type: 'text',
                    text: s.isStock
                      ? `加入購物車 | ${s.name}`
                      : `${s.name} 完售`,
                    color: themeColor,
                    align: 'center',
                    weight: 'bold',
                    size: 'xxs',
                  },
                ],
              };
            });

            // 根據尺寸數量動態決定圖片高度
            // ≤7: 3:4（原始）, 8-11: 9:16, 12+: 1:2
            const sizeCount = v.sizes.length;
            const aspectRatio =
              sizeCount <= 7 ? '3:4' : sizeCount <= 11 ? '9:16' : '1:2';

            return {
              type: 'bubble',
              size: 'mega',
              body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '0px',
                contents: [
                  {
                    type: 'image',
                    url: safeImageUrl,
                    size: 'full',
                    aspectRatio,
                    aspectMode: 'cover',
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    position: 'absolute',
                    offsetBottom: '0px',
                    offsetStart: '0px',
                    offsetEnd: '0px',
                    backgroundColor: '#3d4e4ab8',
                    paddingAll: 'lg',
                    contents: [
                      {
                        type: 'text',
                        text: productData.title,
                        weight: 'bold',
                        size: 'md',
                        color: '#ffffff',
                        wrap: true,
                      },
                      {
                        type: 'text',
                        text: `${formatTwd(jpyToTwd(parseJpy(v.price), jpyRate))}`,
                        size: 'md',
                        weight: 'bold',
                        color: '#ffffff',
                        margin: 'md',
                      },
                      {
                        type: 'text',
                        text: `顏色：${v.color} ¥${parseJpy(v.price).toLocaleString()}`,
                        size: 'xs',
                        color: '#dddddd',
                        margin: 'xs',
                      },
                      {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'md',
                        contents: sizeButtons,
                      },
                    ],
                  },
                ],
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '0px',
                backgroundColor: '#3d4e4a',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '40px',
                    action: {
                      type: 'uri',
                      label: '查看詳情',
                      uri: pastedUrl,
                    },
                    contents: [
                      {
                        type: 'text',
                        text: '查看官網詳情',
                        color: '#ffffff',
                        weight: 'bold',
                        size: 'xs',
                        align: 'center',
                      },
                    ],
                  },
                ],
              },
            };
          }) as FlexBubble[];
        }

        if (!bubbles.length) throw new Error('未取得任何商品變體');

        const flexMessage: FlexMessage = {
          type: 'flex',
          altText: `推薦商品：${productTitle}`,
          contents: { type: 'carousel', contents: bubbles },
        };

        await sendReplyOrPush(flexMessage);
        console.log('✅ 訊息發送成功！');
      } catch (err: any) {
        const lineErrorDetail =
          err?.originalError?.response?.data || err?.response?.data || null;
        console.error('❌ 失敗:', err.message);
        if (lineErrorDetail) {
          console.error(
            '📌 LINE API 錯誤細節:',
            JSON.stringify(lineErrorDetail),
          );
        }

        try {
          await sendReplyOrPush({
            type: 'text',
            text: '抱歉，讀取網頁發生錯誤 > <',
          });
        } catch (replyErr: any) {
          const replyErrorDetail =
            replyErr?.originalError?.response?.data ||
            replyErr?.response?.data ||
            null;
          console.error('❌ 錯誤回覆也失敗:', replyErr?.message || replyErr);
          if (replyErrorDetail) {
            console.error(
              '📌 LINE API 回覆錯誤細節:',
              JSON.stringify(replyErrorDetail),
            );
          }
        }
      }
    }),
  );
  return 'OK';
});
