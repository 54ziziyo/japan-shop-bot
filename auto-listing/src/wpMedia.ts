// ============================================================
// WordPress 媒體 REST 客戶端（應用程式密碼認證）
// auto-listing/src/wpMedia.ts
// ============================================================
// 用 wp/v2/media 上傳圖片並指定 SEO 檔名/alt/標題。
// JoomUnited WP Media Folder 的資料夾歸檔機制需先探測（見 inspectMedia.ts）。

import axios, { type AxiosInstance } from 'axios';
import type { WpConfig } from './config';

export class WpClient {
  private http: AxiosInstance;
  readonly storeUrl: string;

  constructor(storeUrl: string, cfg: WpConfig) {
    this.storeUrl = storeUrl;
    this.http = axios.create({
      baseURL: `${storeUrl}/wp-json`,
      auth: { username: cfg.user, password: cfg.appPassword },
      timeout: 60000,
    });
  }

  get raw(): AxiosInstance {
    return this.http;
  }

  /** 確認認證可用，回傳目前使用者資訊 */
  async whoAmI(): Promise<{ id: number; name: string; slug: string }> {
    const { data } = await this.http.get('/wp/v2/users/me', {
      params: { context: 'edit' },
    });
    return { id: data.id, name: data.name, slug: data.slug };
  }

  /**
   * 圖片去重上傳：若媒體庫已有同名檔案則直接回傳其 ID 與 URL，否則從 URL 下載並上傳。
   * @param imageUrl  原始圖片 URL
   * @param altText   圖片 alt 文字（SEO 用）
   * @returns WP media ID 與 WordPress 托管的圖片 URL
   */
  async ensureImage(imageUrl: string, altText: string): Promise<{ id: number; url: string }> {
    const filename = imageUrl.split('/').pop()?.split('?')[0] ?? 'image.jpg';
    const basename = filename.replace(/\.[^.]+$/, '');

    // 先搜尋媒體庫是否已有此檔案
    const { data: existing } = await this.http.get('/wp/v2/media', {
      params: { search: basename, per_page: 10 },
    });
    if (Array.isArray(existing) && existing.length > 0) {
      const match = existing.find(
        (m: { source_url?: string; slug?: string }) =>
          m.source_url?.includes(filename) || m.slug === basename,
      );
      if (match) {
        console.log(`   📎 已存在 #${match.id}（${filename}）`);
        return { id: match.id as number, url: match.source_url as string };
      }
    }

    // 從來源 URL 下載圖片
    const imgRes = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30_000,
    });
    const buffer = Buffer.from(imgRes.data as ArrayBuffer);
    const contentType =
      (imgRes.headers['content-type'] as string | undefined) || 'image/jpeg';

    // 上傳到 WP 媒體庫
    const { data: uploaded } = await this.http.post('/wp/v2/media', buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

    // 設定 alt 文字
    await this.http.post(`/wp/v2/media/${uploaded.id}`, { alt_text: altText });

    console.log(`   ⬆️ 已上傳 #${uploaded.id}（${filename}）`);
    return { id: uploaded.id as number, url: uploaded.source_url as string };
  }
}
