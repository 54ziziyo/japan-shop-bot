// ============================================================
// 從 RS Taichi 圖片網址解析「西元年 + 春夏/秋冬款」
// auto-listing/src/season.ts
// ============================================================
// RS Taichi 圖片檔名把季節碼編在結尾，例如：
//   rst469ye02n_1_26ss.jpg → 26ss → 2026 春夏
//   xxxx_1_24aw.jpg         → 24aw → 2024 秋冬
//   ss = Spring/Summer 春夏；aw / fw = Autumn(Fall)/Winter 秋冬

export interface SeasonInfo {
  /** 西元年，例：2026 */
  year: number;
  /** 'ss' | 'aw' */
  half: 'ss' | 'aw';
  /** 中文季節，例：'春夏款' / '秋冬款' */
  labelZh: string;
  /** 媒體資料夾名，例：'2026 春夏' */
  folder: string;
}

/**
 * 從一個或多個圖片網址解析季節。取第一個解析成功的。
 * 解析不到時回傳 null（呼叫端自行決定 fallback）。
 */
export function parseSeason(imageUrls: string[]): SeasonInfo | null {
  const re = /_(\d{2})(ss|aw|fw)\b/i;
  for (const url of imageUrls) {
    const m = url.match(re);
    if (!m) continue;
    const yy = parseInt(m[1]!, 10);
    const code = m[2]!.toLowerCase();
    const year = 2000 + yy;
    const half: 'ss' | 'aw' = code === 'ss' ? 'ss' : 'aw';
    const labelZh = half === 'ss' ? '春夏款' : '秋冬款';
    const folderSeason = half === 'ss' ? '春夏' : '秋冬';
    return { year, half, labelZh, folder: `${year} ${folderSeason}` };
  }
  return null;
}
