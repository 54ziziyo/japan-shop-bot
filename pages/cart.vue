<script setup>
// ⚠️ 靜態 import 已全部移除：@supabase/supabase-js 與 @line/liff 都含有瀏覽器專用程式碼
// 若在頂層靜態 import，Nuxt SSR 會在 server 端解析它們導致 useNuxtApp() 崩潰
// 解法：全部改為 onMounted 內動態 import，確保只在瀏覽器執行

const config = useRuntimeConfig();
const items = ref([]);
const loading = ref(true);
const syncing = ref(false);
const userId = ref(null);
let supabase = null;
let liff = null;
const { rate: jpyRate, fetchRate } = useExchangeRate(); // 動態匯率

// 自動加總邏輯（台幣）
const totalAmount = computed(() => {
  return items.value.reduce((sum, item) => {
    const jpy = parseJpy(item.price);
    const twd = jpyToTwd(jpy, jpyRate.value);
    const qty = item.quantity || 1;
    return sum + twd * qty;
  }, 0);
});

const totalQty = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.quantity || 1), 0);
});

const initSupabase = async () => {
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(config.public.supabaseUrl, config.public.supabaseKey);
};

const fetchCart = async () => {
  if (!userId.value) return;

  // 🧹 自動清除 6 小時前的購物車項目
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId.value)
    .lt('created_at', sixHoursAgo);

  const { data, error } = await supabase
    .from('cart_items')
    .select('*')
    .eq('user_id', userId.value)
    .order('created_at', { ascending: false });

  if (!error) items.value = data;
};

// 🗑️ 刪除商品
const removeItem = async (id) => {
  // 💡 確保 id 有傳進來
  if (!id) {
    console.error('❌ 錯誤：找不到商品 ID');
    return;
  }

  if (!confirm('確定要刪除這項商品嗎？')) return;

  // 💡 關鍵修正：確保解構出真正的 error 物件
  const { error: deleteError } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', id);

  if (!deleteError) {
    // ✅ 成功：更新前端畫面
    items.value = items.value.filter((item) => item.id !== id);
  } else {
    // ❌ 失敗：印出真正的原因，不要只顯示「檢查網路」
    console.error('Supabase 刪除失敗原因:', deleteError.message);
    alert(`刪除失敗：${deleteError.message}`);
  }
};

// ➕ 增加數量
const increaseQty = async (item) => {
  const oldQty = item.quantity || 1;
  const newQty = oldQty + 1;

  // 💡 先改 UI，讓客人感覺很快
  item.quantity = newQty;

  const { error } = await supabase
    .from('cart_items')
    .update({ quantity: newQty })
    .eq('id', item.id); // 💡 確保這裡的 id 是資料庫的 primary key

  if (error) {
    console.error('Update error:', error);
    item.quantity = oldQty; // 失敗時回滾
    alert(`同步失敗：${error.message}`);
  }
};

// ➖ 減少數量
const decreaseQty = async (item) => {
  const oldQty = item.quantity || 1;
  if (oldQty <= 1) {
    await removeItem(item.id);
    return;
  }

  const newQty = oldQty - 1;
  item.quantity = newQty;

  const { error } = await supabase
    .from('cart_items')
    .update({ quantity: newQty })
    .eq('id', item.id);

  if (error) {
    item.quantity = oldQty;
    alert('同步失敗');
  }
};

const handleCheckout = async () => {
  if (items.value.length === 0) return;

  syncing.value = true;
  try {
    // 🔄 結帳前同步檢查庫存與價格
    const checkItems = items.value.map((item) => ({
      product_code: item.product_code,
      color: item.color,
      size: item.size,
      price: item.price,
    }));

    const res = await fetch('/api/sync-cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: checkItems }),
    });
    const syncData = await res.json();
    sessionStorage.setItem('checkout_sync', JSON.stringify(syncData));
  } catch (err) {
    console.error('Sync error:', err);
    sessionStorage.setItem(
      'checkout_sync',
      JSON.stringify({ results: [], hasChanges: false, syncFailed: true }),
    );
  }

  syncing.value = false;
  await navigateTo('/checkout');
};

const closeLiff = () => liff.closeWindow();

onMounted(async () => {
  // ✅ 動態 import：確保只在瀏覽器執行，不會在 SSR 階段被解析
  const [liffModule] = await Promise.all([
    import('@line/liff'),
    initSupabase(),
    fetchRate(),
  ]);
  liff = liffModule.default;

  try {
    await liff.init({ liffId: config.public.liffIdCart });
    if (!liff.isLoggedIn()) {
      liff.login();
    } else {
      const profile = await liff.getProfile();
      userId.value = profile.userId;
      await fetchCart();
    }
  } catch (err) {
    console.error('LIFF Init Error:', err);
  } finally {
    loading.value = false;
  }
});

const handleReload = () => {
  window.location.reload();
};
</script>

