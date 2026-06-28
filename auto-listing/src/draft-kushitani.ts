// ============================================================
// Kushitani 專用草稿型別（與 draft.ts 分開，避免改動 RS TAICHI 流程）
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import type { KushitaniProduct } from '../../server/utils/scrape/kushitani';
import type { ListingContent } from './draft';
import type { SeasonInfo } from './season';
import { DRAFTS_DIR, emptyContent } from './draft';

export interface KushitaniDraft {
  sourceUrl: string;
  brand: 'KUSHITANI';
  scraped: KushitaniProduct;
  season: SeasonInfo | null;
  categoryOptions: string[];
  content: ListingContent;
}

/** 以 modelNumber（K-XXXX）為 SKU 決定草稿路徑 */
export function draftPathK(modelNumber: string): string {
  return path.join(DRAFTS_DIR, `${modelNumber}.json`);
}

export function saveDraftK(draft: KushitaniDraft): string {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const sku = draft.scraped.modelNumber || draft.scraped.pid;
  const p = path.join(DRAFTS_DIR, `${sku}.json`);
  fs.writeFileSync(p, JSON.stringify(draft, null, 2), 'utf8');
  return p;
}

export function loadDraftK(file: string): KushitaniDraft {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as KushitaniDraft;
}

export { emptyContent };
