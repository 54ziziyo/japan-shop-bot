// server/utils/line/cards/kushitani.ts
import type { FlexBubble, FlexComponent } from '@line/bot-sdk';
import { ensureLineImageUrl } from '../helpers';
import { parseJpy, jpyToTwd, formatTwd } from '#shared/pricing';

/**
 * 日文顏色 → 中文翻譯對照表
 * 找不到時回傳原文（日文）
 */
const JP_COLOR_MAP: Record<string, string> = {
  // 基礎顏色
  ブラック: '黑色',
  ホワイト: '白色',
  レッド: '紅色',
  ブルー: '藍色',
  グレー: '灰色',
  ブラウン: '棕色',
  ベージュ: '米色',
  ネイビー: '深藍',
  イエロー: '黃色',
  グリーン: '綠色',
  オレンジ: '橘色',
  ピンク: '粉紅',
  シルバー: '銀色',
  ゴールド: '金色',
  カーキ: '卡其',

  // 變化色與組合色
  オリーブ: '橄欖綠',
  アイスグレー: '冰灰色',
  ダークレッド: '深紅色',
  ライトグレー: '淺灰色',
  サンドベージュ: '沙色米',
  ボルドー: '酒紅色',
  オリーブグリーン: '橄欖綠',
  タン: '棕褐色',
  サックス: '淡藍色',
  ダークブラウン: '深棕色',

  // 雙色組合
  'ブルー/ブラック': '藍黑雙色',
  'ホワイト/ブラック': '黑白雙色',
  ホワイトネイビー: '白深藍',
  'シルバー/ブラック': '銀黑雙色',
  'オレンジ/ブラック': '橘黑雙色',
  'ホワイト/ブルー': '白藍雙色',
  'ブラック/イエロー': '黑黃雙色',
  'サックス/ブラック': '淡藍黑雙色',
  'ライトグレー/ブラック': '淺灰黑雙色',
  'オリーブ/ブラック': '橄欖黑雙色',
  'ブラック/シルバー': '黑銀雙色',
  'ブラック/オレンジ': '黑橘雙色',
};

/** 嘗試翻譯日文顏色名，支援組合色（例: ホワイトネイビー → 白色深藍） */
function translateColor(jpColor: string): string {
  // 完全比對
  if (JP_COLOR_MAP[jpColor]) return JP_COLOR_MAP[jpColor];
  // 組合色：逐一比對已知色彩關鍵字
  let translated = jpColor;
  for (const [jp, zh] of Object.entries(JP_COLOR_MAP)) {
    translated = translated.replaceAll(jp, zh);
  }
  // 若有任何置換就回傳（否則回傳空字串表示無翻譯）
  return translated !== jpColor ? translated : '';
}

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

    const sizeCount = v.sizes.length;
    const useTwoCol = sizeCount > 8;

    const makeSizeBtn = (s: any): FlexComponent => {
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
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        height: '32px',
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

    const sizesBox: FlexComponent = useTwoCol
      ? {
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
      : {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          contents: v.sizes.map(makeSizeBtn),
        };

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
                text: displayPrice,
                size: 'md',
                weight: 'bold',
                color: '#ffffff',
                margin: 'md',
              },
              {
                type: 'text',
                text: (() => {
                  const zhColor = translateColor(v.color);
                  const colorLabel = zhColor
                    ? `${zhColor} (${v.color})`
                    : v.color;
                  return `顏色：${colorLabel} ¥${parseJpy(v.price).toLocaleString()}`;
                })(),
                size: 'xs',
                color: '#dddddd',
                margin: 'xs',
              },
              {
                type: 'text',
                text: '※官網同步偶有誤差，請依選購顏色為準',
                size: 'xxs',
                color: '#cccccc',
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
