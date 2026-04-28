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
const showTermsModal = ref(false);
const termsAccepted = ref(false);

// 折扣碼
const couponInput = ref('');
const appliedCoupon = ref(null); // { code: string, discountTwd: number }
const couponLoading = ref(false);
const couponError = ref('');
let supabase = null;
let liff = null;
const { rate: jpyRate, fetchRate } = useExchangeRate();

const form = ref({
  name: '',
  phone: '',
  address: '',
  email: '',
  paymentMethod: 'bank_transfer', // 預設選擇銀行轉帳
  accountLast5: '',
  website: '', // 🍯 honeypot — 正常用戶不會看到也不會填
});

// 即時欄位驗證錯誤訊息
const errors = ref({
  name: '',
  phone: '',
  address: '',
  email: '',
  accountLast5: '',
});

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

watch(
  () => form.value.email,
  (val) => {
    if (errors.value.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()))
      errors.value.email = '';
  },
);

const formatTaiwanDeadline = (unixTs) => {
  if (!unixTs) return null;
  const utcMs = Number(unixTs) * 1000;

  // 台灣時間 (UTC+8)，提前 1 小時收單作為緩衝
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
    // NT$ 自訂價格的商品沒有日幣價，不列入 JPY 小計
    const price = item.displayPrice || '';
    if (price.startsWith('NT$')) return sum;
    return sum + parseJpy(price) * (item.quantity || 1);
  }, 0);
});

// TWD 商品小計
const subtotalTwd = computed(() => {
  return validItems.value.reduce((sum, item) => {
    const twd = parsePriceTwd(item.displayPrice || '', jpyRate.value);
    return sum + twd * (item.quantity || 1);
  }, 0);
});

// 預估總重量（公克）
const totalWeight = computed(() => {
  return validItems.value.reduce((sum, item) => {
    const weight = getCategoryWeight(item.category || '');
    return sum + weight * (item.quantity || 1);
  }, 0);
});

// 是否需要強制國際小包（RS Taichi 任何商品 / Kushitani 有重量商品）
const forceIntlPacket = computed(() =>
  validItems.value.some((item) => {
    const cat = (item.category || '').toLowerCase();
    if (cat.startsWith('rstaichi|')) return true;
    if (cat.startsWith('kushitani|')) {
      const w = parseInt(cat.split('|')[1] || '0');
      return w > 0;
    }
    return false;
  }),
);

// 運費資訊
const shippingInfo = computed(() =>
  getShippingTwd(totalWeight.value, jpyRate.value, forceIntlPacket.value),
);

// 日本國內運費
const domesticShipping = computed(() => {
  const itemsForCalc = validItems.value.map((item) => ({
    price: item.displayPrice || '',
    quantity: item.quantity || 1,
    category: item.category || '',
  }));
  return getDomesticShippingJpy(itemsForCalc, jpyRate.value);
});

// 國際運費 + 日本國內運費
const totalShippingTwd = computed(
  () => shippingInfo.value.costTwd + domesticShipping.value.totalTwd,
);

// 基礎金額（商品 + 運費 + 基本服務費）
const baseSubtotal = computed(
  () => subtotalTwd.value + totalShippingTwd.value + SERVICE_FEE_TWD,
);

// 隱含 3% 手續費（不明文，預設加在服務費）
const hiddenSurcharge = computed(() => Math.round(baseSubtotal.value * 0.03));

// 顯示的服務費（含隱含 3%）
const displayServiceFee = computed(
  () => SERVICE_FEE_TWD + hiddenSurcharge.value,
);

