<template>
  <ClientOnly>
    <div class="min-h-screen bg-[#F9F9F9] text-[#1A1A1A] font-sans antialiased">
      <!-- Navigation -->
      <nav
        class="sticky top-0 z-30 bg-[#F9F9F9]/80 backdrop-blur-md p-6 flex items-end justify-between"
      >
        <div>
          <div class="flex items-center gap-2 mb-2">
            <button
              @click="goBack"
              class="p-1 -ml-1 text-gray-400 hover:text-black transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M19 12H5m7-7-7 7 7 7" />
              </svg>
            </button>
            <p
              class="text-[10px] font-black tracking-[0.3em] text-gray-400 uppercase leading-none"
            >
              填寫表單
            </p>
          </div>
          <h1 class="text-3xl font-black italic tracking-tighter leading-none">
            訂單確認
          </h1>
        </div>
      </nav>

      <div class="max-w-md mx-auto px-6 pb-52">
        <!-- Loading -->
        <div
          v-if="pageLoading"
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

        <!-- ✅ Success screen -->
        <div
          v-else-if="orderSubmitted"
          class="flex flex-col items-center justify-center py-24 text-center"
        >
          <div
            class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#16a34a"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 class="text-xl font-black tracking-tight mb-2">訂單已提交！</h2>
          <p class="text-sm text-gray-500 leading-relaxed mb-8 max-w-xs">
            我們會盡快確認庫存與報價，<br />請留意 LINE 訊息通知。
          </p>
          <button
            @click="closeLiff"
            class="text-[10px] font-black border-b-[3px] border-black pb-1 uppercase tracking-widest active:opacity-50 transition-opacity"
          >
            Close Window
          </button>
        </div>

        <!-- Main content -->
        <template v-else>
          <!-- 🔄 Sync banner -->
          <div
            v-if="syncBanner"
            class="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-6"
          >
            <p
              class="text-[10px] text-blue-700 font-semibold leading-relaxed whitespace-pre-line"
            >
              {{ syncBanner }}
            </p>
          </div>

          <!-- ⚠️ Sync failed warning -->
          <div
            v-if="syncFailed"
            class="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-6"
          >
            <p class="text-[10px] text-amber-700 font-semibold leading-relaxed">
              ⚠️ 商品同步失敗，顯示的價格可能不是最新的。提交後我們會再次確認。
            </p>
          </div>

          <!-- Items section header -->
          <p
            class="text-[10px] font-black tracking-[0.3em] text-right text-gray-400 uppercase mb-2"
          >
            總共 {{ validItems.reduce((s, i) => s + (i.quantity || 1), 0)
            }}{{ soldOutCount > 0 ? ` · ${soldOutCount} 已售完` : '' }} 件商品
          </p>

          <!-- Item cards -->
          <div class="space-y-3 mb-8">
            <div
              v-for="item in annotatedItems"
              :key="item.id"
              class="flex gap-4 items-start p-4 rounded-2xl border transition-all"
              :class="
                item.soldOut
                  ? 'border-red-200 bg-red-50/50 opacity-60'
                  : item.priceChanged
                    ? 'border-amber-200 bg-amber-50/30'
                    : 'border-gray-100 bg-white'
              "
            >
              <div
                class="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100"
              >
                <img
                  :src="
                    item.image_url ||
                    'https://placehold.co/128x128.png?text=No+Image'
                  "
                  class="w-full h-full object-cover"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-bold text-sm truncate leading-tight mb-0.5">
                  {{ item.product_title }}
                </h3>
                <p
                  v-if="item.product_code"
                  class="text-[9px] font-mono text-gray-300 tracking-wide mb-0.5"
                >
                  {{ item.product_code }}
                </p>
                <p
                  class="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5"
                >
                  {{ item.color }}
                  <span class="mx-0.5 text-gray-200">|</span>
                  {{ item.size }}
                  <span class="mx-0.5 text-gray-200">×</span>
                  {{ item.quantity || 1 }}
                </p>
                <div v-if="item.soldOut">
                  <span
                    class="text-[10px] font-black text-red-500 tracking-wider"
                    >❌ 此貨已售完</span
                  >
                </div>
                <div v-else>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-black text-base tracking-tighter"
                      >NT${{
                        jpyToTwd(parseJpy(item.displayPrice)).toLocaleString()
                      }}</span
                    >
                    <template v-if="item.priceChanged">
                      <span class="text-[9px] text-gray-400 line-through"
                        >NT${{
                          jpyToTwd(parseJpy(item.oldPrice)).toLocaleString()
                        }}</span
                      >
                      <span
                        class="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full"
                      >
                        價格已更新
                      </span>
                    </template>
                  </div>
                  <p
                    v-if="item.promoDeadline"
                    class="text-[9px] text-orange-600 font-semibold mt-1"
                  >
                    特價至 {{ item.promoDeadline }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty state: all sold out -->
          <div v-if="validItems.length === 0" class="text-center py-8">
            <p class="text-gray-400 text-sm mb-4">
              😢 所有商品皆已完售，無法提交訂單。
            </p>
            <button
              @click="goBack"
              class="text-[10px] font-black border-b-[3px] border-black pb-1 uppercase tracking-widest active:opacity-50 transition-opacity"
            >
              Return to Cart
            </button>
          </div>

          <!-- Subtotal & Form -->
          <template v-if="validItems.length > 0">
            <!-- ── Customer Info Form ── -->
            <p class="text-xl font-black text-gray-800 italic mb-4">
              ▍收件資訊
            </p>
            <div class="space-y-6">
              <!-- LINE 名稱 (唯讀) -->
              <div>
                <label
                  class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
                  >LINE 名稱</label
                >
                <div
                  class="w-full border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium bg-gray-50 text-gray-500"
                >
                  {{ lineName || '讀取中...' }}
                </div>
              </div>

              <!-- 🍯 Honeypot：對人類隱藏，機器人會自動填寫 -->
              <div
                class="absolute opacity-0 -z-10 h-0 overflow-hidden"
                aria-hidden="true"
                tabindex="-1"
              >
                <label for="_website">Leave this empty</label>
                <input
                  id="_website"
                  v-model="form.website"
                  type="text"
                  autocomplete="off"
                  tabindex="-1"
                />
              </div>

              <!-- 收件人真實姓名 -->
              <div>
                <label
                  class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
                  >收件人</label
                >
                <input
                  v-model="form.name"
                  type="text"
                  :class="[
                    'w-full border rounded-xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all',
                    errors.name
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                      : 'border-gray-200 focus:border-black focus:ring-black/5',
                  ]"
                  placeholder="請輸入您的真實姓名"
                />
                <p
                  v-if="errors.name"
                  class="text-[9px] text-red-500 font-semibold mt-1"
                >
                  {{ errors.name }}
                </p>
              </div>

              <!-- 手機號碼 -->
              <div>
                <label
                  class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
                  >手機號碼</label
                >
                <input
                  v-model="form.phone"
                  type="tel"
                  inputmode="numeric"
                  maxlength="10"
                  :class="[
                    'w-full border rounded-xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all',
                    errors.phone
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                      : 'border-gray-200 focus:border-black focus:ring-black/5',
                  ]"
                  placeholder="0912345678"
                />
                <p
                  v-if="errors.phone"
                  class="text-[9px] text-red-500 font-semibold mt-1"
                >
                  {{ errors.phone }}
                </p>
              </div>

              <!-- 地址 -->
              <div>
                <label
                  class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
                  >台灣收件地址</label
                >
                <input
                  v-model="form.address"
                  type="text"
                  :class="[
                    'w-full border rounded-xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all',
                    errors.address
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                      : 'border-gray-200 focus:border-black focus:ring-black/5',
                  ]"
                  placeholder="例：台北市大安區忠孝東路四段123號5樓"
                />
                <p
                  v-if="errors.address"
                  class="text-[9px] text-red-500 font-semibold mt-1"
                >
                  {{ errors.address }}
                </p>
                <p v-else class="text-[9px] text-gray-400 mt-1">
                  地址需包含「縣/市」「區」「鄉」「鎮」等
                </p>
              </div>

              <!-- 支付方式 -->
              <div>
                <label
                  class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-3"
                  >支付方式</label
                >
                <div class="space-y-3">
                  <label
                    class="flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all"
                    :class="
                      form.paymentMethod === 'bank_transfer'
                        ? 'border-black bg-black/[0.02]'
                        : 'border-gray-200 bg-white'
                    "
                  >
                    <input
                      type="radio"
                      v-model="form.paymentMethod"
                      value="bank_transfer"
                      class="mt-0.5 accent-black"
                    />
                    <div>
                      <p class="text-sm font-bold leading-tight">銀行轉帳</p>
                      <p class="text-[10px] text-gray-600 mt-0.5">
                        直接轉帳至指定帳戶
                      </p>
                    </div>
                  </label>
                  <label
                    class="flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all"
                    :class="
                      form.paymentMethod === 'ecpay'
                        ? 'border-black bg-black/[0.02]'
                        : 'border-gray-200 bg-white'
                    "
                  >
                    <input
                      type="radio"
                      v-model="form.paymentMethod"
                      value="ecpay"
                      class="mt-0.5 accent-black"
                    />
                    <div>
                      <p class="text-sm font-bold leading-tight">綠界付款</p>
                      <p class="text-[10px] text-gray-600 mt-0.5">
                        信用卡（加收 2.75% 手續費），<span
                          class="text-gray-800 font-bold"
                        >
                          最終金額為 NT$
                          {{
                            Math.round(grandTotal * 1.0275).toLocaleString()
                          }}</span
                        >
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <!-- 銀行轉帳：帳號末五碼 -->
              <div
                v-if="form.paymentMethod === 'bank_transfer'"
                class="space-y-1.5"
              >
                <label
                  class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block"
                >
                  轉帳帳號末五碼(用於銀行對帳)
                </label>
                <input
                  v-model="form.accountLast5"
                  type="text"
                  maxlength="5"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  :class="[
                    'w-full border rounded-xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all',
                    errors.accountLast5
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                      : 'border-gray-200 focus:border-black focus:ring-black/5',
                  ]"
                  placeholder="請輸入帳號末五碼"
                />
                <p
                  v-if="errors.accountLast5"
                  class="text-[9px] text-red-500 font-semibold mt-1"
                >
                  {{ errors.accountLast5 }}
                </p>
                <p v-else class="text-[9px] text-gray-400">
                  請於轉帳後輸入帳號末五碼，方便我們核對入帳。
                </p>
              </div>

              <!-- 綠界手續費提示 -->
              <!-- <div
                v-if="form.paymentMethod === 'ecpay'"
                class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
              >
                <p
                  class="text-[10px] text-amber-700 font-semibold leading-relaxed"
                >
                  💡 選擇綠界付款將加收 2.75% 手續費，最終金額為 $
                  {{ Math.round(subtotal * 1.0275) }} 元
                </p>
              </div> -->

              <!-- 期間限定提示：顯示最近截止時間 -->
              <div
                v-if="hasPromoItems"
                class="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3"
              >
                <p
                  class="text-[10px] text-orange-700 font-semibold leading-relaxed"
                >
                  ⏰ 部分商品為期間限定特價。系統每日採購時間約為台灣
                  22:00，若超過特價截止時間，最終報價將以採購當下價格為準。
                </p>
                <!-- <p
                  v-if="earliestPromoDeadline"
                  class="text-[10px] text-orange-700 font-black mt-1"
                >
                  最近截止：{{ earliestPromoDeadline }}
                </p> -->
              </div>
            </div>
            <!-- 💰 費用明細 -->
            <div class="pt-4 border-t border-gray-200 mb-8">
              <p
                class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 leading-none"
              >
                費用明細
              </p>
              <div class="space-y-2.5">
                <!-- 商品小計 -->
                <div class="flex justify-between items-center">
                  <span class="text-[11px] text-gray-500 font-medium"
                    >商品小計（{{
                      validItems.reduce((s, i) => s + (i.quantity || 1), 0)
                    }}
                    件）</span
                  >
                  <span class="text-sm font-bold"
                    >NT${{ subtotalTwd.toLocaleString() }}</span
                  >
                </div>
                <!-- 運費 -->
                <div class="flex justify-between items-center">
                  <span class="text-[11px] text-gray-500 font-medium">
                    運費
                    <span class="text-[9px] text-gray-400 ml-1"
                      >{{ shippingInfo.method }} ·
                      {{ totalWeight.toLocaleString() }}g</span
                    >
                  </span>
                  <span class="text-sm font-bold"
                    >NT${{ shippingInfo.costTwd.toLocaleString() }}</span
                  >
                </div>
                <!-- 服務費 -->
                <div class="flex justify-between items-center">
                  <span class="text-[11px] text-gray-500 font-medium"
                    >代購服務費</span
                  >
                  <span class="text-sm font-bold">NT$50</span>
                </div>
                <!-- 分隔線 + 總計 -->
                <div
                  class="flex justify-between items-end pt-3 mt-1 border-t border-gray-100"
                >
                  <span class="text-sm font-black">訂單總計</span>
                  <span
                    class="text-2xl font-black tracking-tighter italic leading-none"
                    >NT${{ grandTotal.toLocaleString() }}</span
                  >
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>

      <!-- Fixed submit button -->
      <footer
        v-if="!pageLoading && !orderSubmitted && validItems.length > 0"
        class="fixed bottom-0 left-0 right-0 z-40 px-6 py-4"
      >
        <div
          class="max-w-md mx-auto bg-white/90 backdrop-blur-2xl px-8 py-6 rounded-[32px] shadow-[0_-15px_40px_rgba(0,0,0,0.03)] border border-white/50"
        >
          <button
            @click="submitOrder"
            :disabled="submitting"
            class="w-full bg-black text-white py-3 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {{ submitting ? 'Loading...' : '下一步' }}
          </button>
        </div>
      </footer>
    </div>
  </ClientOnly>
