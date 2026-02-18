<template>
  <ClientOnly>
    <div class="min-h-screen bg-[#F9F9F9] text-[#1A1A1A] font-sans antialiased">
      <nav
        class="sticky top-0 z-30 bg-[#F9F9F9]/80 backdrop-blur-md px-6 py-8 flex justify-between items-end"
      >
        <div>
          <p
            class="text-[10px] font-black tracking-[0.3em] text-gray-400 uppercase leading-none mb-2"
          >
            Selected Items
          </p>
          <h1 class="text-3xl font-black italic tracking-tighter leading-none">
            ROML CART
          </h1>
        </div>
        <div v-if="!loading" class="text-right">
          <p
            class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 text-gray-400"
          >
            Total Items
          </p>
          <p class="font-black text-xl leading-none">{{ items.length }}</p>
        </div>
      </nav>

      <div class="max-w-md mx-auto px-6 pb-48">
        <div
          v-if="loading"
          class="flex flex-col items-center justify-center py-32"
        >
          <div
            class="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-4"
          ></div>
          <p
            class="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase"
          >
            Synchronizing
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
              <h2
                class="font-bold text-sm uppercase tracking-tight truncate leading-tight mb-1"
              >
                {{ item.product_title }}
              </h2>
              <p
                class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2"
              >
                {{ item.color }} <span class="mx-1 text-gray-200">|</span>
                {{ item.size }}
              </p>
              <p class="font-black text-lg tracking-tighter">
                {{ item.price }}
              </p>
            </div>

            <button
              @click="removeItem(item.id)"
              class="p-2 text-gray-200 hover:text-red-500 transition-colors"
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
        </div>

        <div
          v-else
          class="flex flex-col items-center justify-center py-32 text-center"
        >
          <p
            class="text-[11px] font-bold text-gray-300 uppercase tracking-[0.3em] mb-6 italic"
          >
            Collection is empty
          </p>
          <button
            @click="closeLiff"
            class="text-[10px] font-black border-b-[3px] border-black pb-1 uppercase tracking-widest active:opacity-50 transition-opacity"
          >
            Return to Shop
          </button>
        </div>
      </div>

      <footer
        v-if="items.length > 0"
        class="fixed bottom-0 left-0 right-0 z-40 px-6 pb-10 pt-4"
      >
        <div
          class="max-w-md mx-auto bg-white/90 backdrop-blur-2xl px-8 py-8 rounded-[32px] shadow-[0_-15px_40px_rgba(0,0,0,0.03)] border border-white/50"
        >
          <div class="flex justify-between items-end mb-8">
            <div>
              <p
                class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 leading-none"
              >
                Subtotal
              </p>
              <p
                class="text-[9px] text-gray-300 font-bold uppercase tracking-tighter italic"
              >
                Estimated JPY Total
              </p>
            </div>
            <div class="text-right">
              <p
                class="text-3xl font-black tracking-tighter italic leading-none"
              >
                ¥ {{ totalAmount.toLocaleString() }}
              </p>
            </div>
          </div>

          <button
            @click="handleCheckout"
            class="w-full bg-black text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.97] transition-all"
          >
            Request Formal Quote
          </button>
        </div>
      </footer>
    </div>
  </ClientOnly>
</template>

<script setup>
import liff from '@line/liff';
import { createClient } from '@supabase/supabase-js';

const config = useRuntimeConfig();
const items = ref([]);
const loading = ref(true);
const userId = ref(null);
let supabase = null;

// 自動加總邏輯
const totalAmount = computed(() => {
  return items.value.reduce((sum, item) => {
    // 移除 ¥ 與逗號
    const priceValue = parseInt(item.price.replace(/[^\d]/g, '')) || 0;
    return sum + priceValue;
  }, 0);
});

const initSupabase = () => {
  supabase = createClient(config.public.supabaseUrl, config.public.supabaseKey);
};

const fetchCart = async () => {
  if (!userId.value) return;
  const { data, error } = await supabase
    .from('cart_items')
    .select('*')
    .eq('user_id', userId.value)
    .order('created_at', { ascending: false });

  if (!error) items.value = data;
};

const removeItem = async (id) => {
  if (!confirm('Confirm removal?')) return;
  const { error } = await supabase.from('cart_items').delete().eq('id', id);
  if (!error) items.value = items.value.filter((item) => item.id !== id);
};

const handleCheckout = async () => {
  const message = `🙋‍♂️ 我已挑選完畢！\n目前共有 ${items.value.length} 件商品，預估總額 ¥${totalAmount.value.toLocaleString()}。\n請幫我確認庫存與報價。`;
  try {
    await liff.sendMessages([{ type: 'text', text: message }]);
    liff.closeWindow();
  } catch (err) {
    alert('Please checkout within LINE.');
  }
};

const closeLiff = () => liff.closeWindow();

onMounted(async () => {
  initSupabase();
  try {
    await liff.init({ liffId: process.env.LIFF_ID });
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
</script>

<style>
::-webkit-scrollbar {
  display: none;
}
body {
  -webkit-tap-highlight-color: transparent;
}
</style>
