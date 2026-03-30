// server/utils/line/cards/gu.ts
import type { FlexBubble, FlexComponent } from '@line/bot-sdk';
import { ensureLineImageUrl } from '../helpers';
import { parseJpy, jpyToTwd, formatTwd } from '#shared/pricing';

export function buildGuCards(
  productData: any,
  jpyRate: number,
  pastedUrl: string,
): FlexBubble[] {
  return productData.variants.map((v: any) => {
    const safeImageUrl = ensureLineImageUrl(v.image);
    const imgPath = (v.image || '')
      .replace(/^https?:\/\/image\.uniqlo\.com\//, '')
      .split('?')[0];

    const sizeButtons: FlexComponent[] = v.sizes.map((s: any) => {
      const compactData = `action=buy&brand=gu&t=${encodeURIComponent(productData.title.slice(0, 5))}&c=${encodeURIComponent(v.color)}&s=${encodeURIComponent(s.name)}&p=${encodeURIComponent(v.price)}&code=${productData.rawCode}&img=${imgPath}&cat=${productData.category}&pg=${productData.priceGroup}&ts=${Math.floor(Date.now() / 1000)}${productData.isLimitedOffer ? `&pm=1&pd=${productData.promoEndTs || ''}` : ''}`;
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
