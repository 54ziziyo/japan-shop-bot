// server/api/webhook.post.ts
import { Client, WebhookEvent, Message, FlexMessage } from '@line/bot-sdk';
import { useSupabase } from '../utils/supabase';
import { getJpyRate } from '../utils/exchangeRate';
import { showLoadingAnimation } from '../utils/line/helpers';
import {
  buildShopCarousel,
  buildCategorySelector,
} from '../utils/line/shopCarousel';
import { FAQ_ANSWERS, buildFaqMenu } from '../utils/line/faq';
import { buildSocialMediaFlex, buildGroupFlex } from '../utils/line/socialMenu';
import { handleBuyPostback } from '../utils/line/handlePostback';
import { handleUrlMessage } from '../utils/line/handleUrlMessage';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  const client = new Client({
    channelAccessToken: config.line.channelAccessToken,
    channelSecret: config.line.channelSecret,
  });

  const supabase = useSupabase();

  const body = await readRawBody(event);
  if (!body) return 'No Body';
  const events: WebhookEvent[] = JSON.parse(body).events || [];

  // 💱 延遲載入匯率（只有需要時才查）
  let _jpyRate: number | null = null;
  const getRate = async () => {
    if (_jpyRate === null) {
      _jpyRate = await getJpyRate({
        supabaseUrl: config.public.supabaseUrl,
        supabaseKey: config.public.supabaseKey,
      });
      console.log(`💱 Webhook 使用匯率: ${_jpyRate}`);
    }
    return _jpyRate;
  };

  await Promise.all(
    events.map(async (webhookEvent) => {
      const userId = webhookEvent.source.userId;

      if (webhookEvent.deliveryContext?.isRedelivery) {
        console.warn('⚠️ 跳過 redelivery 事件，避免重複推播');
        return;
      }

      let replyTokenUsed = false;

      const sendReplyOrPush = async (message: Message | Message[]) => {
        const replyToken =
          'replyToken' in webhookEvent ? webhookEvent.replyToken : undefined;
        if (!replyTokenUsed && replyToken) {
          try {
            await client.replyMessage(replyToken, message);
            replyTokenUsed = true;
            return;
          } catch (err: any) {
            const d =
              err?.originalError?.response?.data || err?.response?.data || {};
            const msg = [
              typeof d?.message === 'string' ? d.message : '',
              ...(Array.isArray(d?.details)
                ? d.details.map((x: any) => x?.message || '')
                : []),
            ]
              .join(' ')
              .toLowerCase();
            if (!msg.includes('invalid reply token')) throw err;
            replyTokenUsed = true;
            console.warn('⚠️ replyToken 無效，改用 pushMessage 發送');
          }
        }
        if (!userId) throw new Error('無法推播：缺少 userId');
        await client.pushMessage(userId, message);
      };

      // ── 1. Postback（加入購物車 / 無庫存 / FAQ） ──
      if (webhookEvent.type === 'postback' && userId) {
        const data = new URLSearchParams(webhookEvent.postback.data);
        const action = data.get('action');

        if (action === 'buy') {
          await handleBuyPostback(
            data,
            userId,
            supabase,
            getRate,
            sendReplyOrPush,
            config.line.channelAccessToken,
          );
        }

        if (action === 'soldout') {
          await sendReplyOrPush({
            type: 'text',
            text: `❌ 抱歉，尺寸 ${data.get('s') || ''} 目前無庫存，暫時無法下單唷！\n\n建議稍後再查看，或選擇其他有庫存的尺寸 🙏`,
          });
        }

        if (action && FAQ_ANSWERS[action]) {
          await sendReplyOrPush({ type: 'text', text: FAQ_ANSWERS[action] });
        }

        // 開始購物 — 分類選擇後，回傳對應品牌輪播
        if (action === 'shop_category') {
          const category = data.get('category') as 'fashion' | 'motogear';
          await sendReplyOrPush({
            type: 'flex',
            altText:
              category === 'fashion'
                ? '👕 潮牌服飾 — 選擇品牌'
                : '🏍️ 重機部品 — 選擇品牌',
            contents: {
              type: 'carousel',
              contents: buildShopCarousel(category),
            },
          } as FlexMessage);
        }

        return;
      }

      // ── 2. 文字訊息路由 ──
      if (
        webhookEvent.type !== 'message' ||
        webhookEvent.message.type !== 'text'
      )
        return;
      const userText = webhookEvent.message.text.trim();

      // 查 ID
      if (userText === '查ID') {
        await sendReplyOrPush({
          type: 'text',
          text: `您的 User ID 是：\n${userId}`,
        });
        return;
      }

      // 開始購物 — 分類選擇（不需匯率，秒回）
      if (userText === '開始購物' || userText.includes('請輸入商品內頁網址')) {
        await sendReplyOrPush(buildCategorySelector());
        return;
      }

      // 購物須知 — FAQ 選單（不需匯率，秒回）
      if (userText === '購物須知' || userText === 'FAQ') {
        await sendReplyOrPush(buildFaqMenu());
        return;
      }

      // 社群媒體 — 選擇 IG 帳號
      if (userText === '社群媒體') {
        await sendReplyOrPush(buildSocialMediaFlex());
        return;
      }

      // 代購群組 — 選擇 LINE 群組
      if (userText === '代購群組') {
        await sendReplyOrPush(buildGroupFlex());
        return;
      }

      // ── 3. URL 偵測與商品卡片 ──
      const urlMatch = userText.match(/https?:\/\/[^\s]+/i);
      if (!urlMatch) return;
      await handleUrlMessage(
        urlMatch[0],
        userId!,
        getRate,
        sendReplyOrPush,
        config.line.channelAccessToken,
      );
    }),
  );
  return 'OK';
});