</template>

<script setup>
const config = useRuntimeConfig();

const pageLoading = ref(true);
const orderSubmitted = ref(false);
const submitting = ref(false);
const cartItems = ref([]);
const syncResults = ref([]);
const syncFailed = ref(false);
const userId = ref(null);
const lineName = ref('');
let supabase = null;
let liff = null;

const form = ref({
  name: '',
  phone: '',
  address: '',
  paymentMethod: 'bank_transfer',
  accountLast5: '',
  website: '', // 🍯 honeypot — 正常用戶不會看到也不會填
});

// 即時欄位驗證錯誤訊息
const errors = ref({
  name: '',
  phone: '',
  address: '',
  accountLast5: '',
});

// 台灣的縣市清單（用於地址驗證）
const TW_REGIONS = [
  '台北市',
  '臺北市',
  '新北市',
  '桃園市',
  '台中市',
  '臺中市',
  '台南市',
  '臺南市',
  '高雄市',
  '基隆市',
  '新竹市',
  '新竹縣',
  '苗栗縣',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義市',
  '嘉義縣',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '台東縣',
  '臺東縣',
  '澎湖縣',
  '金門縣',
  '連江縣',
];

// ── Watchers：即時清除已修正的欄位錯誤 ──

watch(
  () => form.value.name,
  (val) => {
    if (errors.value.name && val.trim().length >= 2) errors.value.name = '';
  },
);

