// ============================================================
// 草稿 JSON：scrape 產出、由 Claude 填文案、create 讀取
// auto-listing/src/draft.ts
// ============================================================
// 不依賴付費 API：scrape 只填 scraped/season/categoryOptions，
// content 欄位留空，由 Claude（在 Claude Code 對話中）填好，再給 create。

import fs from 'node:fs';
import path from 'node:path';
import type { RstaichiProduct } from '../../server/utils/scrape/rstaichi';
import type { SeasonInfo } from './season';

/** 上架文案（由 Claude 在對話中填寫） */
export interface ListingContent {
  /** 品牌 型號 英文名 中文名 + SEO關鍵字 */
  name: string;
  /** 網址代稱：`rs-taichi-{sku}-{英文品名}-{中文焦點關鍵字}`（末尾必須加中文，Yoast 代稱檢查才能通過） */
  slug: string;
  /** Yoast 焦點關鍵字 */
  focusKeyword: string;
  /** Yoast SEO 標題 */
  seoTitle: string;
  /** Yoast 中繼描述（120~156 字，含焦點關鍵字） */
  metaDescription: string;
  /** 商品說明 HTML（SEO+GEO） */
  descriptionHtml: string;
  /** 商品簡短說明 HTML（可見字元需 ≥ 300，第一段 &lt;p&gt; 必須含焦點關鍵字） */
  shortDescriptionHtml: string;
  /** 從 categoryOptions 擇一（葉節點名稱） */
  category: string;
  /** 圖片 alt 文字基底 */
  imageAlt: string;
}

/** 完整草稿 */
export interface Draft {
  sourceUrl: string;
  brand: string;
  scraped: RstaichiProduct;
  season: SeasonInfo | null;
  /** 可選分類名稱（給 Claude 挑 content.category 用） */
  categoryOptions: string[];
  /** 由 Claude 填寫 */
  content: ListingContent;
}

export const DRAFTS_DIR = path.resolve(
  import.meta.dirname,
  '..',
  'drafts',
);

export function draftPath(sku: string): string {
  return path.join(DRAFTS_DIR, `${sku}.json`);
}

export function saveDraft(draft: Draft): string {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const p = draftPath(draft.scraped.sku);
  fs.writeFileSync(p, JSON.stringify(draft, null, 2), 'utf8');
  return p;
}

export function loadDraft(file: string): Draft {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw) as Draft;
}

/** 空白文案模板 */
export function emptyContent(): ListingContent {
  return {
    name: '',
    slug: '',
    focusKeyword: '',
    seoTitle: '',
    metaDescription: '',
    descriptionHtml: '',
    shortDescriptionHtml: '',
    category: '',
    imageAlt: '',
  };
}
