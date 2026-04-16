<script setup lang="ts">
import { getShippingTwd } from '#shared/shipping';
import { getRateMarkup } from '#shared/pricing';

const { rate: jpyRate, loading: rateLoading, fetchRate } = useExchangeRate();

const jpyPrice = ref<number | null>(null);
const weightKg = ref(2);
const domesticShippingJpy = ref<number | null>(null);

// ── 重量選項（kg） ──
const weightOptions = [
  { kg: 0.5, label: '0.5 kg', desc: '小物・配件' },
  { kg: 1, label: '1 kg', desc: 'T恤・襯衫' },
  { kg: 2, label: '2 kg', desc: '外套・長褲' },
  { kg: 3, label: '3 kg', desc: '2～3 件衣物' },
  { kg: 4, label: '4 kg', desc: '中型包裹' },
  { kg: 5, label: '5 kg', desc: '中型包裹' },
  { kg: 6, label: '6 kg', desc: '多件混搭' },
  { kg: 7, label: '7 kg', desc: '多件混搭' },
  { kg: 8, label: '8 kg', desc: '重型包裹' },
  { kg: 9, label: '9 kg', desc: '重型包裹' },
  { kg: 10, label: '10 kg', desc: '大型採購' },
  { kg: 11, label: '11 kg', desc: '大型採購' },
  { kg: 12, label: '12 kg', desc: '大型採購' },
  { kg: 13, label: '13 kg', desc: '大型採購' },
  { kg: 14, label: '14 kg', desc: '大型採購' },
  { kg: 15, label: '15 kg', desc: '大型採購' },
  { kg: 16, label: '16 kg', desc: '大型採購' },
  { kg: 17, label: '17 kg', desc: '大型採購' },
  { kg: 18, label: '18 kg', desc: '大型採購' },
  { kg: 19, label: '19 kg', desc: '大型採購' },
  { kg: 20, label: '20 kg', desc: '大型採購' },
];

// ── 即時試算結果 ──
const result = computed(() => {
  if (!jpyPrice.value || jpyPrice.value <= 0) return null;

  const jpy = jpyPrice.value;
  const rate = jpyRate.value;
  const markup = getRateMarkup(jpy);
  const finalRate = rate + markup;
  const productTwd = Math.round(jpy * finalRate);

  const shipping = getShippingTwd(weightKg.value * 1000, rate);
  const domesticTwd = Math.round((domesticShippingJpy.value ?? 0) * rate);

  const subtotal = productTwd + shipping.costTwd + domesticTwd;
  const serviceFee = Math.round(subtotal * 0.05); // 服務費 5%
  const preTax = subtotal + serviceFee;
  const tax = Math.round(preTax * 0.05);
  const total = preTax + tax;

  return {
    productTwd,
    shippingTwd: shipping.costTwd,
    domesticTwd,
    serviceFee,
    tax,
    total,
  };
});

onMounted(() => fetchRate({ skipCache: true }));
</script>

