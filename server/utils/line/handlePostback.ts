// server/utils/line/handlePostback.ts
// 處理 LINE Postback 事件（加入購物車、補充庫存提示）
import type { Message } from '@line/bot-sdk';
import { useSupabase } from '../supabase';
import { parseJpy, jpyToTwd } from '#shared/pricing';
import { showLoadingAnimation } from './helpers';

type SendFn = (msg: Message | Message[]) => Promise<void>;
type GetRateFn = () => Promise<number>;

/** 重建各品牌圖片完整 URL */
function resolveImageUrl(
  brand: string,
  imgPath: string,
  productCode: string,
): string {
  if (brand === 'rstaichi') {
    return imgPath.startsWith('RST:')
      ? `https://media-www.ec.rs-taichi.com/${imgPath.slice(4)}`
      : imgPath;
  }
  if (brand === 'kushitani') {
    return imgPath.startsWith('KST:')
      ? `https://img03.shop-pro.jp/${imgPath.slice(4)}`
      : imgPath;
  }
  if (brand === 'fr2') {
    return imgPath.startsWith('FR2:')
      ? `https://cdn.shopify.com/s/files/1/0288/8515/5937/${imgPath.slice(4)}`
      : imgPath;
  }
  if (brand === 'bape') {
    if (imgPath.startsWith('BAPE:'))
      return `https://cdn.shopify.com/s/files/1/0326/3660/0451/${imgPath.slice(5)}`;
    if (imgPath.startsWith('BAPEP:'))
      return `https://cdn.shopify.com/s/files/1/2238/5135/${imgPath.slice(6)}`;
    return imgPath;
  }
  if (brand === 'aape') {
    return imgPath.startsWith('AAPE:')
      ? `https://c.imgz.jp/${productCode.slice(-3)}/${productCode}/${productCode}b_${imgPath.slice(5)}_d_500.jpg`
      : imgPath;
  }
  // uniqlo / gu
  return imgPath ? `https://image.uniqlo.com/${imgPath}` : '';
}

/** 重建各品牌商品頁 URL */
function resolveProductUrl(
  brand: string,
  productCode: string,
  pg: string,
  imgPath: string,
): string {
  if (brand === 'rstaichi')
    return `https://www.ec.rs-taichi.com/${productCode.toLowerCase()}.html`;
  if (brand === 'kushitani')
    return `https://www.kushitanionline.com/?pid=${productCode}`;
  if (brand === 'fr2') return `https://fr2.tokyo/products/${productCode}`;
  if (brand === 'bape') {
    return imgPath.startsWith('BAPEP:')
      ? `https://bapepirate.com/products/${productCode}`
      : `https://jp.bape.com/products/${productCode}`;
  }
  if (brand === 'aape') return `https://aape.jp/item/${productCode}.html`;
  if (brand === 'gu')
    return `https://www.gu-global.com/jp/ja/products/${productCode}/${pg}`;
  return `https://www.uniqlo.com/jp/ja/products/${productCode}/${pg}`;
}

/** 建立限時特價提醒文字 */
function buildPromoWarning(data: URLSearchParams): string {
  if (data.get('pm') !== '1') return '';
  const pdTs = data.get('pd');
  const pdd = data.get('pdd');
  if (!pdTs) {
    return '\n\n⚠️ 此商品目前為期間限定特價，本店每日採購時間約為 22:00（台灣時間）。\n逾時若特價已結束，隔日將通知補足差額；如不願補差額，退款時將扣除手續費後退回，敬請知悉。';
  }
  let dateStr: string;
  if (pdd) {
    dateStr = pdd;
  } else {
    const twDate = new Date(Number(pdTs) * 1000 + 8 * 60 * 60 * 1000);
    dateStr = `${twDate.getUTCMonth() + 1}/${twDate.getUTCDate()}`;
  }
  return `\n\n⏰ 此商品為期間限定特價（至 ${dateStr} 止）。\n本店採購截止為 ${dateStr} 22:00（台灣時間），請於此時間前提交訂單。\n逾時若特價已結束，隔日將通知補足差額；如不願補差額，退款時將扣除手續費後退回，敬請知悉。`;
}

export async function handleBuyPostback(
  data: URLSearchParams,
  userId: string,
  supabase: ReturnType<typeof useSupabase>,
  getRate: GetRateFn,
  sendReplyOrPush: SendFn,
  channelAccessToken: string,
): Promise<void> {
  await showLoadingAnimation(userId, channelAccessToken, 5);

  // 超過 2 小時的輪播視為過期
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
  const imgPath = data.get('img') || '';

  const itemImg = resolveImageUrl(brand, imgPath, productCode);
  const productUrl = resolveProductUrl(brand, productCode, pg, imgPath);
  const promoEnd = data.get('pd') || null;

  // Upsert 購物車
  const { data: existingItem } = await supabase
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
    await sendReplyOrPush({
      type: 'text',
      text: `抱歉，加入失敗。原因：${cartError.message}`,
    });
    return;
  }

  const qtyText = existingItem
    ? `（已累計 ${(existingItem.quantity || 1) + 1} 件）`
    : '';
  const codeText = productCode ? `\n代號：${productCode}` : '';
  const promoWarning = buildPromoWarning(data);

  const jpyRate = await getRate();
  const isCustomPrice = data.get('cp') === '1';
  const twdItemPrice = isCustomPrice
    ? parseInt(itemPrice.replace(/[^\d]/g, ''), 10)
    : jpyToTwd(parseJpy(itemPrice), jpyRate);

  await sendReplyOrPush({
    type: 'text',
    text: `✅ 已成功加入購物車！${qtyText}\n\n商品：${itemTitle}${codeText}\n顏色：${itemColor}\n尺寸：${itemSize}\n價格：NT$${twdItemPrice.toLocaleString()}\n\n🛒 點擊選單「查看購物車」即可查看所有商品。${promoWarning}`,
  });
}
