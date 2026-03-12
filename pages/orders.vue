<script setup lang="ts">
import { ref, onMounted } from 'vue';

const config = useRuntimeConfig();

const BANK_NAME = '玉山銀行';
const BANK_CODE = '808';
const BANK_ACCOUNT = '0624940150560';

// ── State ──
const loading = ref(true);
const orders = ref<any[]>([]);
const editingAddressId = ref<string | null>(null);
const editAddress = ref('');
const currentUserId = ref('');
let liff: any = null;
let supabaseClient: any = null;

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
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${mo}/${day} ${h}:${min}`;
}

// ── Address editing ──
function canEditAddress(status: string) {
  return ['pending', 'confirmed'].includes(status);
}

function startEdit(order: any) {
  editingAddressId.value = order.id;
  editAddress.value = order.address || '';
}

function cancelEdit() {
  editingAddressId.value = null;
  editAddress.value = '';
}

async function saveAddress(order: any) {
  const newAddr = editAddress.value.trim();
  if (!newAddr) return;
  try {
    const res = await fetch('/api/update-order-address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        address: newAddr,
        userId: currentUserId.value,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.statusMessage || '更新失敗');
      return;
    }
    order.address = newAddr;
    cancelEdit();
  } catch (e: any) {
    alert('更新失敗：' + e.message);
  }
}

// ── Bank transfer copy ──
async function copyBankInfo(order: any) {
  const total = Number(order.grand_total_twd) || 0;
  const text = `【匯款資訊】${BANK_NAME}(${BANK_CODE}) ${BANK_ACCOUNT} 總額$${total.toLocaleString()}元
`;
  try {
    await navigator.clipboard.writeText(text);
    alert('已複製匯款資訊！');
  } catch {
    alert(text);
  }
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
  supabaseClient = supabase;

  try {
    await liff.init({
      liffId: config.public.liffIdOrders,
    });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    const userId = profile.userId;
    currentUserId.value = userId;

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

<template>
  <ClientOnly>
    <div class="min-h-screen bg-[#F9F9F9] text-[#1A1A1A] font-sans antialiased">
      <!-- ── Navbar ── -->
      <nav
        class="sticky top-0 z-30 bg-[#F9F9F9]/80 backdrop-blur-md p-6 flex justify-between items-end"
      >
        <div>
          <div class="flex items-center gap-2 mb-2">
            <p
              class="text-[10px] font-black tracking-[0.3em] text-gray-400 uppercase leading-none"
            >
              🏠 囉姆嚕日貨代購
            </p>
          </div>
          <h1 class="text-3xl font-black italic tracking-tighter leading-none">
            訂單查詢
          </h1>
        </div>
        <button
          class="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors"
          @click="$router.push('/cart')"
        >
          前往購物車 →
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
          <button
              class="text-xs font-bold text-black-400 hover:text-gray-700 transition-colors underline underline-offset-2 decoration-2"
              @click="closeLiff()"
            >
              返回官方帳號
            </button>
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
              <!-- 地址列 -->
              <div class="flex items-center gap-1">
                <p class="text-xs text-gray-500 flex items-center gap-1">
                  <span>📍</span>
                  <template v-if="editingAddressId === order.id">
                    <input
                      v-model="editAddress"
                      type="text"
                      class="border border-gray-300 rounded-lg px-2 py-0.5 text-xs w-full mt-1 focus:outline-none focus:border-black"
                    />
                  </template>
                  <template v-else>{{ order.address }}</template>
                </p>
                <!-- 編輯 / 儲存 / 取消 -->
                <template v-if="canEditAddress(order.status)">
                  <template v-if="editingAddressId === order.id">
                    <button
                      class="text-green-600 p-0.5 shrink-0"
                      @click="saveAddress(order)"
                      title="儲存"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </button>
                    <button
                      class="text-gray-400 p-0.5 shrink-0 ml-0.5"
                      @click="cancelEdit"
                      title="取消"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </template>
                  <button
                    v-else
                    class="text-gray-400 hover:text-black p-0.5 shrink-0"
                    @click="startEdit(order)"
                    title="修改地址"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                      />
                    </svg>
                  </button>
                </template>
                <template
                  v-else-if="['processing', 'packing'].includes(order.status)"
                >
                  <span class="text-[9px] text-gray-400 shrink-0"
                    >🔒 已鎖定</span
                  >
                </template>
              </div>
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
                  &middot; 末五碼 {{ order.account_last5 }}</span
                >
              </p>
              <!-- 我要轉帳按鈕 -->
              <div
                v-if="
                  order.status === 'pending' &&
                  order.payment_method === 'bank_transfer'
                "
                class="pt-2"
              >
                <button
                  @click="copyBankInfo(order)"
                  class="w-full text-center text-xs font-black bg-black text-white rounded-xl py-2.5 active:opacity-70 transition-opacity"
                >
                  🏦 我要轉帳
                </button>
              </div>
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