// 稅前小計（含隱含 3%）
const preTaxWithSurcharge = computed(
  () => subtotalTwd.value + totalShippingTwd.value + displayServiceFee.value,
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

// 折扣碼優惠
const couponDiscountTwd = computed(() => appliedCoupon.value?.discountTwd ?? 0);
// 扣除折扣碼後的實際應付金額
const finalTotal = computed(() =>
  Math.max(0, displayTotal.value - couponDiscountTwd.value),
);

const syncBanner = computed(() => {
  if (!syncResults.value.length) return '';
  const changes = [];
  for (const item of annotatedItems.value) {
    if (item.soldOut) {
      changes.push(
        `❌ ${item.product_title}（${item.color} / ${item.size}）：此貨已售完`,
      );
    } else if (item.priceChanged) {
      // oldTwd：sync 前購物車記錄的舊售價（台幣）
      // newTwd：sync 後抓到的新售價（台幣）
      // 兩者都用 parsePriceTwd，才能正確處理 NT$ 自訂售價與 ¥ 日幣兩種格式
      const oldTwd = parsePriceTwd(item.oldPrice || '', jpyRate.value);
      const newTwd = parsePriceTwd(item.displayPrice || '', jpyRate.value);
      changes.push(
        `💰 ${item.product_title}（${item.color} / ${item.size}）：NT$${oldTwd.toLocaleString()} → NT$${newTwd.toLocaleString()}`,
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

const applyCoupon = async () => {
  if (!couponInput.value.trim()) return;
  couponLoading.value = true;
  couponError.value = '';
  try {
    const res = await $fetch('/api/validate-coupon', {
      method: 'POST',
      body: { code: couponInput.value.trim(), lineUserId: userId.value },
    });
    if (res.valid) {
      appliedCoupon.value = { code: res.code, discountTwd: res.discountTwd };
    } else {
      couponError.value = res.message || '折扣碼無效';
    }
  } catch {
    couponError.value = '折扣碼驗證失敗，請稍後再試';
  } finally {
    couponLoading.value = false;
  }
};

const removeCoupon = () => {
  appliedCoupon.value = null;
  couponInput.value = '';
  couponError.value = '';
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
  errors.value = {
    name: '',
    phone: '',
    address: '',
    email: '',
    accountLast5: '',
  };
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

  // 電子信箱
  const emailVal = form.value.email.trim();
  if (!emailVal) {
    errors.value.email = '請輸入電子信箱（電子發票寄送用）';
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    errors.value.email = '請輸入正確的電子信箱格式';
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

const handleSubmitClick = async () => {
  if (!validateForm()) {
    await nextTick();
    // 找到第一個驗證失敗的欄位並滾動過去，自動避開 sticky nav
    const fieldOrder = ['name', 'phone', 'address', 'email', 'accountLast5'];
    for (const field of fieldOrder) {
      if (errors.value[field]) {
        const el = document.getElementById(`field-${field}`);
        if (el) {
          const nav = document.querySelector('nav');
          const navHeight = nav ? nav.offsetHeight : 80;
          const y =
            el.getBoundingClientRect().top + window.scrollY - navHeight - 16;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
        break;
      }
    }
    return;
  }
  termsAccepted.value = false;
  showTermsModal.value = true;
};

const submitOrder = async () => {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const orderItems = validItems.value.map((item) => {
      // priceTwd：客戶實際付的台幣售價
      //   - ¥ 商品 → parsePriceTwd 內部走 jpyToTwd（日幣 × (rate + markup)）
      //   - NT$ 商品（Kushitani 自訂售價）→ parsePriceTwd 直接回傳 NT$ 面額
      const priceTwd = parsePriceTwd(item.displayPrice, jpyRate.value);

      // costTwd：我方代購成本（寫入 Google 試算表 W/X/Y 欄，用於利潤計算）
      //   ※ shippingInfo.costTwd 是運費，語意不同；此處為 .map() 內 local 變數，不會混淆
      //   - ¥ 商品 → 日幣原價 × 基礎匯率（只有 rate，不含加碼）
      //   - NT$ 商品（Kushitani 含運直送自訂售價）→ 成本結構不明，保守以 priceTwd 代入
      const costTwd = (item.displayPrice || '').startsWith('NT$')
        ? priceTwd
        : Math.round(parseJpy(item.displayPrice) * jpyRate.value);
      return {
        product_title: item.product_title,
        product_code: item.product_code,
        color: item.color,
        size: item.size,
        price: item.displayPrice,
        priceTwd,
        costTwd,
        quantity: item.quantity || 1,
        image_url: item.image_url || '',
        product_url: item.product_url || '',
      };
    });

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
        email: form.value.email.trim(),
        accountLast5:
          form.value.paymentMethod === 'bank_transfer'
            ? form.value.accountLast5.trim()
            : null,
        items: orderItems,
        totalJpy: subtotalJpy.value,
        subtotalTwd: subtotalTwd.value,
        shippingTwd: totalShippingTwd.value,
        shippingMethod: shippingInfo.value.method,
        serviceFeeTwd: displayServiceFee.value,
        discountTwd:
          form.value.paymentMethod === 'bank_transfer'
            ? hiddenSurcharge.value
            : 0,
        couponCode: appliedCoupon.value?.code || null,
        grandTotalTwd: finalTotal.value,
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
    submittedTotal.value = finalTotal.value;
    showTermsModal.value = false;
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
    fetchRate({ skipCache: true }),
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
          product_url: item.product_url || '',
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
    <div class="flex flex-col bg-[#FDFCF8] text-[#4A5D59] font-sans">
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

      <main class="flex-1">
        <div class="max-w-md mx-auto px-6 pb-6">
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
                ⚠️
                商品同步失敗，顯示的價格可能不是最新的。提交後我們會再次確認。
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
                :domestic-shipping="domesticShipping"
                :display-service-fee="displayServiceFee"
                :hidden-surcharge="hiddenSurcharge"
                :tax-amount="taxAmount"
                :display-total="displayTotal"
                :final-total="finalTotal"
                :coupon-discount-twd="couponDiscountTwd"
                :payment-method="form.paymentMethod"
                :valid-item-count="
                  validItems.reduce((s, i) => s + (i.quantity || 1), 0)
                "
              />

              <!-- 折扣碼 -->
              <div class="py-4 border-t border-[#E8F0E9]">
                <p
                  class="text-[10px] font-black text-[#749D8E] uppercase tracking-widest mb-4 leading-none"
                >
                  折扣碼
                </p>
                <div class="flex gap-2">
                  <input
                    v-model="couponInput"
                    type="text"
                    placeholder="輸入折扣碼（選填）"
                    :disabled="!!appliedCoupon || couponLoading"
                    class="flex-1 px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl text-[#4A5D59] placeholder-[#A4B8B0] focus:outline-none focus:border-[#749D8E] disabled:opacity-50 uppercase"
                    @keyup.enter="applyCoupon"
                  />
                  <button
                    v-if="!appliedCoupon"
                    :disabled="!couponInput.trim() || couponLoading"
                    class="px-4 py-2.5 text-xs font-bold bg-[#749D8E] text-white rounded-2xl disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
                    @click="applyCoupon"
                  >
                    {{ couponLoading ? '確認中...' : '套用' }}
                  </button>
                  <button
                    v-else
                    class="px-4 py-2.5 text-xs font-bold bg-[#E8F0E9] text-[#5A746B] rounded-2xl whitespace-nowrap"
                    @click="removeCoupon"
                  >
                    取消
                  </button>
                </div>
                <p v-if="couponError" class="text-xs text-red-500 mt-2 ml-1">
                  {{ couponError }}
                </p>
                <p
                  v-if="appliedCoupon"
                  class="text-xs text-red-400 font-semibold mt-2 ml-1"
                >
                  折扣碼已套用，省下 NT${{
                    appliedCoupon.discountTwd.toLocaleString()
                  }}
                </p>
              </div>

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
      </main>

      <!-- Fixed submit button -->
      <AppBottomBar
        v-if="!pageLoading && !orderSubmitted && validItems.length > 0"
        label="訂單總計"
        sublabel=""
        :amount="finalTotal"
        :button-text="submitting ? '送出中' : '下一步'"
        :disabled="submitting"
        @submit="handleSubmitClick"
      />
    </div>

    <!-- 服務條款 Modal -->
    <AppModal
      :show="showTermsModal"
      title="📋 服務條款與隱私聲明"
      @close="!submitting && (showTermsModal = false)"
    >
      <div
        class="max-h-[50vh] overflow-y-auto text-sm text-[#4A5D59] leading-relaxed space-y-4 bg-[#f4f7f7] p-4 rounded-lg"
      >
        <p class="font-bold text-base">洛姆日貨代購：服務條款與隱私聲明</p>

        <div>
          <p class="font-bold mb-1">一、訂購與缺貨處理</p>
          <ul class="list-disc pl-4 space-y-1">
            <li>
              庫存動態：
              系統下單不代表購買成功，若遇官網缺貨、限購或下單失敗，客服將主動聯繫並全額退款，請務必留意LINE
              訊息通知。
            </li>
            <li>
              特價變動：
              限時特價商品若於日本網站採購時已恢復原價，我們將主動聯繫您，並依情況取消交易退款或請您補足差額。
            </li>
            <li>
              運費變動：
              商品運費為設定好的預估金額，實際運費將依照日本寄出時的重量、材積與運費規則計算，若有變動將主動聯繫您說明差額並請您補足。
            </li>
            <li>
              物流時效：商品皆由日本空運回台，正常現貨狀況約 7-14
              個工作天抵台，若遇海關查驗或物流突發狀況，最長需等候 30
              個工作天，急單請聯繫專人客服 👉
              <a
                href="https://lin.ee/BIvxV5C"
                target="_blank"
                rel="noopener noreferrer"
                ><b>LINE 客服</b></a
              >
            </li>
            <li>
              代購性質：本服務屬「客製化給付」，下單後即進入採購流程，不適用 7
              天鑑賞期，亦不接受取消訂單、改單或併單。
            </li>
          </ul>
        </div>

        <div>
          <p class="font-bold mb-1">二、匯款與對帳規範</p>
          <ul class="list-disc pl-4 space-y-1">
            <li>
              金額準確性：請依結帳畫面之「總金額」進行匯款，若因個人疏失導致匯錯或重複匯款，退款將扣除轉帳手續費。
            </li>
            <li>
              自動取消：採人工核對匯款，狀態更新約需 1-2 個工作天。若完成匯款 24
              小時後狀態未變，請主動聯繫客服，避免訂單因逾期（3日）被系統自動取消。
            </li>
            <li>
              惡意棄單：惡意跑單、故意匯錯金額或干擾系統運作者，將永久列入黑名單並停止一切服務。
            </li>
          </ul>
        </div>

        <div>
          <p class="font-bold mb-1">三、收貨與售後保障</p>
          <ul class="list-disc pl-4 space-y-1">
            <li>物流追蹤：商品寄出後，我們會提供追蹤編號供您查詢物流進度。</li>
            <li>
              拆封錄影：為保護雙方權益，收貨拆封時請務必全程錄影，若無錄影存證，商品缺漏或重大損壞之爭議恕不受理。
            </li>
            <li>
              收貨內容：收到商品後如有破損或品項錯誤，請於 3 天內拍照並透過 LINE
              聯繫我們。
            </li>
            <li>
              代購性質：本服務屬「客製化給付」，恕不接受個人因素（如尺寸不合、不喜歡）的退換貨要求。
            </li>
            <li>
              瑕疵定義：代購非製造商，輕微線頭、溢膠、顏色與螢幕顯色差異等不屬瑕疵範圍，若有重大破損，請憑完整影片聯繫客服解決。
            </li>
            <li>
              合法合規：本站注重合法營運，採電子發票形式寄送至您指定之電子信箱。
            </li>
            <li>
              系統運行：
              我們致力於提供最精確的自動化服務，但若因不可抗力之系統異常導致訂單錯誤，本站保有最終解釋權與取消訂單之權利。我們承諾全力保障您的權益，重大問題請務必連繫客服處理。
            </li>
          </ul>
        </div>

        <div>
          <p class="font-bold mb-1">四、隱私與資料使用</p>
          <ul class="list-disc pl-4 space-y-1">
            <li>姓名、地址、電話請務必填寫正確，以確保海外寄送順利。</li>
            <li>您提供的表單資訊僅用於訂單處理與寄送使用。</li>
            <li>我們不會將您的個人資料轉售或分享給第三方。</li>
            <li>電子信箱將用於寄送電子發票，請確保填寫正確。</li>
          </ul>
        </div>
      </div>

      <template #footer>
        <label
          class="flex items-center gap-2 mb-4 cursor-pointer select-none"
          :class="{ 'opacity-50 pointer-events-none': submitting }"
          @click.prevent="termsAccepted = !termsAccepted"
        >
          <span
            :class="[
              'mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
              termsAccepted
                ? 'bg-[#749D8E] border-[#749D8E]'
                : 'border-[#C8D5CF] bg-white',
            ]"
          >
            <svg
              v-if="termsAccepted"
              class="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </span>
          <span class="text-xs text-[#5A746B] leading-relaxed">
            我已閱讀並同意以上條款，並確認訂單內容無誤。
          </span>
        </label>
        <button
          :disabled="!termsAccepted || submitting"
          @click="submitOrder"
          class="w-full bg-[#749D8E] hover:bg-[#63897B] text-white py-3.5 rounded-2xl font-bold text-sm tracking-wider shadow-[0_10px_25px_rgba(116,157,142,0.3)] active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
        >
          <svg
            v-if="submitting"
            class="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          {{ submitting ? '訂單送出中，請稍候...' : '確認送出訂單' }}
        </button>
      </template>
    </AppModal>
  </ClientOnly>
</template>
