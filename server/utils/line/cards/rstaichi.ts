// server/utils/line/cards/rstaichi.ts
import type { FlexBubble, FlexComponent } from '@line/bot-sdk';
import { ensureLineImageUrl } from '../helpers';
import { parseJpy, jpyToTwd, formatTwd } from '#shared/pricing';

export function buildRstaichiCards(
  productData: any,
  jpyRate: number,
  pastedUrl: string,
): FlexBubble[] {
  return productData.variants.map((v: any) => {
    const safeImageUrl = ensureLineImageUrl(v.image);
    const imgCompact = (v.image || '').replace(
      /^https?:\/\/media-www\.ec\.rs-taichi\.com\//,
      'RST:',
    );

    const sizeCount = v.sizes.length;
    // 尺寸 > 8 時改用兩欄格線，大幅減少按鈕區高度
    const useTwoCol = sizeCount > 8;

    // ── 建立單一尺寸按鈕（供兩種排版共用）──
    const makeSizeBtn = (s: any): FlexComponent => {
      const baseData = `action=buy&brand=rstaichi&c=${encodeURIComponent(v.color)}&s=${encodeURIComponent(s.name)}&p=${encodeURIComponent(v.price)}&code=${productData.sku}&img=${encodeURIComponent(imgCompact)}&cat=rstaichi|${productData.weightGrams}&ts=${Math.floor(Date.now() / 1000)}`;
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
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        height: '32px',
        // 1欄時每個按鈕自帶上間距；2欄時由 row 控制間距
        ...(useTwoCol ? {} : { margin: 'sm' }),
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
      } as FlexComponent;
    };

    // ── 組合尺寸區塊 ──
    const sizesBox: FlexComponent = useTwoCol
      ? // 兩欄：每排兩個按鈕，高度減半
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          contents: Array.from(
            { length: Math.ceil(v.sizes.length / 2) },
            (_, i): FlexComponent => ({
              type: 'box',
              layout: 'horizontal',
              spacing: 'xs',
              margin: 'xs',
              contents: [
                makeSizeBtn(v.sizes[i * 2]),
                i * 2 + 1 < v.sizes.length
                  ? makeSizeBtn(v.sizes[i * 2 + 1])
                  : ({
                      type: 'box',
                      layout: 'vertical',
                      flex: 1,
                      contents: [],
                    } as FlexComponent),
              ],
            }),
          ),
        }
      : // 單欄：原有排列
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          contents: v.sizes.map(makeSizeBtn),
        };

    // 根據排版與尺寸數量動態決定圖片高度
    const aspectRatio = useTwoCol
      ? sizeCount <= 16
        ? '9:16'
        : '1:2'
      : sizeCount <= 7
        ? '3:4'
        : sizeCount <= 11
          ? '9:16'
          : '1:2';

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
              sizesBox,
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
