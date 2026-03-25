// server/api/webhook.post.ts
import { Client, WebhookEvent, Message, FlexMessage, FlexBubble } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

import { scrapeUniqlo } from '../utils/scrape/uniqlo';
import { scrapeRstaichi } from '../utils/scrape/rstaichi';
import { scrapeGu } from '../utils/scrape/gu';
import { scrapeKushitani } from '../utils/scrape/kushitani';
import { getKushitaniCustomPrice } from '../utils/kushitaniPricing';
import { detectBrand, extractRstaichiSku, isRstaichiBlocked } from '../utils/brandConfig';
import { parseJpy, jpyToTwd } from '#shared/pricing';
import { getJpyRate } from '../utils/exchangeRate';
import { showLoadingAnimation } from '../utils/line/helpers';
import { buildShopCarousel } from '../utils/line/shopCarousel';
import { FAQ_ANSWERS, buildFaqMenu } from '../utils/line/faq';
import { buildUniqloCards, buildRstaichiCards, buildGuCards, buildKushitaniCards } from '../utils/line/cards';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  const client = new Client({
    channelAccessToken: config.line.channelAccessToken,
    channelSecret: config.line.channelSecret,
  });

  const supabase = createClient(config.public.supabaseUrl, config.public.supabaseKey);

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
            const d = err?.originalError?.response?.data || err?.response?.data || {};
            const msg = [
              typeof d?.message === 'string' ? d.message : '',
              ...(Array.isArray(d?.details) ? d.details.map((x: any) => x?.message || '') : []),
            ].join(' ').toLowerCase();
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
          await showLoadingAnimation(userId, config.line.channelAccessToken, 5);

          // 檢查輪播是否過期（2 小時）
          const createdTs = data.get('ts');
          if (createdTs && Date.now() - Number(createdTs) * 1000 > 2 * 60 * 60 * 1000) {
            await sendReplyOrPush({
              type: 'text',
              text: '⚠️ 此商品輪播已超過 2 小時，為確保價格與庫存是最新狀況，請重新貼上商品網址以取得最新資訊再加入購物車喔！',
            });
            return;
          }

          const itemTitle = data.get('t') || '未知商品';
          const itemColor = data.get('c') || 'F';
          const itemSize = data.get('s') || 'F';
          const itemPrice = data.get('p') || '¥0';
          const productCode = data.get('code') || '';
          const itemCategory = data.get('cat') || '';
          const pg = data.get('pg') || '00';
          const brand = data.get('brand') || 'uniqlo';

          // 還原圖片網址
          const imgPath = data.get('img') || '';
          let itemImg = '';
          if (brand === 'rstaichi') {
            itemImg = imgPath.startsWith('RST:')
              ? `https://media-www.ec.rs-taichi.com/${imgPath.slice(4)}`
              : imgPath;
          } else if (brand === 'kushitani') {
            itemImg = imgPath.startsWith('KST:')
              ? `https://img03.shop-pro.jp/${imgPath.slice(4)}`
              : imgPath;
          } else {
            // uniqlo / gu — 圖片都在 image.uniqlo.com
            itemImg = imgPath ? `https://image.uniqlo.com/${imgPath}` : '';
          }

          let productUrl = '';
          if (brand === 'rstaichi') {
            productUrl = `https://www.ec.rs-taichi.com/${productCode.toLowerCase()}.html`;
          } else if (brand === 'kushitani') {
            productUrl = `https://www.kushitanionline.com/?pid=${productCode}`;
          } else if (brand === 'gu') {
            productUrl = `https://www.gu-global.com/jp/ja/products/${productCode}/${pg}`;
          } else {
            productUrl = `https://www.uniqlo.com/jp/ja/products/${productCode}/${pg}`;
          }

          const promoEnd = data.get('pd') || null;

          // Upsert 購物車
          const { data: existingItem } = await supabase
            .from('cart_items')
            .select('id, quantity')
            .match({ user_id: userId, product_title: itemTitle, color: itemColor, size: itemSize })
            .maybeSingle();

          let cartError = null;
          if (existingItem) {
            const { error } = await supabase
              .from('cart_items')
              .update({
                quantity: (existingItem.quantity || 1) + 1,
                product_url: productUrl,
                ...(promoEnd ? { promo_end: promoEnd } : {}),
              })
              .eq('id', existingItem.id);
            cartError = error;
          } else {
            const { error } = await supabase.from('cart_items').insert({
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
            cartError = error;
          }

          if (cartError) {
            console.error('❌ Supabase 錯誤:', cartError.message);
            await sendReplyOrPush({ type: 'text', text: `抱歉，加入失敗。原因：${cartError.message}` });
          } else {
            const qtyText = existingItem ? `（已累計 ${(existingItem.quantity || 1) + 1} 件）` : '';
            const codeText = productCode ? `\n代號：${productCode}` : '';
            let promoWarning = '';
            if (data.get('pm') === '1') {
              const pdTs = data.get('pd');
              if (pdTs) {
                const twDate = new Date(Number(pdTs) * 1000 + 7 * 60 * 60 * 1000);
                const twTimeStr = `${twDate.getUTCMonth() + 1}/${twDate.getUTCDate()} ${String(twDate.getUTCHours()).padStart(2, '0')}:${String(twDate.getUTCMinutes()).padStart(2, '0')}`;
                promoWarning = `\n\n⏰ 此商品為期間限定特價，台灣截止時間為 ${twTimeStr}。\n系統每日採購時間約為 22:00，請盡早提交訂單以確保特價。如遇價格變動或庫存完售，將另行通知。`;
              } else {
                promoWarning = '\n\n⚠️ 此商品目前為期間限定特價。系統非即時下單，每日採購時間約為 22:00。如遇價格變動或庫存完售，將另行通知。';
              }
            }
            const jpyRate = await getRate();
            const isCustomPrice = data.get('cp') === '1';
            const twdItemPrice = isCustomPrice
              ? parseInt(itemPrice.replace(/[^\d]/g, ''), 10)
              : jpyToTwd(parseJpy(itemPrice), jpyRate);
            const customNote = isCustomPrice ? '\n（此商品為自訂售價，含運直送）' : '';
            await sendReplyOrPush({
              type: 'text',
              text: `✅ 已成功加入購物車！${qtyText}\n\n商品：${itemTitle}${codeText}\n顏色：${itemColor}\n尺寸：${itemSize}\n價格：NT$${twdItemPrice.toLocaleString()}${customNote}\n\n🛒 點擊選單「查看購物車」即可查看所有商品。${promoWarning}`,
            });
          }
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

        return;
      }

      // ── 2. 文字訊息路由 ──
      if (webhookEvent.type !== 'message' || webhookEvent.message.type !== 'text') return;
      const userText = webhookEvent.message.text.trim();

      // 查 ID
      if (userText === '查ID') {
        await sendReplyOrPush({ type: 'text', text: `您的 User ID 是：\n${userId}` });
        return;
      }

      // 開始購物 — 品牌導覽輪播（不需匯率，秒回）
      if (userText === '開始購物' || userText.includes('請輸入商品內頁網址')) {
        await sendReplyOrPush({
          type: 'flex',
          altText: '🛍️ 開始購物 — 選擇品牌',
          contents: { type: 'carousel', contents: buildShopCarousel() },
        } as FlexMessage);
        return;
      }

      // 購物須知 — FAQ 選單（不需匯率，秒回）
      if (userText === '購物須知' || userText === 'FAQ') {
        await sendReplyOrPush(buildFaqMenu());
        return;
      }

      // ── 3. URL 偵測與商品卡片 ──
      const urlMatch = userText.match(/https?:\/\/[^\s]+/i);
      if (!urlMatch) return;
      const pastedUrl = urlMatch[0];

      const brand = detectBrand(pastedUrl);

      if (!brand) {
        if (pastedUrl.includes('uniqlo.com') || pastedUrl.includes('gu-global.com')) {
          await sendReplyOrPush({
            type: 'text',
            text: '⚠️ 請貼上「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.uniqlo.com/jp/ja/products/E469077-000/00\nhttps://www.gu-global.com/jp/ja/products/E358741-000/00\n\n❌ 首頁或分類頁無法使用\n\n💡 在 Uniqlo/GU 官網找到喜歡的商品 → 點進商品頁 → 複製網址 → 貼到這裡即可！',
          });
        } else if (pastedUrl.includes('ec.rs-taichi.com')) {
          await sendReplyOrPush({
            type: 'text',
            text: '⚠️ 請貼上 RS Taichi「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.ec.rs-taichi.com/rsj334.html\n\n❌ 首頁或分類頁無法使用',
          });
        } else if (pastedUrl.includes('kushitanionline.com')) {
          await sendReplyOrPush({
            type: 'text',
            text: '⚠️ 請貼上 Kushitani「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.kushitanionline.com/?pid=165954837\n\n❌ 首頁或分類頁無法使用\n\n💡 在 Kushitani 官網找到喜歡的商品 → 點進商品頁 → 複製網址 → 貼到這裡即可！',
          });
        }
        return;
      }

      // RS Taichi 禁售品 & 安全帽檢查
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

      // Loading animation + 抓取商品
      if (userId) await showLoadingAnimation(userId, config.line.channelAccessToken, 20);

      try {
        console.log(`🕷️ [${brand}] 收到網址：${pastedUrl}`);
        const jpyRate = await getRate();

        let bubbles: FlexBubble[] = [];
        let productTitle = '';

        if (brand === 'uniqlo') {
          const productData = await scrapeUniqlo(pastedUrl);
          if (!productData) throw new Error('無法識別的網站資料');
          productTitle = productData.title;
          bubbles = buildUniqloCards(productData, jpyRate, pastedUrl);
        }

        if (brand === 'gu') {
          const productData = await scrapeGu(pastedUrl);
          if (!productData) throw new Error('無法識別的 GU 商品資料');
          productTitle = productData.title;
          bubbles = buildGuCards(productData, jpyRate, pastedUrl);
        }

        if (brand === 'rstaichi') {
          const productData = await scrapeRstaichi(pastedUrl);
          if (!productData) throw new Error('無法識別的 RS Taichi 商品資料');
          productTitle = productData.title;
          bubbles = buildRstaichiCards(productData, jpyRate, pastedUrl);
        }

        if (brand === 'kushitani') {
          const productData = await scrapeKushitani(pastedUrl);
          if (!productData) throw new Error('無法識別的 Kushitani 商品資料');
          productTitle = productData.title;
          const customPrice = getKushitaniCustomPrice(productData.modelNumber);
          bubbles = buildKushitaniCards(productData, jpyRate, pastedUrl, customPrice);
        }

        if (!bubbles.length) throw new Error('未取得任何商品變體');

        await sendReplyOrPush({
          type: 'flex',
          altText: `推薦商品：${productTitle}`,
          contents: { type: 'carousel', contents: bubbles },
        } as FlexMessage);
        console.log('✅ 訊息發送成功！');
      } catch (err: any) {
        console.error('❌ 失敗:', err.message);
        const d = err?.originalError?.response?.data || err?.response?.data;
        if (d) console.error('📌 LINE API 錯誤細節:', JSON.stringify(d));

        try {
          await sendReplyOrPush({ type: 'text', text: '抱歉，讀取網頁發生錯誤 > <' });
        } catch (replyErr: any) {
          console.error('❌ 錯誤回覆也失敗:', replyErr?.message || replyErr);
        }
      }
    }),
  );
  return 'OK';
});
