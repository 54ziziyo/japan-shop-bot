// server/utils/supabase.ts
// Supabase 客戶端單例（Singleton）
// Vercel 同一個容器在暖啟動期間可複用此實例，避免重複建立連線物件。
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * 取得共用的 Supabase 客戶端實例。
 * 只有第一次呼叫時才會執行 createClient；後續呼叫直接回傳已建立的實例。
 *
 * ⚠️ 只能在 Nitro server 環境（server/api、server/utils）中呼叫，
 *    不可用於前端（無 useRuntimeConfig）。
 */
export function useSupabase(): SupabaseClient {
  if (!_client) {
    const config = useRuntimeConfig();
    _client = createClient(
      config.public.supabaseUrl as string,
      config.public.supabaseKey as string,
    );
  }
  return _client;
}
