<script setup lang="ts">
import { getShippingTwd } from '#shared/shipping';
import { getRateMarkup } from '#shared/pricing';

const { rate: jpyRate, loading: rateLoading, fetchRate } = useExchangeRate();

const jpyPrice = ref<number | null>(null);
const weightGrams = ref(2000);
const domesticShippingJpy = ref<number | null>(null);

// ── 重量選項 ──
const ePacketWeights = [500, 1000, 1500, 2000];
const intlWeights = [
  3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 15000, 20000, 25000, 30000,
];

const kgLabel = (g: number) => {
  const kg = g / 1000;
  return kg % 1 === 0 ? `${kg} kg` : `${kg.toFixed(1)} kg`;
};

const shippingForWeight = (grams: number) =>
  getShippingTwd(grams, jpyRate.value);

// ── 即時試算結果 ──
const result = computed(() => {
  if (!jpyPrice.value || jpyPrice.value <= 0) return null;

  const jpy = jpyPrice.value;
  const rate = jpyRate.value;
  const markup = getRateMarkup(jpy);
  const markupPct = +(markup * 100).toFixed(2);
  const finalRate = rate + markup;
  const productTwd = Math.round(jpy * finalRate);

  const shipping = getShippingTwd(weightGrams.value, rate);
  const domesticJpy = domesticShippingJpy.value ?? 0;
  const domesticTwd = Math.round(domesticJpy * rate);

  const subtotal = productTwd + shipping.costTwd + domesticTwd;
  const serviceFee = Math.round(subtotal * 0.05); // 服務費 5%
  const preTax = subtotal + serviceFee;
  const tax = Math.round(preTax * 0.05); // 消費稅 5%
  const total = preTax + tax;

  return {
    rate,
    markup,
    markupPct,
    finalRate,
    productTwd,
    shippingMethod: shipping.method,
    shippingJpy: shipping.costJpy,
    shippingTwd: shipping.costTwd,
    domesticJpy,
    domesticTwd,
    subtotal,
    serviceFee,
    preTax,
    tax,
    total,
  };
});

onMounted(() => fetchRate({ skipCache: true }));
</script>

