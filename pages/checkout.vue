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
const orderNo = ref('');
const submittedPaymentMethod = ref('');
const submittedTotal = ref(0);
let supabase = null;
let liff = null;
const { rate: jpyRate, fetchRate } = useExchangeRate();

const form = ref({
  name: '',
  phone: '',
  address: '',
  paymentMethod: 'bank_transfer', // 預設選擇銀行轉帳
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
    return sum + jpyToTwd(jpy, jpyRate.value) * (item.quantity || 1);
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
const shippingInfo = computed(() =>
  getShippingTwd(totalWeight.value, jpyRate.value),
);

// 基礎金額（商品 + 運費 + 基本服務費）
const baseSubtotal = computed(
  () => subtotalTwd.value + shippingInfo.value.costTwd + SERVICE_FEE_TWD,
);

// 隱含 3% 手續費（不明文，預設加在服務費）
const hiddenSurcharge = computed(() => Math.round(baseSubtotal.value * 0.03));

// 顯示的服務費（含隱含 3%）
const displayServiceFee = computed(
  () => SERVICE_FEE_TWD + hiddenSurcharge.value,
);

// 稅前小計（含隱含 3%）
const preTaxWithSurcharge = computed(
  () =>
    subtotalTwd.value + shippingInfo.value.costTwd + displayServiceFee.value,
);

// 銀行轉帳時，稅前小計需扣掉 3% 優惠
const preTaxForPayment = computed(() =>
  form.value.paymentMethod === 'bank_transfer'
    ? preTaxWithSurcharge.value - hiddenSurcharge.value
    : preTaxWithSurcharge.value,
);

// 營業稅 5%（依據實際稅前小計計算）
const taxAmount = computed(() => Math.round(preTaxForPayment.value * 0.05));

// 最終應付金額
const displayTotal = computed(() => preTaxForPayment.value + taxAmount.value);

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
        `💰 ${item.product_title}（${item.color} / ${item.size}）：NT$${jpyToTwd(parseJpy(item.oldPrice), jpyRate.value).toLocaleString()} → NT$${jpyToTwd(parseJpy(item.displayPrice), jpyRate.value).toLocaleString()}`,
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
    errors.value.address =
      '地址需包含縣市/行政區、鄉鎮市區、路街名、巷弄號、樓層與房間號碼';
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
      priceTwd: jpyToTwd(parseJpy(item.displayPrice), jpyRate.value),
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
        serviceFeeTwd: displayServiceFee.value,
        grandTotalTwd: displayTotal.value,
        website: form.value.website, // 🍯 honeypot（server-side 也會檢查）
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.statusMessage || '提交失敗');
    }

    const data = await res.json();
    orderNo.value = data.orderNo || '';
    submittedPaymentMethod.value = form.value.paymentMethod;
    submittedTotal.value = displayTotal.value;
    orderSubmitted.value = true;
    await nextTick();
    window.scrollTo({ top: 0, behavior: 'instant' });
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
    fetchRate(),
  ]);
  liff = liffModule.default;
  supabase = createClient(config.public.supabaseUrl, config.public.supabaseKey);

  try {
    await liff.init({ liffId: config.public.liffIdCart });
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

    // 🔄 套用 sync 結果（更新顯示價格、標記已售完）
    const applySyncData = async (syncData) => {
      if (syncData.syncFailed) {
        syncFailed.value = true;
        return;
      }
      syncResults.value = syncData.results || [];
      for (const r of syncResults.value) {
        if (r.priceChanged && r.inStock) {
          const item = cartItems.value.find(
            (i) =>
              i.product_code === r.product_code &&
              i.color === r.color &&
              i.size === r.size,
          );
          if (item) {
            item.originalPrice = item.price;
            await supabase
              .from('cart_items')
              .update({ price: r.currentPrice })
              .eq('id', item.id);
          }
        }
      }
    };

    // 🔄 優先用 cart.vue 帶過來的 sessionStorage，沒有就自動重新 sync
    const syncRaw = sessionStorage.getItem('checkout_sync');
    if (syncRaw) {
      sessionStorage.removeItem('checkout_sync');
      await applySyncData(JSON.parse(syncRaw));
    } else if (cartItems.value.length > 0) {
      // 直接進入或重整頁面：自動執行一次 sync
      try {
        const checkItems = cartItems.value.map((item) => ({
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
        await applySyncData(syncData);
      } catch {
        syncFailed.value = true;
      }
    }
  } catch (err) {
    console.error('Checkout init error:', err);
  } finally {
    pageLoading.value = false;
  }
});
</script>

<template>
  <ClientOnly>
    <div class="min-h-screen bg-[#FDFCF8] text-[#4A5D59] font-sans antialiased">
      <!-- Navigation -->
      <AppNavbar title="訂單確認">
        <template #subtitle>
          <div
            class="flex items-center gap-2 mb-2 cursor-pointer"
            @click="goBack"
          >
            <div
              class="p-1 -ml-1 text-[#A4B8B0] hover:text-[#5A746B] transition-colors"
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
            </div>
            <p
              class="text-[10px] font-black tracking-[0.3em] text-[#A4B8B0] uppercase leading-none"
            >
              返回購物車
            </p>
          </div>
        </template>
      </AppNavbar>

      <div class="max-w-md mx-auto px-6 pb-52">
        <!-- Loading -->
        <AppLoading v-if="pageLoading" />

        <!-- ✅ Success screen -->
        <CheckoutSuccess
          v-else-if="orderSubmitted"
          :order-no="orderNo"
          :payment-method="submittedPaymentMethod"
          :total="submittedTotal"
          @close="closeLiff"
        />

        <!-- Main content -->
        <template v-else>
          <!-- 🔄 Sync banner -->
          <div
            v-if="syncBanner"
            class="bg-[#E8F0E9] border border-[#D1E2D5] rounded-3xl px-5 py-3 mb-6 mt-6"
          >
            <p
              class="text-[11px] text-[#5A746B] font-medium leading-relaxed whitespace-pre-line flex items-start gap-2"
            >
              <span>{{ syncBanner }}</span>
            </p>
          </div>

          <!-- ⚠️ Sync failed warning -->
          <div
            v-if="syncFailed"
            class="bg-amber-50 border border-amber-200 rounded-3xl px-5 py-3 mb-6 mt-6"
          >
            <p class="text-[11px] text-amber-700 font-medium leading-relaxed">
              ⚠️ 商品同步失敗，顯示的價格可能不是最新的。提交後我們會再次確認。
            </p>
          </div>

          <!-- Items section header -->
          <p
            class="text-[10px] font-black tracking-[0.3em] text-right text-[#A4B8B0] uppercase mb-3 mt-6"
          >
            總共 {{ validItems.reduce((s, i) => s + (i.quantity || 1), 0)
            }}{{ soldOutCount > 0 ? ` · ${soldOutCount} 已售完` : '' }} 件商品
          </p>

          <!-- Item cards -->
          <div class="space-y-3 mb-8">
            <CheckoutItemCard
              v-for="item in annotatedItems"
              :key="item.id"
              :item="item"
              :jpy-rate="jpyRate"
            />
          </div>

          <!-- Empty state: all sold out -->
          <div v-if="validItems.length === 0" class="text-center py-8">
            <p class="text-[#A4B8B0] text-sm mb-4">沒有訂單唷～</p>
            <button
              class="text-xs font-bold text-[#749D8E] hover:text-[#5A746B] transition-colors border-b-2 border-[#749D8E] pb-1 uppercase tracking-widest"
              @click="closeLiff()"
            >
              返回官方帳號
            </button>
          </div>

          <!-- Subtotal & Form -->
          <template v-if="validItems.length > 0">
            <CheckoutPriceSummary
              :subtotal-twd="subtotalTwd"
              :shipping-info="shippingInfo"
              :total-weight="totalWeight"
              :display-service-fee="displayServiceFee"
              :hidden-surcharge="hiddenSurcharge"
              :display-total="displayTotal"
              :payment-method="form.paymentMethod"
              :valid-item-count="
                validItems.reduce((s, i) => s + (i.quantity || 1), 0)
              "
            />

            <CheckoutOrderForm
              :form="form"
              :errors="errors"
              :line-name="lineName"
              :hidden-surcharge="hiddenSurcharge"
              :has-promo-items="hasPromoItems"
            />
          </template>
        </template>
      </div>

      <!-- Fixed submit button -->
      <AppBottomBar
        v-if="!pageLoading && !orderSubmitted && validItems.length > 0"
        label="訂單總計"
        sublabel="含稅"
        :amount="displayTotal"
        :button-text="submitting ? '送出中' : '下一步'"
        :disabled="submitting"
        @submit="submitOrder"
      />
    </div>
  </ClientOnly>
</template>
