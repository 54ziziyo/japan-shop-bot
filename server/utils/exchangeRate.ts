// server/utils/exchangeRate.ts
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const CACHE_KEY = 'jpy_sell_rate';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小時
const FALLBACK_RATE = 0.205; // 台銀掛掉時的備用值

const BOT_API_URL = 'https://rate.bot.com.tw/xrt/flcsv/0/day';

async function fetchRateFromBot(): Promise<number> {
  const res = await axios.get('https://rate.bot.com.tw/xrt?Lang=zh-TW', {
    timeout: 8000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  const html: string = res.data;

  // 找日圓那行，抓現金賣出
  const match = html.match(
    /日圓[\s\S]*?<td[^>]*>([\d.]+)<\/td>[\s\S]*?<td[^>]*class="[^"]*sell[^"]*"[^>]*>([\d.]+)<\/td>/
  );

  // 用更簡單的方式：直接找 JPY 現金賣出的數字
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.includes('日圓')) {
      // 往後找接下來幾行裡的數字
      const block = lines.slice(i, i + 30).join(' ');
      const numbers = block.match(/[\d]{1}\.[\d]{4}/g);
      if (numbers && numbers.length >= 2) {
        // 第2個數字 = 現金賣出
        const rate = parseFloat(numbers[1]!);
        if (!isNaN(rate) && rate > 0) return rate;
      }
    }
  }

  throw new Error('無法解析台銀匯率');
}

export async function getJpyRate(config: {
  supabaseUrl: string;
  supabaseKey: string;
}): Promise<number> {
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  // 1. 先讀快取
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

  // 2. 快取過期，去台銀抓新的
  try {
    const freshRate = await fetchRateFromBot();
    console.log(`💱 台銀即時匯率：${freshRate}`);

    await supabase.from('exchange_rates').upsert(
      {
        currency: CACHE_KEY,
        rate: freshRate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'currency' },
    );

    return freshRate;
  } catch (err: any) {
    console.error('❌ 台銀匯率爬取失敗:', err.message);
  }

  // 3. 台銀失敗，用舊快取（不管多舊）
  try {
    const { data } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('currency', CACHE_KEY)
      .single();
    if (data?.rate) {
      console.warn(`⚠️ 使用舊快取匯率：${data.rate}`);
      return data.rate;
    }
  } catch {}

  // 4. 最後手段：用寫死的值
  console.warn(`⚠️ 使用預設匯率：${FALLBACK_RATE}`);
  return FALLBACK_RATE;
}
