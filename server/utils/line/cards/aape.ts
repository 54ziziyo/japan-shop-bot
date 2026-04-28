// server/utils/line/cards/aape.ts
import type { FlexBubble, FlexComponent } from '@line/bot-sdk';
import { ensureLineImageUrl } from '../helpers';
import { parseJpy, jpyToTwd, formatTwd } from '#shared/pricing';

export function buildAapeCards(
  productData: any,
  jpyRate: number,
  pastedUrl: string,
): FlexBubble[] {
  const preOrderBadge = productData.isPreOrder ? ' 🔔預購' : '';

  return productData.variants.map((v: any) => {
    const safeImageUrl = ensureLineImageUrl(v.image);
    // 壓縮圖片 URL：只保留顏色代碼（colorCode），重建時用 code(itemId) 拼接
    // 壓縮格式：AAPE:{colorCode}  →  https://c.imgz.jp/420/{itemId}/{itemId}b_{colorCode}_d_500.jpg
    const imgCompact = `AAPE:${v.colorCode}`;

    const sizeButtons: FlexComponent[] = v.sizes.map((s: any) => {
      const baseData = `action=buy&brand=aape&c=${encodeURIComponent(v.color)}&s=${encodeURIComponent(s.name)}&p=${encodeURIComponent(v.price)}&code=${productData.itemId}&img=${encodeURIComponent(imgCompact)}&cat=aape|${productData.weightGrams}&ts=${Math.floor(Date.now() / 1000)}`;
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
            text: s.isStock
              ? s.name === 'F'
                ? '加入購物車'
                : `加入購物車 | ${s.name}`
              : s.name === 'F'
                ? '完售'
                : `${s.name} 完售`,
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
                text: productData.title + preOrderBadge,
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
                text: `顏色：${v.color}　${v.price}`,
                size: 'xs',
                color: '#dddddd',
                margin: 'xs',
              },
              ...(productData.isPreOrder
                ? [
                    {
                      type: 'text' as const,
                      text: '🔔 此為預購商品，下單後需等待發貨',
                      size: 'xxs' as const,
                      color: '#ffcc00',
                      margin: 'xs' as const,
                    },
                  ]
                : []),
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
                size: 'xs',
                weight: 'bold',
                align: 'center',
              },
            ],
          },
        ],
      },
    };
  });
}
