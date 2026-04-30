// server/utils/line/handleUrlMessage.ts
// 處理使用者貼上商品網址 → 爬取 → 回傳商品輪播卡片
import type { FlexBubble, FlexMessage, Message } from '@line/bot-sdk';
import {
  detectBrand,
  extractRstaichiSku,
  isRstaichiBlocked,
  isKushitaniBlocked,
  extractKushitaniPid,
  detectNonJapaneseSite,
  isGloballyRestricted,
  ProhibitedItemError,
} from '../brandConfig';
import { showLoadingAnimation } from './helpers';
import { getKushitaniCustomPrice } from '../kushitaniPricing';
import { scrapeUniqlo } from '../scrape/uniqlo';
import { scrapeRstaichi } from '../scrape/rstaichi';
import { scrapeGu } from '../scrape/gu';
import { scrapeKushitani } from '../scrape/kushitani';
import { scrapeFr2 } from '../scrape/fr2';
import { scrapeBape } from '../scrape/bape';
import { scrapeAape } from '../scrape/aape';
import {
  buildUniqloCards,
  buildRstaichiCards,
  buildGuCards,
  buildKushitaniCards,
  buildFr2Cards,
  buildBapeCards,
  buildAapeCards,
} from './cards';

type SendFn = (msg: Message | Message[]) => Promise<void>;

/** 針對各品牌回傳正確格式提示 */
async function sendBrandHint(
  pastedUrl: string,
  sendReplyOrPush: SendFn,
): Promise<boolean> {
  const hints: Array<{ domain: string; text: string }> = [
    {
      domain: 'uniqlo.com',
      text: '⚠️ 請貼上「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.uniqlo.com/jp/ja/products/E469077-000/00\nhttps://www.gu-global.com/jp/ja/products/E358741-000/00\n\n❌ 首頁或分類頁無法使用\n\n💡 在 Uniqlo/GU 官網找到喜歡的商品 → 點進商品頁 → 複製網址 → 貼到這裡即可！',
    },
    {
      domain: 'gu-global.com',
      text: '⚠️ 請貼上「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.uniqlo.com/jp/ja/products/E469077-000/00\nhttps://www.gu-global.com/jp/ja/products/E358741-000/00\n\n❌ 首頁或分類頁無法使用\n\n💡 在 Uniqlo/GU 官網找到喜歡的商品 → 點進商品頁 → 複製網址 → 貼到這裡即可！',
    },
    {
      domain: 'ec.rs-taichi.com',
      text: '⚠️ 請貼上 RS Taichi「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.ec.rs-taichi.com/rsj334.html\n\n❌ 首頁或分類頁無法使用',
    },
    {
      domain: 'kushitanionline.com',
      text: '⚠️ 請貼上 Kushitani「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://www.kushitanionline.com/?pid=165954837\n\n❌ 首頁或分類頁無法使用\n\n💡 在 Kushitani 官網找到喜歡的商品 → 點進商品頁 → 複製網址 → 貼到這裡即可！',
    },
    {
      domain: 'fr2.tokyo',
      text: '⚠️ 請貼上 FR2「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://fr2.tokyo/products/1080000003180\n\n❌ 首頁或分類頁無法使用',
    },
    {
      domain: 'jp.bape.com',
      text: '⚠️ 請貼上 BAPE「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://jp.bape.com/products/1k30-110-009\n\n❌ 首頁或分類頁無法使用',
    },
    {
      domain: 'bapepirate.com',
      text: '⚠️ 請貼上 BAPE PIRATE「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://bapepirate.com/products/1k80191309\n\n❌ 首頁或分類頁無法使用',
    },
    {
      domain: 'aape.jp',
      text: '⚠️ 請貼上 AAPE「商品內頁」的網址喔！\n\n✅ 正確格式範例：\nhttps://aape.jp/item/103433420.html\nhttps://aape.jp/category/GT108/87720188.html\n\n❌ 首頁或搜尋頁無法使用',
    },
  ];

  const hint = hints.find((h) => pastedUrl.includes(h.domain));
  if (hint) {
    await sendReplyOrPush({ type: 'text', text: hint.text });
    return true;
  }
  return false;
}

