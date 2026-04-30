// server/utils/line/socialMenu.ts
// 社群媒體 / 代購群組 Flex Message 建構器
import type { FlexBox, FlexMessage } from '@line/bot-sdk';

const THEME = {
  BG_LIGHT: '#F1F4F2',
  SAGE_MAIN: '#4A7A6C',
  TEXT_DARK: '#1E2B27',
  TEXT_GRAY: '#708A81',
  WHITE: '#FFFFFF',
};

function buildHeader(label: string, title: string) {
  return {
    type: 'box' as const,
    layout: 'vertical' as const,
    contents: [
      {
        type: 'text' as const,
        text: label,
        size: 'xxs' as const,
        color: THEME.SAGE_MAIN,
        weight: 'bold' as const,
      },
      {
        type: 'text' as const,
        text: title,
        size: 'xl' as const,
        weight: 'bold' as const,
        color: THEME.TEXT_DARK,
        margin: 'xs' as const,
      },
      {
        type: 'separator' as const,
        margin: 'md' as const,
        color: THEME.SAGE_MAIN,
      },
    ],
  };
}

function buildLinkCard(
  title: string,
  subtitle: string,
  imgUrl: string,
  uri: string,
  actionLabel: string,
): FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: THEME.WHITE,
    cornerRadius: 'xl',
    paddingAll: '16px',
    margin: 'md',
    alignItems: 'center',
    action: { type: 'uri', label: actionLabel, uri },
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '64px',
        height: '64px',
        cornerRadius: 'lg',
        contents: [
          { type: 'image', url: imgUrl, size: 'full', aspectMode: 'cover' },
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
            text: subtitle,
            size: 'xxs',
            color: THEME.TEXT_GRAY,
            margin: 'xs',
            wrap: true,
          },
        ],
      },
    ],
  };
}

export function buildSocialMediaFlex(): FlexMessage {
  return {
    type: 'flex',
    altText: '請選擇要瀏覽的社群媒體',
    contents: {
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: THEME.BG_LIGHT,
        paddingAll: '24px',
        contents: [
          buildHeader('SOCIAL MEDIA', '社群媒體'),
          buildLinkCard(
            '潮牌服飾',
            'BAPE/AAPE/FR2 等潮牌精品資訊分享',
            'https://romoru.vercel.app/image/romu.jpg',
            'https://www.instagram.com/roml_romu/',
            '潮牌服飾 IG',
          ),
          buildLinkCard(
            '重機部品',
            'Kushitani/RSTaichi/Hyod 等部品資訊分享',
            'https://romoru.vercel.app/image/roml.jpg',
            'https://www.instagram.com/roml_life',
            '重機部品 IG',
          ),
        ],
      },
    },
  };
}

export function buildGroupFlex(): FlexMessage {
  return {
    type: 'flex',
    altText: '請選擇要加入的代購群組',
    contents: {
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: THEME.BG_LIGHT,
        paddingAll: '24px',
        contents: [
          buildHeader('JOIN OUR COMMUNITY', '代購群組'),
          buildLinkCard(
            '潮牌精品',
            '加入潮牌精品群組，每週六日本現場連線～',
            'https://romoru.vercel.app/image/romu.jpg',
            'https://line.me/ti/g2/jI6F7X5mXqtdLpnS0jqM2NHfluODvVCOd_kOwg?utm_source=invitation&utm_medium=link_copy&utm_campaign=default',
            '加入潮牌精品群組',
          ),
          buildLinkCard(
            '重機部品',
            '加入重機部品群組，最新資訊隨時掌握！',
            'https://romoru.vercel.app/image/roml.jpg',
            'https://line.me/ti/g2/U-2cbrYQH-vFasaHJ8saorPjIbuJ4CokjU1MWg?utm_source=invitation&utm_medium=link_copy&utm_campaign=default',
            '加入重機部品群組',
          ),
        ],
      },
    },
  };
}