<template>
  <div
    class="min-h-screen bg-[#F8F9F5] text-[#2C3E38] font-sans selection:bg-[#A8D5BA]/30"
  >
    <header class="pt-16 pb-8 px-6 text-center">
      <span
        class="text-[10px] tracking-[0.2em] font-bold text-[#689E8D] uppercase mb-2 block"
        >Premium Concierge</span
      >
      <h1 class="text-3xl font-light tracking-tight text-[#1E2B27]">
        洛姆日貨 <span class="font-bold text-[#4A7A6C]">價格試算</span>
      </h1>
      <div class="w-8 h-[2px] bg-[#4A7A6C] mx-auto mt-4"></div>
    </header>

    <main class="max-w-md mx-auto px-6 pb-12 space-y-8">
      <section class="space-y-6">
        <div class="group">
          <label
            class="text-[11px] font-bold tracking-widest text-[#8AA399] uppercase mb-2 block ml-1"
          >
            Product Price
          </label>
          <div
            class="relative transition-all duration-300 group-focus-within:transform group-focus-within:-translate-y-1"
          >
            <span
              class="absolute left-5 top-1/2 -translate-y-1/2 text-md text-[#4A7A6C]/50 font-light"
              >¥</span
            >
            <input
              v-model.number="jpyPrice"
              type="number"
              inputmode="numeric"
              placeholder="日幣商品總額(含稅)"
              class="w-full pl-12 pr-6 py-5 bg-white border border-[#E8F0E9] rounded-[2rem] text-md shadow-[0_10px_30px_-15px_rgba(74,122,108,0.1)] focus:outline-none focus:border-[#4A7A6C] focus:ring-0 transition-all placeholder:text-[#C0D0C9]"
            />
          </div>
        </div>

        <div class="group">
          <label
            class="text-[11px] font-bold tracking-widest text-[#8AA399] uppercase mb-2 block ml-1"
          >
            Domestic Shipping
          </label>
          <div
            class="relative transition-all duration-300 group-focus-within:transform group-focus-within:-translate-y-1"
          >
            <span
              class="absolute left-5 top-1/2 -translate-y-1/2 text-md text-[#4A7A6C]/50 font-light"
              >¥</span
            >
            <input
              v-model.number="domesticShippingJpy"
              type="number"
              inputmode="numeric"
              placeholder="日本國內運費（日幣，如無可不填）"
              class="w-full pl-12 pr-6 py-5 bg-white border border-[#E8F0E9] rounded-[2rem] text-md shadow-[0_10px_30px_-15px_rgba(74,122,108,0.1)] focus:outline-none focus:border-[#4A7A6C] focus:ring-0 transition-all placeholder:text-[#C0D0C9]"
            />
          </div>
        </div>

        <div class="group">
          <label
            class="text-[11px] font-bold tracking-widest text-[#8AA399] uppercase mb-2 block ml-1"
          >
            Estimated Weight
          </label>
          <select
            v-model="weightKg"
            class="w-full px-6 py-5 bg-white border border-[#E8F0E9] rounded-[2rem] text-base shadow-[0_10px_30px_-15px_rgba(74,122,108,0.1)] focus:outline-none focus:border-[#4A7A6C] appearance-none cursor-pointer"
          >
            <option v-for="opt in weightOptions" :key="opt.kg" :value="opt.kg">
              {{ opt.label }} —— {{ opt.desc }}
            </option>
          </select>
        </div>
      </section>

      <transition name="fade">
        <section
          v-if="result"
          class="bg-white rounded-[2.5rem] p-8 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)] border border-[#F1F4F2] relative overflow-hidden"
        >
          <div class="absolute top-0 left-0 w-full h-1.5 bg-[#4A7A6C]"></div>

          <h2
            class="text-xs font-bold tracking-[0.1em] text-[#8AA399] uppercase mb-6 text-center"
          >
            Cost Breakdown
          </h2>

          <div class="space-y-4">
            <div
              class="flex justify-between items-center text-sm border-b border-[#F1F4F2] pb-4"
            >
              <span class="text-[#8AA399]">商品預估售價</span>
              <span class="font-medium"
                >NT$ {{ result.productTwd.toLocaleString() }}</span
              >
            </div>

            <div
              class="flex justify-between items-center text-sm border-b border-[#F1F4F2] pb-4"
            >
              <span class="text-[#8AA399]">國際空運費用</span>
              <span class="font-medium"
                >NT$ {{ result.shippingTwd.toLocaleString() }}</span
              >
            </div>

            <div
              v-if="result.domesticTwd > 0"
              class="flex justify-between items-center text-sm border-b border-[#F1F4F2] pb-4"
            >
              <span class="text-[#8AA399]">日本國內運費</span>
              <span class="font-medium"
                >NT$ {{ result.domesticTwd.toLocaleString() }}</span
              >
            </div>

            <div
              class="flex justify-between items-center text-sm border-b border-[#F1F4F2] pb-4"
            >
              <span class="text-[#8AA399]">服務費 (5%)</span>
              <span class="font-medium"
                >NT$ {{ result.serviceFee.toLocaleString() }}</span
              >
            </div>

            <div class="flex justify-between items-center text-sm pb-4">
              <span class="text-[#8AA399]">消費稅 (5%)</span>
              <span class="font-medium"
                >NT$ {{ result.tax.toLocaleString() }}</span
              >
            </div>

            <div class="pt-6 mt-2">
              <div
                class="bg-[#4A7A6C] text-white rounded-[2rem] p-7 flex justify-between items-end shadow-xl"
              >
                <div>
                  <p
                    class="text-[10px] font-bold tracking-widest text-[#8AA399] uppercase mb-1"
                  >
                    Total Amount
                  </p>
                  <p class="text-sm font-light text-white/70">預估總計</p>
                </div>
                <div class="text-right">
                  <span class="text-3xl font-bold tracking-tight">
                    <span class="text-sm font-light mr-1">NT$</span
                    >{{ result.total.toLocaleString() }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </transition>

      <footer class="px-2">
        <div class="flex items-center space-x-2 mb-3">
          <div class="w-1 h-1 bg-[#4A7A6C] rounded-full"></div>
          <span
            class="text-[11px] font-bold tracking-widest text-[#4A5D59] uppercase"
            >Notices</span
          >
        </div>
        <ul class="text-[12px] text-[#8AA399] space-y-2 leading-relaxed">
          <li class="flex items-start">
            <span class="mr-2">・</span>
            此為預估金額，實際依日本結帳日幣金額、日本國內運費及材積重量等為準。
          </li>
          <li class="flex items-start">
            <span class="mr-2">・</span>
            匯率每日依玉山銀行公告更新，系統將自動調整報價。
          </li>
          <li class="flex items-start text-[#4A7A6C] font-medium">
            <span class="mr-2">・</span> 實際金額請以專人客服最後報價單為準。
          </li>
        </ul>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* 隱藏原生 Input 箭頭 */
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

/* 讓 Select 在手機上更好看 */
select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234A7A6C'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1.5rem center;
  background-size: 1rem;
}
</style>