watch(
  () => form.value.phone,
  (val) => {
    if (errors.value.phone && /^09\d{8}$/.test(val.trim()))
      errors.value.phone = '';
  },
);

watch(
  () => form.value.address,
  (val) => {
    if (
      errors.value.address &&
      TW_REGIONS.some((r) => val.trim().includes(r)) &&
      val.trim().length >= 8
    ) {
      errors.value.address = '';
    }
  },
);

watch(
  () => form.value.accountLast5,
  (val) => {
    if (errors.value.accountLast5 && /^\d{5}$/.test(val.trim()))
      errors.value.accountLast5 = '';
  },
);

// ── Helpers ──

const formatTaiwanDeadline = (unixTs) => {
  if (!unixTs) return null;
  // effectiveTime.end 是 UTC 時間戳
  // 台灣 = UTC + 8hr，再扣 1hr 預留日本下單緩衝 = UTC + 7hr
  const utcMs = Number(unixTs) * 1000;
  const tw = new Date(utcMs + 7 * 60 * 60 * 1000);
  const m = tw.getUTCMonth() + 1;
  const day = tw.getUTCDate();
  const h = tw.getUTCHours();
  const min = tw.getUTCMinutes();
  return `${m}/${day} ${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}（台灣時間）`;
};

// ── Computed ──

