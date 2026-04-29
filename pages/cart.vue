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
    const twd = parsePriceTwd(item.price, jpyRate.value);
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
  if (items.value.length === 0 || syncing.value) return;

  syncing.value = true;
  try {
    // 🔄 結帳前同步檢查庫存與價格
    const checkItems = items.value.map((item) => ({
      product_code: item.product_code,
      color: item.color,
      size: item.size,
      price: item.price,
      product_url: item.product_url || '',
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

  // 不重置 syncing，讓按鈕保持 disabled 直到頁面跳轉完成
  await navigateTo('/checkout');
};

const closeLiff = () => liff.closeWindow();

onMounted(async () => {
  // ✅ 動態 import：確保只在瀏覽器執行，不會在 SSR 階段被解析
  const [liffModule] = await Promise.all([
    import('@line/liff'),
    initSupabase(),
    fetchRate({ skipCache: true }),
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
    <div class="flex flex-col bg-[#FDFCF8] text-[#4A5D59] font-sans">
      <AppNavbar title="購物清單">
        <template #subtitle>
          <div class="flex items-center gap-2 mb-2 h-6">
            <span
              class="px-2 py-0.5 bg-[#749D8E]/10 text-[#749D8E] text-[9px] font-black rounded-full tracking-widest uppercase"
            >
              ROMU JP
            </span>
          </div>
        </template>
        <template #right>
          <div v-if="!loading" class="text-right">
            <p
              class="text-[10px] font-bold text-[#A4B8B0] uppercase tracking-widest mb-1"
            >
              Total Qty
            </p>
            <div
              class="inline-flex items-center justify-center bg-[#749D8E] text-white w-8 h-8 rounded-full shadow-lg shadow-[#749D8E]/20 font-black text-sm"
            >
              {{ totalQty }}
            </div>
          </div>
        </template>
      </AppNavbar>

      <main class="flex-1">
        <div class="max-w-md mx-auto px-6 pb-6">
          <div
            v-if="!loading && items.length > 0"
            class="bg-[#E8F0E9] border border-[#D1E2D5] rounded-3xl px-5 py-3 mb-8 mt-6"
          >
            <p
              class="text-[11px] text-[#5A746B] font-medium leading-relaxed flex items-center gap-2"
            >
              <span class="text-base">🍃</span> 為確保同步，購物車將於 6
              小時後清空喔！
            </p>
          </div>

          <AppLoading v-if="loading" />

          <div v-else-if="items.length > 0" class="space-y-10 mt-6">
            <div
              v-for="item in items"
              :key="item.id"
              class="group relative flex gap-5 items-center"
            >
              <div
                class="w-24 h-24 bg-white rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(116,157,142,0.12)] flex-shrink-0 border border-[#F0F4F1]"
              >
                <img :src="item.image_url" referrerpolicy="no-referrer" class="w-full h-full object-cover" />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start mb-1">
                  <h2
                    class="font-bold text-sm tracking-tight truncate text-[#4A5D59]"
                  >
                    {{ item.product_title }}
                  </h2>
                  <button
                    @click="removeItem(item.id)"
                    class="p-1 text-[#D1E2D5] hover:text-red-400 transition-colors"
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
                  class="text-[9px] font-mono text-[#749D8E]/60 tracking-wide mb-1"
                >
                  {{ item.product_code }}
                </p>

                <p
                  class="text-[10px] font-bold text-[#749D8E]/60 mb-2 uppercase tracking-wide"
                >
                  {{ item.color }} <span class="mx-1 opacity-30">/</span>
                  {{ item.size }}
                </p>

                <div class="flex items-center justify-between">
                  <p class="font-black text-xl tracking-tighter text-[#5A746B]">
                    <span class="text-xs mr-0.5">NT$</span
                    >{{ parsePriceTwd(item.price, jpyRate).toLocaleString() }}
                  </p>

                  <div
                    class="flex items-center bg-[#F4F9F5] rounded-xl p-1 shadow-inner border border-[#E8F0E9]"
                  >
                    <button
                      @click="decreaseQty(item)"
                      class="w-6 h-6 flex items-center justify-center rounded-lg text-[#749D8E] hover:bg-white transition-all font-bold"
                    >
                      −
                    </button>
                    <span
                      class="w-8 text-center text-[11px] font-black text-[#5A746B]"
                      >{{ item.quantity || 1 }}</span
                    >
                    <button
                      @click="increaseQty(item)"
                      class="w-6 h-6 flex items-center justify-center rounded-lg bg-[#749D8E] text-white shadow-md shadow-[#749D8E]/30 font-bold"
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
              class="text-[11px] font-bold text-[#A4B8B0] uppercase tracking-[0.3em] mb-6 italic"
            >
              你的購物車空蕩蕩，快去逛逛吧！
            </p>
            <button
              @click="handleReload"
              class="text-[10px] text-[#5A746B] font-black border-b-[3px] border-[#749D8E] pb-1 uppercase tracking-widest active:opacity-50 transition-opacity"
            >
              🔄 點擊我重整
            </button>
          </div>
        </div>
      </main>

      <AppBottomBar
        v-if="items.length > 0"
        label="預估總額"
        sublabel="不包含運費與其他費用"
        :amount="totalAmount"
        :button-text="syncing ? '加載中...' : '下一步'"
        :disabled="syncing"
        @submit="handleCheckout"
      />
    </div>
  </ClientOnly>
</template>
