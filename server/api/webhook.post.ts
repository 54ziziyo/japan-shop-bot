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

// 🔒 誤刪！ 暫時停用：hyod / 56design / 通用爬蟲
// import axios from 'axios';
// import * as cheerio from 'cheerio';
// import { scrapeGeneric } from '../utils/scrapeGeneric';
// import { scrapeHyod } from '../utils/scrapeHyod';
// import { scrapeShopify } from '../utils/scrapeShopify';
// import { checkProductRestriction } from '../utils/productFilterRules';

import { scrapeUniqlo } from '../utils/scrapeUniqlo';

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

      const sendReplyOnlyIfPossible = async (message: Message | Message[]) => {
        const replyToken =
          'replyToken' in webhookEvent ? webhookEvent.replyToken : undefined;
        const canReply = !replyTokenUsed && !!replyToken;

        if (!canReply) return;

        try {
          await client.replyMessage(replyToken, message);
          replyTokenUsed = true;
        } catch (replyErr: any) {
          if (isInvalidReplyTokenError(replyErr)) {
            replyTokenUsed = true;
            console.warn('⚠️ URL ACK replyToken 無效，略過 ACK');
            return;
          }
          throw replyErr;
        }
      };

      // --- 1. 處理 Postback (點擊加入購物車按鈕) ---
      if (webhookEvent.type === 'postback' && userId) {
        const data = new URLSearchParams(webhookEvent.postback.data);
        const action = data.get('action');

        if (action === 'buy') {
          const itemTitle = data.get('t') || '未知商品';
          const itemColor = data.get('c') || 'F';
          const itemSize = data.get('s') || 'F';
          const itemPrice = data.get('p') || '¥0';
          const productCode = data.get('code') || '';
          const itemCategory = data.get('cat') || '';
          const pg = data.get('pg') || '00';

          // 💡 還原圖片網址：直接用實際圖片路徑（從 API 取得的真實 URL）
          const imgPath = data.get('img') || '';
          const itemImg = imgPath ? `https://image.uniqlo.com/${imgPath}` : '';
          const productUrl = `https://www.uniqlo.com/jp/ja/products/${productCode}/${pg}`;
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
            await sendReplyOrPush({
              type: 'text',
              text: `✅ 已成功加入購物車！${qtyText}\n\n商品：${itemTitle}${codeText}\n顏色：${itemColor}\n尺寸：${itemSize}\n\n🛒 點擊選單「查看購物車」即可查看所有商品。${promoWarning}`,
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

      // 📌 目前僅支援 Uniqlo / GU
      const isUniqlo =
        userText.includes('uniqlo.com') || userText.includes('gu-global.com');
      if (!isUniqlo) return;

      // 💡 用 LINE Loading Animation（免費、不計訊息額度）取代 ACK 文字訊息
      if (userId) {
        try {
          await fetch('https://api.line.me/v2/bot/chat/loading', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.line.channelAccessToken}`,
            },
            body: JSON.stringify({ chatId: userId, loadingSeconds: 30 }),
          });
        } catch (loadErr) {
          console.warn('⚠️ Loading animation 失敗，不影響主流程');
        }
      }

      try {
        console.log(`🕷️ 收到網址：${userText}`);
        const productData = await scrapeUniqlo(userText);
        if (!productData) throw new Error('無法識別的網站資料');

        console.log(`✅ 抓取成功：${productData.title}`);

        // 🎨 製作卡片 (輕盈透明版)
        const bubbles = productData.variants.map((v: any) => {
          const safeImageUrl = ensureLineImageUrl(v.image);

          // 💡 將實際圖片 URL 去掉共同前綴 + query string，縮減 postback data 大小
          const imgPath = (v.image || '')
            .replace(/^https?:\/\/image\.uniqlo\.com\//, '')
            .split('?')[0];

          const sizeButtons: FlexComponent[] = v.sizes.map((s: any) => {
            // 💡 直接傳實際圖片路徑，不再用 cc/gid 重組
            const compactData = `action=buy&t=${encodeURIComponent(productData.title.slice(0, 5))}&c=${encodeURIComponent(v.color)}&s=${encodeURIComponent(s.name)}&p=${encodeURIComponent(v.price)}&code=${productData.rawCode}&img=${imgPath}&cat=${productData.category}&pg=${productData.priceGroup}${productData.isLimitedOffer ? `&pm=1&pd=${productData.promoEndTs || ''}` : ''}`;

            // 💡 4. 根據庫存狀態調整按鈕樣式和行為
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
              backgroundColor: s.isStock ? '#00000000' : '#3f3f3f8e',
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
                  text: s.isStock ? `加入購物車 | ${s.name}` : `${s.name} 完售`,
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
                // 💡 3. 調整遮罩：將底色調淺 (#00000066)
                {
                  type: 'box',
                  layout: 'vertical',
                  position: 'absolute',
                  offsetBottom: '0px',
                  offsetStart: '0px',
                  offsetEnd: '0px',
                  backgroundColor: '#00000066', // 40% 透明黑，比之前的更通透
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
                      text: `${v.color} ${v.price}`,
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
            // 💡 4. Footer 和諧化：背景改用稍微透一點的深灰
            footer: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '0px',
              backgroundColor: '#111111ee',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '40px',
                  action: { type: 'uri', label: '查看詳情', uri: userText },
                  contents: [
                    {
                      type: 'text',
                      text: '查看官網詳情',
                      color: '#ffffff',
                      weight: 'regular',
                      size: 'xs',
                      align: 'center',
                    },
                  ],
                },
              ],
            },
          };
        }) as FlexBubble[];

        const flexMessage: FlexMessage = {
          type: 'flex',
          altText: `推薦商品：${productData.title}`,
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