const annotatedItems = computed(() => {
  return cartItems.value.map((item) => {
    const sr = syncResults.value.find(
      (r) =>
        r.product_code === item.product_code &&
        r.color === item.color &&
        r.size === item.size,
    );
    if (!sr) {
      // 沒有 sync 結果時，用 cart_items 的 promo_end 作為 fallback
      const promoDeadline = item.promo_end
        ? formatTaiwanDeadline(item.promo_end)
        : null;
      return {
        ...item,
        soldOut: false,
        priceChanged: false,
        displayPrice: item.price,
        oldPrice: null,
        promoDeadline,
      };
    }
    const promoDeadline = sr.promoEndTs
      ? formatTaiwanDeadline(sr.promoEndTs)
      : null;
    return {
      ...item,
      soldOut: !sr.inStock,
      priceChanged: sr.priceChanged,
      displayPrice: sr.currentPrice || item.price,
      oldPrice: sr.priceChanged ? item.originalPrice || item.price : null,
      promoDeadline,
    };
  });
});

const validItems = computed(() =>
  annotatedItems.value.filter((i) => !i.soldOut),
);
const soldOutCount = computed(
  () => annotatedItems.value.filter((i) => i.soldOut).length,
);
const hasPromoItems = computed(() =>
  syncResults.value.some((r) => r.isPromo && r.inStock),
);