<template>
  <ClientOnly>
    <div class="min-h-screen bg-[#F9F9F9] text-[#1A1A1A] font-sans antialiased">
      <nav
        class="sticky top-0 z-30 bg-[#F9F9F9]/80 backdrop-blur-md p-6 flex items-end justify-between"
      >
        <div>
          <div class="flex items-center gap-2 mb-2 h-6">
            <p
              class="text-[10px] font-black tracking-[0.3em] text-gray-400 uppercase leading-none"
            >
              🏠 囉姆嚕日貨代購
            </p>
          </div>
          <h1 class="text-3xl font-black tracking-[0.1em] leading-none">
            購物清單
          </h1>
        </div>
        <div v-if="!loading" class="text-right">
          <p
            class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 text-gray-400"
          >
            總共數量
          </p>
          <p class="font-black text-xl leading-none">{{ totalQty }}</p>
        </div>
      </nav>

      <div class="max-w-md mx-auto px-6 pb-60">
        <div
          v-if="!loading && items.length > 0"
          class="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4"
        >
          <p class="text-[10px] text-amber-700 font-semibold leading-relaxed">
            🕒 為確保價格與日本官網同步，購物車將於每 6 小時自動清空。<br />請抓緊時間下單喔！
          </p>
        </div>

        <div
          v-if="loading"
          class="flex flex-col items-center justify-center py-32"
        >
          <div
            class="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-4"
          ></div>
          <p
            class="text-[10px] font-bold text-center tracking-[0.2em] text-gray-400 uppercase"
          >
            稍等購物車抓資料唷！<br />跑跑跑，向前跑~
          </p>
        </div>

        <div v-else-if="items.length > 0" class="space-y-8 mt-4">
          <div
            v-for="item in items"
            :key="item.id"
            class="group relative flex gap-5 items-center"
          >
            <div
              class="w-24 h-24 bg-white rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex-shrink-0 border border-gray-100"
            >
              <img
                :src="item.image_url"
                class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex justify-between items-start mb-0.5">
                <h2
                  class="font-bold text-sm uppercase tracking-tight truncate leading-tight"
                >
                  {{ item.product_title }}
                </h2>

                <button
                  @click="removeItem(item.id)"
                  class="p-1 -mt-1 -mr-1 text-gray-200 hover:text-red-500 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                    ></path>
                  </svg>
                </button>
              </div>

              <p
                v-if="item.product_code"
                class="text-[9px] font-mono text-gray-500 tracking-wide mb-1"
              >
                {{ item.product_code }}
              </p>

              <p
                class="text-[10px] font-semibold text-gray-800 uppercase tracking-wider mb-2"
              >
                {{ item.color }} <span class="mx-1 text-gray-200">|</span>
                {{ item.size }}
              </p>

              <div class="flex items-center justify-between">
                <p class="font-black text-lg tracking-tighter">
                  NT${{
                    jpyToTwd(parseJpy(item.price), jpyRate).toLocaleString()
                  }}
                </p>

                <div class="flex items-center gap-0 select-none">
                  <button
                    @click="decreaseQty(item)"
                    class="w-7 h-7 flex items-center justify-center rounded-l-lg border border-gray-200 bg-white text-gray-500 active:bg-gray-100 transition-colors text-sm font-bold"
                  >
                    −
                  </button>
                  <span
                    class="w-8 h-7 flex items-center justify-center border-t border-b border-gray-200 bg-white text-xs font-black"
                  >
                    {{ item.quantity || 1 }}
                  </span>
                  <button
                    @click="increaseQty(item)"
                    class="w-7 h-7 flex items-center justify-center rounded-r-lg border border-gray-200 bg-white text-gray-500 active:bg-gray-100 transition-colors text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else
          class="flex flex-col items-center justify-center py-32 text-center"
        >
          <p
            class="text-[11px] font-bold text-gray-300 uppercase tracking-[0.3em] mb-6 italic"
          >
            你的購物車空蕩蕩，快去逛逛吧！
          </p>
          <button
            @click="handleReload"
            class="text-[10px] font-black border-b-[3px] border-black pb-1 uppercase tracking-widest active:opacity-50 transition-opacity"
          >
            🔄 點擊我重整
          </button>
        </div>
      </div>

      <footer
        v-if="items.length > 0"
        class="fixed bottom-0 left-0 right-0 z-40 px-6 py-4"
      >
        <div
          class="max-w-md mx-auto bg-white/90 backdrop-blur-2xl p-6 rounded-[32px] shadow-xl border border-white/50"
        >
          <div class="flex justify-between items-end mb-4">
            <div>
              <p
                class="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1 leading-none"
              >
                商品總額：
              </p>
              <p
                class="text-[9px] text-gray-400 font-bold uppercase tracking-tighter italic"
              >
                ※ 不包含運費與其他費用
              </p>
            </div>
            <div class="text-right">
              <p
                class="text-3xl font-black tracking-tighter italic leading-none"
              >
                NT$ {{ totalAmount.toLocaleString() }}
              </p>
            </div>
          </div>

          <button
            @click="handleCheckout"
            :disabled="syncing"
            class="w-full bg-black text-white py-3 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {{ syncing ? 'Loading...' : '前往下單' }}
          </button>
        </div>
      </footer>
    </div>
  </ClientOnly>
</template>

<style>
::-webkit-scrollbar {
  display: none;
}
body {
  -webkit-tap-highlight-color: transparent;
}
</style>
