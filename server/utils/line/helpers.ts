// server/utils/line/helpers.ts
// LINE 相關工具函式

/**
 * 確保圖片 URL 為 LINE 可用的 https 格式
 */
export function ensureLineImageUrl(url?: string): string {
  if (!url) return 'https://placehold.co/600x600.png?text=No+Image';
  let normalized = url.trim();
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  return normalized;
}

/**
 * 顯示 LINE Loading Animation（免費、不計訊息額度）
 */
export async function showLoadingAnimation(
  chatId: string,
  channelAccessToken: string,
  seconds = 5,
): Promise<void> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/chat/loading', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({ chatId, loadingSeconds: seconds }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`⚠️ Loading animation 失敗 [${res.status}]:`, errBody);
    }
  } catch (err) {
    console.warn('⚠️ Loading animation 例外:', err);
  }
}
