// server/utils/line/shopCarousel.ts
// 「開始購物」品牌導覽輪播 Flex 訊息
import type { FlexBubble } from '@line/bot-sdk';

export function buildShopCarousel(): FlexBubble[] {
  return [
    // 1. 教學全圖卡 — 純圖，無按鈕
    {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '0px',
        contents: [
          {
            type: 'image',
            url: 'https://romoru.vercel.app/image/guide.jpg',
            size: 'full',
            aspectMode: 'cover',
            aspectRatio: '800:1240',
          },
        ],
      },
    },
    // 2. 品牌卡 Kushitani
    buildBrandBubble(
      'https://romoru.vercel.app/image/kushitani.jpg',
      'https://www.kushitanionline.com/',
    ),
    // 3. 品牌卡 RS Taichi
    buildBrandBubble(
      'https://romoru.vercel.app/image/rstaichi.jpg',
      'https://www.ec.rs-taichi.com/',
    ),
    // 4. 品牌卡 BAPE
    buildBrandBubble(
      'https://i.ibb.co/997gfrrJ/Group-842.jpg',
      // 'https://romoru.vercel.app/image/bape.jpg',
      'https://jp.bape.com/',
    ),
    // 5. 品牌卡 FR2
    buildBrandBubble(
      'https://i.ibb.co/jvx45c99/Group-843.jpg',
      // 'https://romoru.vercel.app/image/fr2.jpg',
      'https://fr2.tokyo/',
    ),
    // 6. 品牌卡 UNIQLO
    buildBrandBubble(
      'https://romoru.vercel.app/image/uniqlo.jpg',
      'https://www.uniqlo.com/jp/ja/',
    ),
    // 7. 品牌卡 Gu
    buildBrandBubble(
      'https://romoru.vercel.app/image/gu.jpg',
      'https://www.gu-global.com/jp/ja/',
    ),
    // 8. 客服卡
    {
      type: 'bubble',
      size: 'kilo',
      hero: {
        type: 'image',
        url: 'https://romoru.vercel.app/image/call-customer.jpg',
        size: 'full',
        aspectMode: 'cover',
        aspectRatio: '800:898',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '0px',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            paddingAll: '0px',
            backgroundColor: '#689E8D',
            height: '56px',
            justifyContent: 'center',
            alignItems: 'center',
            action: {
              type: 'uri',
              label: '呼叫真人客服',
              uri: 'https://lin.ee/BIvxV5C',
            },
            contents: [
              {
                type: 'text',
                text: '呼叫真人客服',
                size: 'sm',
                color: '#ffffff',
                weight: 'bold',
              },
            ],
          },
          {
            type: 'box',
            layout: 'vertical',
            paddingAll: '0px',
            backgroundColor: '#ffffff',
            height: '55px',
            justifyContent: 'center',
            alignItems: 'center',
            action: {
              type: 'message',
              label: '購物須知',
              text: '購物須知',
            },
            contents: [
              {
                type: 'text',
                text: '購物須知',
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
}

/**
 * 品牌卡片：用 hero 放圖片，body 放按鈕
 * 改用 hero 區塊確保圖片在 LINE 桌機版也能正確顯示
 */
function buildBrandBubble(imageUrl: string, siteUrl: string): FlexBubble {
  return {
    type: 'bubble',
    size: 'kilo',
    hero: {
      type: 'image',
      url: imageUrl,
      size: 'full',
      aspectMode: 'cover',
      aspectRatio: '800:894',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '0px',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '0px',
          backgroundColor: '#FFFFFF',
          height: '55px',
          justifyContent: 'center',
          alignItems: 'center',
          action: {
            type: 'uri',
            label: '前往日本官網',
            uri: siteUrl,
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
        {
          type: 'box',
          layout: 'vertical',
          paddingStart: 'xl',
          paddingEnd: 'xl',
          backgroundColor: '#FFFFFF',
          contents: [{ type: 'separator', color: '#bbbbbb' }],
        },
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '0px',
          backgroundColor: '#ffffff',
          height: '55px',
          justifyContent: 'center',
          alignItems: 'center',
          action: {
            type: 'message',
            label: '購物須知',
            text: '購物須知',
          },
          contents: [
            {
              type: 'text',
              text: '購物須知',
              size: 'sm',
              color: '#000000',
              weight: 'bold',
            },
          ],
        },
      ],
    },
  };
}
