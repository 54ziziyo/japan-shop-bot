<template>
  <ClientOnly>
    <div class="min-h-screen bg-[#F9F9F9] text-[#1A1A1A] font-sans antialiased">
      <!-- ── Navbar ── -->
      <nav
        class="sticky top-0 z-30 bg-[#F9F9F9]/80 backdrop-blur-md p-6 flex justify-between items-end"
      >
        <div>
          <p
            class="text-[10px] font-black tracking-[0.3em] text-gray-400 uppercase leading-none mb-2"
          >
            訂單查詢
          </p>
          <h1 class="text-3xl font-black italic tracking-tighter leading-none">
            MY ORDERS
          </h1>
        </div>
        <button
          class="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors"
          @click="closeLiff"
        >
          ✕ 關閉
        </button>
      </nav>

      <div class="max-w-md mx-auto px-6 pb-24">
        <!-- ── 載入中 ── -->
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
            Loading
          </p>
        </div>

        <!-- ── 無訂單 ── -->
        <div v-else-if="orders.length === 0" class="text-center py-32">
          <p class="text-2xl font-black mb-3">目前無進行中訂單</p>
          <p class="text-sm text-gray-400 leading-relaxed">
            尚無進行中的訂單記錄<br />
            已完成的歷史訂單暫不顯示
          </p>
        </div>

        <!-- ── 訂單卡片列表 ── -->
        <div v-else class="space-y-6 mt-4">
          <div
            v-for="order in orders"
            :key="order.id"
            class="bg-white rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100"
          >
            <!-- 狀態標頭 -->
            <div class="px-5 py-4 flex justify-between items-center">
              <div>
                <p
                  class="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1"
                >
                  {{ formatDate(order.created_at) }}
                </p>
                <p class="font-black text-lg leading-tight">
                  {{ statusLabel(order.status) }}
                </p>
              </div>
              <span
                class="text-xs font-black px-3 py-1.5 rounded-full"
                :class="statusBadgeClass(order.status)"
              >
                {{ statusEmoji(order.status) }}
              </span>
            </div>

            <!-- 收件人資訊 -->
            <div class="px-5 pb-3 border-b border-gray-100 space-y-1">
              <p class="text-xs text-gray-500">
                <span class="font-bold text-gray-800">{{
                  order.customer_name
                }}</span>
                &nbsp;&nbsp;{{ order.phone }}
              </p>
              <p class="text-xs text-gray-500">📍 {{ order.address }}</p>
              <p class="text-xs text-gray-500">
                💳
                {{
                  order.payment_method === 'bank_transfer'
                    ? '銀行轉帳'
                    : '綠界付款'
                }}
                <span
                  v-if="
                    order.payment_method === 'bank_transfer' &&
                    order.account_last5
                  "
                >
                  · 末五碼 {{ order.account_last5 }}</span
                >
              </p>
            </div>

            <!-- 商品列表 -->
            <div class="px-5 py-4 space-y-4">
              <div
                v-for="(item, i) in order.items"
                :key="i"
                class="flex gap-3 items-start"
              >
                <!-- 商品圖片 -->
                <div
                  class="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100"
                >
                  <img
                    v-if="item.image_url"
                    :src="item.image_url"
                    :alt="item.product_title"
                    class="w-full h-full object-cover"
                  />
                </div>
                <!-- 商品資訊 -->
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-bold leading-snug line-clamp-2">
                    {{ item.product_title }}
                  </p>
                  <p class="text-[11px] text-gray-400 mt-0.5">
                    {{ item.color }} / {{ item.size }}
                  </p>
                  <p class="text-[11px] text-gray-400 mt-0.5">
                    × {{ item.quantity }} 件
                  </p>
                </div>
                <!-- 價格 -->
                <div class="text-right flex-shrink-0">
                  <p class="text-sm font-black">
                    NT${{ (item.priceTwd || 0).toLocaleString() }}
                  </p>
                  <p class="text-[11px] text-gray-400">
                    ¥{{ item.price || '' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- 訂單總計 -->
            <div
              v-if="order.grand_total_twd"
              class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center"
            >
              <p
                class="text-[10px] text-gray-400 font-black uppercase tracking-widest"
              >
                訂單總計
              </p>
              <p class="font-black text-xl">
                NT${{ Number(order.grand_total_twd).toLocaleString() }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const config = useRuntimeConfig();

// ── State ──
const loading = ref(true);
const orders = ref<any[]>([]);
let liff: any = null;

// ── Status helpers ──
const STATUS_LABELS: Record<string, string> = {
  pending: '待付款確認中',
  confirmed: '商品處理中',
  processing: '商品打包中',
  packing: '商品已完成',
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function statusEmoji(status: string) {
  const map: Record<string, string> = {
    pending: '⏳',
    confirmed: '✅',
    processing: '📦',
    packing: '🎌',
  };
  return map[status] ?? '•';
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-blue-100 text-blue-700',
    processing: 'bg-purple-100 text-purple-700',
    packing: 'bg-green-100 text-green-700',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ── Lifecycle ──
onMounted(async () => {
  const [liffModule, { createClient }] = await Promise.all([
    import('@line/liff'),
    import('@supabase/supabase-js'),
  ]);
  liff = liffModule.default;
  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabaseKey,
  );

  try {
    await liff.init({
      liffId: config.public.liffIdOrders || config.public.liffId,
    });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    const userId = profile.userId;

    // 查詢進行中訂單（排除已完成）
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ 查詢訂單失敗:', error.message);
    } else {
      orders.value = data || [];
    }
  } catch (err: any) {
    console.error('❌ LIFF 初始化失敗:', err.message);
  } finally {
    loading.value = false;
  }
});

function closeLiff() {
  try {
    liff?.closeWindow();
  } catch {
    window.history.back();
  }
}
</script>
