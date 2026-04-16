// composables/useExchangeRate.ts
import { JPY_SELL_RATE, MIN_JPY_RATE } from '#shared/pricing';

const STORAGE_KEY = 'romu_jpy_rate';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小時改一次匯率

interface RateCache {
  rate: number;
  ts: number;
}

export function useExchangeRate() {
  const rate = ref<number>(JPY_SELL_RATE);
  const loading = ref(false);

  const fetchRate = async (opts?: { skipCache?: boolean }) => {
    // 1. 先讀 localStorage 快取（skipCache 時跳過）
    if (!opts?.skipCache) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const cache: RateCache = JSON.parse(raw);
          if (Date.now() - cache.ts < CACHE_TTL_MS) {
            rate.value = cache.rate;
            return;
          }
        }
      } catch {}
    }

    // 2. 呼叫 server API
    loading.value = true;
    try {
      const data = await $fetch<{ rate: number }>('/api/exchange-rate');
      if (data?.rate && data.rate > 0) {
        rate.value = Math.max(data.rate, MIN_JPY_RATE);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ rate: data.rate, ts: Date.now() }),
        );
      }
    } catch {
      console.warn('⚠️ 匯率取得失敗，使用預設值', JPY_SELL_RATE);
      rate.value = JPY_SELL_RATE;
    } finally {
      loading.value = false;
    }
  };

  return { rate, loading, fetchRate };
}
