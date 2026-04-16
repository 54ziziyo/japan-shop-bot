// server/utils/exchangeRate.ts
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { MIN_JPY_RATE } from '#shared/pricing';

const CACHE_KEY = 'jpy_sell_rate';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小時
const FALLBACK_RATE = 0.205; // 玉山掛掉時的備用值

/**
 * 從玉山銀行網站抓取 JPY 現金匯率 → 銀行賣出
 * 頁面 HTML 中 JPY 區塊依序為: 即期買入, 即期賣出, 現金買入, 現金賣出
 */
async function fetchRateFromEsun(): Promise<number> {
  const res = await axios.get(
    'https://www.esunbank.com/zh-tw/personal/deposit/rate/forex/foreign-exchange-rates',
    {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    },
  );

  const html: string = res.data;

  // 找到 JPY 所在的 <tr> 區塊
  const jpyIdx = html.indexOf('JPY currency');
  if (jpyIdx === -1) throw new Error('玉山匯率頁面找不到 JPY 區塊');

  // 取 JPY 後面 4000 字元，足以涵蓋所有匯率數字
  const chunk = html.substring(jpyIdx, jpyIdx + 4000);

  // 匹配所有形如 0.xxxx 的匯率數字
  const rates = chunk.match(/\d+\.\d{3,4}/g);
  if (!rates || rates.length < 4) {
    throw new Error(`玉山匯率解析失敗：僅找到 ${rates?.length ?? 0} 個數字`);
  }

  // rates 順序: [即期買入, 即期賣出, 現金買入, 現金賣出]
  const cashSellRate = parseFloat(rates[3]!);
  if (isNaN(cashSellRate) || cashSellRate <= 0) {
    throw new Error(`玉山匯率數值無效：${rates[3]}`);
  }

  return cashSellRate;
}

export async function getJpyRate(config: {
  supabaseUrl: string;
  supabaseKey: string;
  forceRefresh?: boolean;
}): Promise<number> {
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  // 1. 先讀快取（forceRefresh 時跳過）
  if (!config.forceRefresh) {
    try {
      const { data } = await supabase
        .from('exchange_rates')
        .select('rate, updated_at')
        .eq('currency', CACHE_KEY)
        .single();

      if (data) {
        const age = Date.now() - new Date(data.updated_at).getTime();
        if (age < CACHE_TTL_MS) {
          console.log(`💱 匯率快取命中：${data.rate}`);
          return data.rate;
        }
      }
    } catch (e) {
      console.warn('⚠️ 快取讀取失敗，嘗試即時爬取');
    }
  }

  // 2. 快取過期，去玉山銀行抓新的
  try {
    const freshRate = await fetchRateFromEsun();
    console.log(`💱 玉山即時匯率（現金賣出）：${freshRate}`);

    // 強制最低匯率下限
    const safeRate = Math.max(freshRate, MIN_JPY_RATE);

    const { error } = await supabase.from('exchange_rates').upsert(
      {
        currency: CACHE_KEY,
        rate: safeRate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'currency' },
    );

    if (error) {
      console.error('❌ 資料庫更新失敗 (請檢查 RLS Policy):', error.message);
    }

    return safeRate;
  } catch (err: any) {
    console.error('❌ 玉山匯率爬取失敗:', err.message);
  }

  // 3. 爬蟲失敗：嘗試從資料庫撈出最近一次成功的舊紀錄（不論多久前）
  try {
    const { data, error: fetchError } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('currency', CACHE_KEY)
      .single();

    if (data?.rate) {
      console.warn(`⚠️ 爬蟲失敗，暫時沿用資料庫舊紀錄：${data.rate}`);
      return data.rate;
    }
  } catch (err) {
    // 如果資料庫也沒資料，才進到第 4 步
  }

  // 4. 最後手段：用寫死的值
  console.warn(`⚠️ 使用預設匯率：${FALLBACK_RATE}`);

  // 建議：即使玉山掛掉，也把 FALLBACK_RATE 寫回資料庫，確保 Table 永遠有這行 Row
  await supabase.from('exchange_rates').upsert(
    {
      currency: CACHE_KEY,
      rate: FALLBACK_RATE,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'currency' },
  );

  return FALLBACK_RATE;
}
