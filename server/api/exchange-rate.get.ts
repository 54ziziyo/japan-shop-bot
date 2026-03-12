// server/api/exchange-rate.get.ts
import { getJpyRate } from '../utils/exchangeRate';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  const rate = await getJpyRate({
    supabaseUrl: config.public.supabaseUrl,
    supabaseKey: config.public.supabaseKey,
  });

  return { rate, currency: 'JPY', timestamp: new Date().toISOString() };
});
