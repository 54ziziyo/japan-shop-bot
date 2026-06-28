// ============================================================
// HYOD 專用草稿型別（與 draft.ts 分開，避免改動 RS TAICHI 流程）
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import type { HyodProduct } from '../../server/utils/scrape/hyod';
import type { ListingContent } from './draft';
import type { SeasonInfo } from './season';
import { DRAFTS_DIR, emptyContent } from './draft';

export interface HyodDraft {
  sourceUrl: string;
  brand: 'HYOD';
  scraped: HyodProduct;
  season: SeasonInfo | null;
  categoryOptions: string[];
  content: ListingContent;
}

export function saveDraftH(draft: HyodDraft): string {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const p = path.join(DRAFTS_DIR, `${draft.scraped.pid}.json`);
  fs.writeFileSync(p, JSON.stringify(draft, null, 2), 'utf8');
  return p;
}

export function loadDraftH(file: string): HyodDraft {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as HyodDraft;
}

export { emptyContent };