export async function handleUrlMessage(
  pastedUrl: string,
  userId: string,
  getRate: () => Promise<number>,
  sendReplyOrPush: SendFn,
  channelAccessToken: string,
): Promise<void> {
  const brand = detectBrand(pastedUrl);

  if (!brand) {
    const nonJP = detectNonJapaneseSite(pastedUrl);
    if (nonJP) {
      await sendReplyOrPush({
        type: 'text',
        text: `⚠️ 您貼上的是 ${nonJP.brandName} 非日本版官網喔！\n\n目前僅支援日本官網代購，請改用日本版：\n${nonJP.jpUrl}`,
      });
      return;
    }
    await sendBrandHint(pastedUrl, sendReplyOrPush);
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
          text: '安全帽類商品因規格與尺寸較為特殊，目前不提供線上直接加入購物車。\n\n如需購買安全帽，請直接聯繫專人客服為您報價與處理！\n\n專人客服 👉 https://lin.ee/BIvxV5C \n\n專員會儘速回覆您 😊',
        });
        return;
      }
    }
  }

  // Kushitani 禁售品檢查
  if (brand === 'kushitani') {
    const pid = extractKushitaniPid(pastedUrl);
    if (pid && isKushitaniBlocked(pid)) {
      await sendReplyOrPush({
        type: 'text',
        text: '🚫 很抱歉，此商品屬於國際郵寄運送禁止品項（含滑塊、護具配件等），無法提供代購服務。\n\n如有疑問，歡迎聯繫專人客服 🙏',
      });
      return;
    }
  }

  if (userId) await showLoadingAnimation(userId, channelAccessToken, 20);

  try {
    console.log(`🕷️ [${brand}] 收到網址：${pastedUrl}`);
    const jpyRate = await getRate();
    let bubbles: FlexBubble[] = [];
    let productTitle = '';

    if (brand === 'uniqlo') {
      const productData = await scrapeUniqlo(pastedUrl);
      if (!productData) throw new Error('無法識別的網站資料');
      productTitle = productData.title;
      if (productData.category.startsWith('flower'))
        throw new ProhibitedItemError(productTitle);
      if (isGloballyRestricted(productTitle))
        throw new ProhibitedItemError(productTitle);
      bubbles = buildUniqloCards(productData, jpyRate, pastedUrl);
    }

    if (brand === 'gu') {
      const productData = await scrapeGu(pastedUrl);
      if (!productData) throw new Error('無法識別的 GU 商品資料');
      productTitle = productData.title;
      if (isGloballyRestricted(productTitle))
        throw new ProhibitedItemError(productTitle);
      bubbles = buildGuCards(productData, jpyRate, pastedUrl);
    }

    if (brand === 'rstaichi') {
      const productData = await scrapeRstaichi(pastedUrl);
      if (!productData) throw new Error('無法識別的 RS Taichi 商品資料');
      productTitle = productData.title;
      if (isGloballyRestricted(productTitle))
        throw new ProhibitedItemError(productTitle);
      bubbles = buildRstaichiCards(productData, jpyRate, pastedUrl);
    }

    if (brand === 'kushitani') {
      const productData = await scrapeKushitani(pastedUrl);
      if (!productData) throw new Error('無法識別的 Kushitani 商品資料');
      productTitle = productData.title;
      if (isGloballyRestricted(productTitle))
        throw new ProhibitedItemError(productTitle);
      const customPrice = getKushitaniCustomPrice(productData.modelNumber);
      bubbles = buildKushitaniCards(
        productData,
        jpyRate,
        pastedUrl,
        customPrice,
      );
    }

    // FR2: scraper 內部已 throw ProhibitedItemError，不需再做全局 title 檢查
    if (brand === 'fr2') {
      const productData = await scrapeFr2(pastedUrl);
      if (!productData) throw new Error('無法識別的 FR2 商品資料');
      productTitle = productData.title;
      bubbles = buildFr2Cards(productData, jpyRate, pastedUrl);
    }

    if (brand === 'bape') {
      const productData = await scrapeBape(pastedUrl);
      if (!productData) throw new Error('無法識別的 BAPE 商品資料');
      productTitle = productData.title;
      if (isGloballyRestricted(productTitle))
        throw new ProhibitedItemError(productTitle);
      bubbles = buildBapeCards(productData, jpyRate, pastedUrl);
    }

    if (brand === 'aape') {
      const productData = await scrapeAape(pastedUrl);
      if (!productData) throw new Error('無法識別的 AAPE 商品資料');
      productTitle = productData.title;
      if (isGloballyRestricted(productTitle))
        throw new ProhibitedItemError(productTitle);
      bubbles = buildAapeCards(productData, jpyRate, pastedUrl);
    }

    if (!bubbles.length) throw new Error('未取得任何商品變體');

    await sendReplyOrPush({
      type: 'flex',
      altText: `推薦商品：${productTitle}`,
      contents: { type: 'carousel', contents: bubbles },
    } as FlexMessage);
    console.log('✅ 訊息發送成功！');
  } catch (err: any) {
    if (err.name === 'ProhibitedItemError') {
      try {
        await sendReplyOrPush({
          type: 'text',
          text: '🚫 很抱歉，此商品含有電池、充電裝置、酒精、汽油或其他航空運送禁止品項，無法提供代購服務。\n\n如有疑問，歡迎聯繫專人客服 🙏',
        });
      } catch {}
      return;
    }

    console.error('❌ 失敗:', err.message);
    const d = err?.originalError?.response?.data || err?.response?.data;
    if (d) console.error('📌 LINE API 錯誤細節:', JSON.stringify(d));

    try {
      await sendReplyOrPush({
        type: 'text',
        text: '抱歉，讀取網頁發生錯誤 > <',
      });
    } catch (replyErr: any) {
      console.error('❌ 錯誤回覆也失敗:', replyErr?.message || replyErr);
    }
  }
}
