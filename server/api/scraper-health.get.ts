// server/api/scraper-health.get.ts
// Vercel Cron Job：每日檢查所有品牌爬蟲是否正常運作
// 若有任一品牌失敗，寄送 Email 通知管理員

import nodemailer from 'nodemailer';
import { scrapeUniqlo } from '../utils/scrape/uniqlo';
import { scrapeGu } from '../utils/scrape/gu';
import { scrapeRstaichi } from '../utils/scrape/rstaichi';
import { scrapeKushitani } from '../utils/scrape/kushitani';
import { scrapeFr2 } from '../utils/scrape/fr2';
import { scrapeBape } from '../utils/scrape/bape';
import { scrapeAape } from '../utils/scrape/aape';

/** 每個品牌的測試商品 URL（選用長期穩定的基本款商品） */
const TEST_URLS: Record<
  string,
  { url: string; scraper: (url: string) => Promise<unknown> }
> = {
  uniqlo: {
    url: 'https://www.uniqlo.com/jp/ja/products/E482148-000/00?colorDisplayCode=11&sizeDisplayCode=004',
    scraper: scrapeUniqlo,
  },
  gu: {
    url: 'https://www.gu-global.com/jp/ja/products/E359749-000/00?colorDisplayCode=01&sizeDisplayCode=999',
    scraper: scrapeGu,
  },
  rstaichi: {
    url: 'https://www.ec.rs-taichi.com/rss014.html',
    scraper: scrapeRstaichi,
  },
  kushitani: {
    url: 'https://www.kushitani.co.jp/products/kg11c.html',
    scraper: scrapeKushitani,
  },
  fr2: {
    url: 'https://fr2.tokyo/products/1080000003294',
    scraper: scrapeFr2,
  },
  bape: {
    url: 'https://jp.bape.com/products/1k70-291-329?_pos=5&_sid=de1a546fb&_ss=r',
    scraper: scrapeBape,
  },
  bapepirate: {
    url: 'https://bapepirate.com/collections/all/products/4l20184001',
    scraper: scrapeBape,
  },
  aape: {
    url: 'https://aape.jp/category/GT119/98340709.html?condition=GENDER:G2',
    scraper: scrapeAape,
  },
};

interface BrandResult {
  brand: string;
  ok: boolean;
  title?: string;
  durationMs: number;
  error?: string;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  // ── 認證 ──
  const authHeader = getHeader(event, 'authorization') ?? '';
  const querySecret = getQuery(event).secret as string | undefined;
  const cronSecret = config.cronSecret;

  const authorized =
    cronSecret &&
    (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);

  if (!authorized) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  // ── 並行測試所有品牌 ──
  const results: BrandResult[] = await Promise.all(
    Object.entries(TEST_URLS).map(async ([brand, { url, scraper }]) => {
      const start = Date.now();
      try {
        const product = await scraper(url);
        const durationMs = Date.now() - start;
        if (!product) {
          return { brand, ok: false, durationMs, error: 'scraper 回傳 null' };
        }
        const title = (product as Record<string, unknown>).title as
          | string
          | undefined;
        return { brand, ok: true, title, durationMs };
      } catch (err) {
        return {
          brand,
          ok: false,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const failed = results.filter((r) => !r.ok);

  // ── 如有失敗，寄送通知 Email ──
  if (
    failed.length > 0 &&
    config.mailUser &&
    config.mailPass &&
    config.adminEmail
  ) {
    const failLines = failed
      .map((f) => `❌ ${f.brand}：${f.error}（${f.durationMs}ms）`)
      .join('\n');
    const okLines = results
      .filter((r) => r.ok)
      .map((r) => `✅ ${r.brand}：${r.title}（${r.durationMs}ms）`)
      .join('\n');

    const body = `爬蟲健康檢查報告\n${'─'.repeat(30)}\n\n失敗項目：\n${failLines}\n\n正常項目：\n${okLines || '（無）'}`;

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.mailUser, pass: config.mailPass },
      });
      await transporter.sendMail({
        from: config.mailUser,
        to: config.adminEmail,
        subject: `⚠️ 爬蟲異常警報（${failed.length} 個品牌失敗）`,
        text: body,
      });
      console.log('📧 已寄送爬蟲異常通知');
    } catch (mailErr) {
      console.error('📧 寄送失敗:', mailErr);
    }
  }

  // ── 回傳結果 ──
  console.log(
    `🩺 爬蟲健康檢查完成：${results.filter((r) => r.ok).length}/${results.length} 正常`,
  );

  return {
    ok: failed.length === 0,
    timestamp: new Date().toISOString(),
    results,
  };
});
