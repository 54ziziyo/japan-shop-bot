// server/utils/line/cards/kushitani.ts
import type { FlexBubble, FlexComponent } from '@line/bot-sdk';
import { ensureLineImageUrl } from '../helpers';
import { parseJpy, jpyToTwd, formatTwd } from '#shared/pricing';

export function buildKushitaniCards(
  productData: any,
  jpyRate: number,
  pastedUrl: string,
  customPrice?: { priceTwd: number; skipShipping: boolean } | null,
): FlexBubble[] {
  const hasCustom = !!customPrice;
  return productData.variants.map((v: any) => {
    const safeImageUrl = ensureLineImageUrl(v.image);
    const imgCompact = (v.image || '').replace(
      /^https?:\/\/img03\.shop-pro\.jp\//,
      'KST:',
    );

    // 自訂價格時：postback 帶 cp=NT${priceTwd}，在 buy handler 直接用台幣
    // 原價時：postback 帶日幣 p=¥xxx，由 buy handler 匯率換算
    const displayPrice = hasCustom
      ? `NT$${customPrice!.priceTwd.toLocaleString()}`
      : formatTwd(jpyToTwd(parseJpy(v.price), jpyRate));
    const postbackPrice = hasCustom ? `NT$${customPrice!.priceTwd}` : v.price;
    const catValue =
      hasCustom && customPrice!.skipShipping
        ? `kushitani|0`
        : `kushitani|${productData.weightGrams}`;

    const sizeButtons: FlexComponent[] = v.sizes.map((s: any) => {
      const baseData = `action=buy&brand=kushitani&c=${encodeURIComponent(v.color)}&s=${encodeURIComponent(s.name)}&p=${encodeURIComponent(postbackPrice)}&code=${productData.pid}&img=${encodeURIComponent(imgCompact)}&cat=${catValue}&ts=${Math.floor(Date.now() / 1000)}${hasCustom ? '&cp=1' : ''}`;
      // LINE postback 上限 300 字元 — 先組完整版，超長就逐字截短（含省略號）
      let titleSlice = productData.title;
      let compactData = `${baseData}&t=${encodeURIComponent(titleSlice)}`;
      while (compactData.length > 300 && titleSlice.length > 0) {
        titleSlice = titleSlice.slice(0, -1);
        const display = titleSlice.length > 0 ? titleSlice + '…' : '';
        compactData = `${baseData}&t=${encodeURIComponent(display)}`;
      }
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
            text: s.isStock ? `加入購物車 | ${s.name}` : `${s.name} 完售`,
            color: themeColor,
            align: 'center',
            weight: 'bold',
            size: 'xxs',
          },
        ],
      };
    });

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
                text: displayPrice,
                size: 'md',
                weight: 'bold',
                color: '#ffffff',
                margin: 'md',
              },
              {
                type: 'text',
                text: hasCustom
                  ? `顏色：${v.color}（含運直送）`
                  : `顏色：${v.color} ¥${parseJpy(v.price).toLocaleString()}`,
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
            action: { type: 'uri', label: '查看詳情', uri: pastedUrl },
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