<template>
  <div class="min-h-screen bg-[#FDFCF8] text-[#4A5D59] font-sans antialiased">
    <!-- Header -->
    <div
      class="bg-gradient-to-br from-[#E8F0E9] to-[#F4F9F5] px-6 pt-12 pb-6 text-center"
    >
      <h1 class="text-2xl font-bold text-[#2D5A3D]">代購價格試算</h1>
      <p class="text-sm text-[#6B8F7B] mt-2">日本 🇯🇵 → 台灣 🇹🇼</p>
      <p v-if="!rateLoading" class="text-xs text-[#6B8F7B]/70 mt-1">
        即時匯率：{{ jpyRate.toFixed(4) }}（玉山銀行現金賣出）
      </p>
      <p v-else class="text-xs text-[#6B8F7B]/70 mt-1">匯率載入中…</p>
    </div>

    <div class="max-w-lg mx-auto px-5 py-6 space-y-5">
      <!-- 日幣商品總金額輸入 -->
      <div>
        <label class="block text-sm font-semibold mb-2"
          >日幣商品總額(含稅)</label
        >
        <div class="relative">
          <span
            class="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[#6B8F7B] font-medium"
            >¥</span
          >
          <input
            v-model.number="jpyPrice"
            type="number"
            inputmode="numeric"
            placeholder="例如 1990"
            class="w-full pl-10 pr-4 py-3.5 bg-white border-2 border-[#E8F0E9] rounded-2xl text-lg focus:outline-none focus:border-[#A8D5BA] focus:ring-2 focus:ring-[#A8D5BA]/20 transition-all"
          />
        </div>
      </div>

      <!-- 重量選擇 -->
      <div>
        <label class="block text-sm font-semibold mb-2">預估商品總重量</label>
        <select
          v-model="weightGrams"
          class="w-full px-4 py-3.5 bg-white border-2 border-[#E8F0E9] rounded-2xl text-base focus:outline-none focus:border-[#A8D5BA] focus:ring-2 focus:ring-[#A8D5BA]/20 transition-all"
        >
          <optgroup label="📦 ePacket（航空小包・≤ 2kg）">
            <option v-for="w in ePacketWeights" :key="w" :value="w">
              {{ kgLabel(w) }} — 運費 ¥{{
                shippingForWeight(w).costJpy.toLocaleString()
              }}（≈NT${{ shippingForWeight(w).costTwd.toLocaleString() }}）
            </option>
          </optgroup>
          <optgroup label="📦 國際小包（> 2kg）">
            <option v-for="w in intlWeights" :key="w" :value="w">
              {{ kgLabel(w) }} — 運費 ¥{{
                shippingForWeight(w).costJpy.toLocaleString()
              }}（≈NT${{ shippingForWeight(w).costTwd.toLocaleString() }}）
            </option>
          </optgroup>
        </select>
      </div>

      <!-- 日本國內運費 -->
      <div>
        <label class="block text-sm font-semibold mb-2"
          >日本國內運費（日幣）</label
        >
        <div class="relative">
          <span
            class="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[#6B8F7B] font-medium"
            >¥</span
          >
          <input
            v-model.number="domesticShippingJpy"
            type="number"
            inputmode="numeric"
            placeholder="如無可不填"
            class="w-full pl-10 pr-4 py-3.5 bg-white border-2 border-[#E8F0E9] rounded-2xl text-lg focus:outline-none focus:border-[#A8D5BA] focus:ring-2 focus:ring-[#A8D5BA]/20 transition-all"
          />
        </div>
      </div>

      <!-- 試算結果 -->
      <div
        v-if="result"
        class="bg-white rounded-3xl p-5 border border-[#E8F0E9] shadow-sm space-y-3"
      >
        <h2 class="font-bold text-lg text-[#2D5A3D]">試算結果</h2>

        <div class="space-y-2.5 text-sm">
          <!-- 商品售價 -->
          <div
            class="flex justify-between items-start py-2.5 px-3.5 bg-[#F4F9F5] rounded-xl"
          >
            <div>
              <div class="font-medium">商品售價</div>
              <div class="text-xs text-[#6B8F7B] mt-0.5">
                ¥{{ jpyPrice!.toLocaleString() }} ×
                {{ result.finalRate.toFixed(4) }}
                <span class="block"
                  >（匯率 {{ result.rate.toFixed(4) }} + 加碼
                  {{ result.markupPct }}%）</span
                >
              </div>
            </div>
            <div class="font-semibold whitespace-nowrap ml-3">
              NT${{ result.productTwd.toLocaleString() }}
            </div>
          </div>

          <!-- 國際運費 -->
          <div
            class="flex justify-between items-start py-2.5 px-3.5 bg-[#F4F9F5] rounded-xl"
          >
            <div>
              <div class="font-medium">國際運費</div>
              <div class="text-xs text-[#6B8F7B] mt-0.5">
                {{ result.shippingMethod }}・¥{{
                  result.shippingJpy.toLocaleString()
                }}
              </div>
            </div>
            <div class="font-semibold whitespace-nowrap ml-3">
              NT${{ result.shippingTwd.toLocaleString() }}
            </div>
          </div>

          <!-- 日本國內運費 -->
          <div
            v-if="result.domesticTwd > 0"
            class="flex justify-between items-start py-2.5 px-3.5 bg-[#F4F9F5] rounded-xl"
          >
            <div>
              <div class="font-medium">日本國內運費</div>
              <div class="text-xs text-[#6B8F7B] mt-0.5">
                ¥{{ result.domesticJpy.toLocaleString() }}
              </div>
            </div>
            <div class="font-semibold whitespace-nowrap ml-3">
              NT${{ result.domesticTwd.toLocaleString() }}
            </div>
          </div>

          <!-- 小計 / 服務費 / 稅 -->
          <div class="border-t border-[#E8F0E9] pt-2.5 space-y-1">
            <div class="flex justify-between py-1 px-3.5">
              <span class="text-[#6B8F7B]">小計</span>
              <span class="font-medium"
                >NT${{ result.subtotal.toLocaleString() }}</span
              >
            </div>
            <div class="flex justify-between py-1 px-3.5">
              <span class="text-[#6B8F7B]">服務費（1%）</span>
              <span class="font-medium"
                >NT${{ result.serviceFee.toLocaleString() }}</span
              >
            </div>
            <div class="flex justify-between py-1 px-3.5">
              <span class="text-[#6B8F7B]">消費稅（5%）</span>
              <span class="font-medium"
                >NT${{ result.tax.toLocaleString() }}</span
              >
            </div>
          </div>

          <!-- 預估總計 -->
          <div
            class="bg-[#2D5A3D] text-white rounded-2xl p-4 flex justify-between items-center"
          >
            <span class="font-bold text-base">預估總計</span>
            <span class="font-bold text-2xl tracking-tight"
              >NT${{ result.total.toLocaleString() }}</span
            >
          </div>
        </div>
      </div>

      <!-- 注意事項 + 加碼說明 -->
      <div
        class="bg-white rounded-2xl p-4 border border-[#E8F0E9] text-xs text-[#6B8F7B] space-y-3"
      >
        <div>
          <p class="font-semibold text-[#4A5D59] mb-1">⚠️ 注意事項</p>
          <p>
            此為預估金額，因可能有日本國內運費、材積重量等考量，實際金額以專人客服報價為主。
          </p>
          <p class="mt-1">運費路線：日本 → 台灣（目前尚未提供其他國家運費）</p>
        </div>
        <div>
          <p class="font-semibold text-[#4A5D59] mb-1">📋 加碼比例說明</p>
          <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 ml-1">
            <span>≤ ¥990</span><span class="text-right">+7%</span>
            <span>≤ ¥1,990</span><span class="text-right">+6%</span>
            <span>≤ ¥2,990</span><span class="text-right">+2.89%</span>
            <span>≤ ¥3,990</span><span class="text-right">+2.5%</span>
            <span>≤ ¥4,990</span><span class="text-right">+2.3%</span>
            <span>≤ ¥5,990</span><span class="text-right">+2.2%</span>
            <span>¥6,000+</span><span class="text-right">+2%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 隱藏 number input 的 +/- 按鈕 */
input[type='number']::-webkit-outer-spin-button,
input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