const earliestPromoDeadline = computed(() => {
  const tsList = syncResults.value
    .filter((r) => r.isPromo && r.inStock && r.promoEndTs)
    .map((r) => r.promoEndTs);
  if (!tsList.length) return null;
  const earliest = Math.min(...tsList);
  return formatTaiwanDeadline(earliest);
});

// JPY 小計（用於 DB 存儲）
const subtotalJpy = computed(() => {
  return validItems.value.reduce((sum, item) => {
    const price = parseJpy(item.displayPrice || '');
    return sum + price * (item.quantity || 1);
  }, 0);
});

// TWD 商品小計
const subtotalTwd = computed(() => {
  return validItems.value.reduce((sum, item) => {
    const jpy = parseJpy(item.displayPrice || '');
    return sum + jpyToTwd(jpy) * (item.quantity || 1);
  }, 0);
});

// 預估總重量（公克）
const totalWeight = computed(() => {
  return validItems.value.reduce((sum, item) => {
    const weight = getCategoryWeight(item.category || '');
    return sum + weight * (item.quantity || 1);
  }, 0);
});

// 運費資訊
const shippingInfo = computed(() => getShippingTwd(totalWeight.value));

// 訂單總計（商品 + 運費 + 服務費）
const grandTotal = computed(() => {
  return subtotalTwd.value + shippingInfo.value.costTwd + SERVICE_FEE_TWD;
});

const syncBanner = computed(() => {
  if (!syncResults.value.length) return '';
  const changes = [];
  for (const item of annotatedItems.value) {
    if (item.soldOut) {
      changes.push(
        `❌ ${item.product_title}（${item.color} / ${item.size}）：此貨已售完`,
      );
    } else if (item.priceChanged) {
      changes.push(
        `💰 ${item.product_title}（${item.color} / ${item.size}）：NT$${jpyToTwd(parseJpy(item.oldPrice)).toLocaleString()} → NT$${jpyToTwd(parseJpy(item.displayPrice)).toLocaleString()}`,
      );
    }
  }
  if (changes.length === 0)
    return '🔄 已同步更新商品資訊，所有商品價格與庫存正常。';
  return `🔄 已同步更新商品資訊：\n${changes.join('\n')}`;
});

// ── Actions ──

const goBack = () => navigateTo('/cart');

const closeLiff = () => {
  try {
    liff?.closeWindow();
  } catch {
    navigateTo('/cart');
  }
};

const validateForm = () => {
  // 🍯 Honeypot 偵測：正常用戶不會填寫隱藏欄位
  if (form.value.website) {
    // 假裝成功，但不實際送出（避免讓 bot 知道被偵測）
    console.warn('🍯 Honeypot triggered');
    orderSubmitted.value = true;
    return false;
  }

  // 重置錯誤訊息
  errors.value = { name: '', phone: '', address: '', accountLast5: '' };
  let valid = true;

  // 收件人姓名
  if (!form.value.name.trim()) {
    errors.value.name = '請輸入收件人真實姓名';
    valid = false;
  } else if (form.value.name.trim().length < 2) {
    errors.value.name = '姓名至少 2 個字';
    valid = false;
  }

  // 手機號碼：台灣手機 09 開頭 10 位數字
  const phoneClean = form.value.phone.trim();
  if (!phoneClean) {
    errors.value.phone = '請輸入手機號碼';
    valid = false;
  } else if (!/^09\d{8}$/.test(phoneClean)) {
    errors.value.phone = '請輸入正確的台灣手機號碼（09開頭，共10碼）';
    valid = false;
  }

  // 地址：必須包含台灣的縣/市
  const addr = form.value.address.trim();
  if (!addr) {
    errors.value.address = '請輸入收件地址';
    valid = false;
  } else if (!TW_REGIONS.some((r) => addr.includes(r))) {
    errors.value.address = '地址需包含「縣/市」「區」「鄉」「鎮」等';
    valid = false;
  } else if (addr.length < 8) {
    errors.value.address = '地址過短，請輸入完整地址';
    valid = false;
  }

  // 帳號末五碼（銀行轉帳時必填）
  if (form.value.paymentMethod === 'bank_transfer') {
    const last5 = form.value.accountLast5.trim();
    if (!last5) {
      errors.value.accountLast5 = '請輸入轉帳帳號末五碼';
      valid = false;
    } else if (!/^\d{5}$/.test(last5)) {
      errors.value.accountLast5 = '帳號末五碼必須為 5 位數字';
      valid = false;
    }
  }

  return valid;
};

