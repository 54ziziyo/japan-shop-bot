// server/utils/line/shopCarousel.ts
import type { FlexBubble, FlexMessage, FlexBox } from '@line/bot-sdk';

// ── 分類 ID ──
export type ShopCategory = 'fashion' | 'motogear';

/**
 * 「開始購物」第一步：分類選擇 Flex Message
 * 使用者點選分類後會發送 postback，webhook 再回覆對應輪播
 */
export function buildCategorySelector(): FlexMessage {
  const THEME = {
    BG_LIGHT: '#F1F4F2', // 稍微深一點點的底色，襯托白卡片
    SAGE_MAIN: '#4A7A6C', // 加深一點的品牌綠，更有質感且清晰
    SAGE_SOFT: '#E1EBE4', // 裝飾塊
    TEXT_DARK: '#1E2B27', // 接近黑的深墨綠
    TEXT_GRAY: '#708A81', // 灰綠色
    WHITE: '#FFFFFF',
  };

  const createCategoryItem = (
    imgUrl: string,
    title: string,
    subTitle: string,
    category: string,
  ): FlexBox => ({
    type: 'box',
    layout: 'horizontal',
    backgroundColor: THEME.WHITE,
    cornerRadius: 'xl',
    paddingAll: '16px',
    margin: 'md',
    alignItems: 'center',
    action: {
      type: 'postback',
      label: title,
      data: `action=shop_category&category=${category}`,
      displayText: `查看分類：${title}`,
    },
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '64px',
        height: '64px',
        cornerRadius: 'lg',
        contents: [
          {
            type: 'image',
            url: imgUrl,
            size: 'full',
            aspectMode: 'cover',
          },
        ],
      },
      {
        type: 'box',
        layout: 'vertical',
        margin: 'lg',
        flex: 1,
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'md',
            color: THEME.TEXT_DARK,
          },
          {
            type: 'text',
            text: subTitle,
            size: 'xxs',
            color: THEME.TEXT_GRAY,
            margin: 'xs',
            wrap: true,
          },
        ],
      },
    ],
  });

  const bubbleContents: FlexBubble = {
    type: 'bubble',
    size: 'giga',
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: THEME.BG_LIGHT,
      paddingAll: '24px',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'EXPLORE COLLECTIONS',
              size: 'xxs',
              color: THEME.SAGE_MAIN,
              weight: 'bold',
            },
            {
              type: 'text',
              text: '品牌分類',
              weight: 'bold',
              size: 'xl',
              color: THEME.TEXT_DARK,
              margin: 'sm',
            },
            {
              type: 'box',
              layout: 'vertical',
              width: '32px',
              height: '3px',
              backgroundColor: THEME.SAGE_MAIN,
              margin: 'md',
              cornerRadius: 'sm',
              contents: [],
            },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          contents: [
            createCategoryItem(
              'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=200&fit=cover',
              '潮牌服飾',
              'BAPE / FR2 / UNIQLO / GU',
              'fashion',
            ),
            createCategoryItem(
              'https://roml-life.com/wp-content/uploads/2025/02/hero19_bg-scaled.jpg',
              '重機部品',
              'Kushitani / RS Taichi',
              'motogear',
            ),
          ],
        },
      ],
    },
  };
  return {
    type: 'flex',
    altText: '開始購物 — 選擇品牌分類',
    contents: bubbleContents,
  };
}

/**
 * 第二步：依分類回傳品牌輪播
 */
export function buildShopCarousel(category?: ShopCategory): FlexBubble[] {
  const guideBubble: FlexBubble = {
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
  };

  const customerServiceBubble: FlexBubble = {
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
  };

  // ── 品牌卡定義 ──
  const fashionBrands: FlexBubble[] = [
    buildBrandBubble(
      'https://romoru.vercel.app/image/bape.jpg',
      // 'https://i.ibb.co/kgy2pBKq/bape.jpg',
      'https://jp.bape.com/',
    ),
    buildBrandBubble(
      'https://romoru.vercel.app/image/fr2.jpg',
      // 'https://i.ibb.co/nqfCW4CC/fr2.jpg',
      'https://fr2.tokyo/',
    ),
    buildBrandBubble(
      'https://romoru.vercel.app/image/uniqlo.jpg',
      // 'https://i.ibb.co/v6FCwdgD/Uniqlo.jpg',
      'https://www.uniqlo.com/jp/ja/',
    ),
    buildBrandBubble(
      'https://romoru.vercel.app/image/gu.jpg',
      // 'https://i.ibb.co/qYX1DYYh/Gu.jpg',
      'https://www.gu-global.com/jp/ja/',
    ),
  ];

  const motogearBrands: FlexBubble[] = [
    buildBrandBubble(
      // 'https://i.ibb.co/wZQny8Kf/Kushitani.jpg',
      'https://romoru.vercel.app/image/kushitani.jpg',
      'https://www.kushitanionline.com/',
    ),
    buildBrandBubble(
      'https://romoru.vercel.app/image/rstaichi.jpg',
      // 'https://i.ibb.co/pBz91654/Rs-Taichi.jpg',
      'https://www.ec.rs-taichi.com/',
    ),
  ];

  let brandBubbles: FlexBubble[];
  if (category === 'fashion') {
    brandBubbles = fashionBrands;
  } else if (category === 'motogear') {
    brandBubbles = motogearBrands;
  } else {
    // 沒有指定分類時顯示全部（向下相容）
    brandBubbles = [...fashionBrands, ...motogearBrands];
  }

  return [guideBubble, ...brandBubbles, customerServiceBubble];
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
            type: 'uri',
            label: '聯繫客服',
            uri: 'https://lin.ee/BIvxV5C',
          },
          contents: [
            {
              type: 'text',
              text: '聯繫客服',
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