const submitOrder = async () => {
  if (!validateForm()) return;

  submitting.value = true;
  try {
    const orderItems = validItems.value.map((item) => ({
      product_title: item.product_title,
      product_code: item.product_code,
      color: item.color,
      size: item.size,
      price: item.displayPrice,
      priceTwd: jpyToTwd(parseJpy(item.displayPrice)),
      quantity: item.quantity || 1,
      image_url: item.image_url || '',
      product_url: item.product_url || '',
    }));

    const res = await fetch('/api/submit-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId.value,
        lineName: lineName.value,
        customerName: form.value.name.trim(),
        phone: form.value.phone.trim(),
        address: form.value.address.trim(),
        paymentMethod: form.value.paymentMethod,
        accountLast5:
          form.value.paymentMethod === 'bank_transfer'
            ? form.value.accountLast5.trim()
            : null,
        items: orderItems,
        totalJpy: subtotalJpy.value,
        subtotalTwd: subtotalTwd.value,
        shippingTwd: shippingInfo.value.costTwd,
        shippingMethod: shippingInfo.value.method,
        serviceFeeTwd: SERVICE_FEE_TWD,
        grandTotalTwd: grandTotal.value,
        website: form.value.website, // 🍯 honeypot（server-side 也會檢查）
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.statusMessage || '提交失敗');
    }

    orderSubmitted.value = true;
  } catch (err) {
    console.error('Submit error:', err);
    alert(`提交失敗：${err.message || '請稍後再試'}`);
  } finally {
    submitting.value = false;
  }
};

// ── Lifecycle ──

onMounted(async () => {
  const [liffModule, { createClient }] = await Promise.all([
    import('@line/liff'),
    import('@supabase/supabase-js'),
  ]);
  liff = liffModule.default;
  supabase = createClient(config.public.supabaseUrl, config.public.supabaseKey);

  try {
    await liff.init({ liffId: config.public.liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    userId.value = profile.userId;
    lineName.value = profile.displayName || '';
    // 真實姓名由客人自行填寫，不自動帶入 LINE 顯示名稱

    // 🧹 清除過期購物車
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', userId.value)
      .lt('created_at', sixHoursAgo);

    // 📦 載入購物車商品
    const { data } = await supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', userId.value)
      .order('created_at', { ascending: false });
    cartItems.value = data || [];

    // 🔄 讀取同步結果（從 cart 頁帶過來的）
    const syncRaw = sessionStorage.getItem('checkout_sync');
    if (syncRaw) {
      const syncData = JSON.parse(syncRaw);
      sessionStorage.removeItem('checkout_sync');

      if (syncData.syncFailed) {
        syncFailed.value = true;
      } else {
        syncResults.value = syncData.results || [];

        // 💾 備份舊價格，然後更新 DB 中的價格（保留 in-memory 原始價格供標記用）
        for (const r of syncResults.value) {
          if (r.priceChanged && r.inStock) {
            const item = cartItems.value.find(
              (i) =>
                i.product_code === r.product_code &&
                i.color === r.color &&
                i.size === r.size,
            );
            if (item) {
              // 保存舊價格供顯示用
              item.originalPrice = item.price;
              // 更新 DB（下次載入就是新價格）
              await supabase
                .from('cart_items')
                .update({ price: r.currentPrice })
                .eq('id', item.id);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Checkout init error:', err);
  } finally {
    pageLoading.value = false;
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
