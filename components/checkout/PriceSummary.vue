<script setup>
defineProps({
  subtotalTwd: { type: Number, default: 0 },
  shippingInfo: { type: Object, required: true },
  totalWeight: { type: Number, default: 0 },
  displayServiceFee: { type: Number, default: 0 },
  hiddenSurcharge: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  displayTotal: { type: Number, default: 0 },
  paymentMethod: { type: String, default: '' },
  validItemCount: { type: Number, default: 0 },
});
</script>

<template>
  <div class="py-4 border-t border-[#E8F0E9]">
    <p
      class="text-[10px] font-black text-[#749D8E] uppercase tracking-widest mb-4 leading-none"
    >
      費用明細
    </p>
    <div class="space-y-2.5">
      <!-- 商品小計 -->
      <div class="flex justify-between items-center">
        <span class="text-[11px] text-[#749D8E] font-semibold">
          商品小計（{{ validItemCount }} 件）
        </span>
        <span class="text-sm font-bold text-[#5A746B]"
          >NT${{ subtotalTwd.toLocaleString() }}</span
        >
      </div>
      <!-- 運費 -->
      <div class="flex justify-between items-center">
        <span class="text-[11px] text-[#749D8E] font-semibold">
          運費
          <span class="text-[9px] text-[#A4B8B0] ml-1"
            >{{ shippingInfo.method }} ·
            {{ totalWeight.toLocaleString() }}g</span
          >
        </span>

        <span class="text-sm font-bold text-[#5A746B]"
          >NT${{ shippingInfo.costTwd.toLocaleString() }}</span
        >
      </div>
      <!-- 5% 營業稅 -->
      <div class="flex justify-between items-center">
        <span class="text-[11px] text-[#749D8E] font-semibold"
          >營業稅（5%）</span
        >
        <span class="text-sm font-bold text-[#5A746B]"
          >NT${{ taxAmount.toLocaleString() }}</span
        >
      </div>
      <!-- 服務費 -->
      <!-- <div class="flex justify-between items-center">
        <span class="text-[11px] text-[#749D8E] font-semibold">代購服務費</span>
        <span class="text-sm font-bold text-[#5A746B]"
          >NT${{ displayServiceFee.toLocaleString() }}</span
        >
      </div> -->
      <!-- 銀行轉帳折扣 -->
      <!-- <div
        v-if="paymentMethod === 'bank_transfer'"
        class="flex justify-between items-center text-[#749D8E]"
      >
        <span class="text-[11px] font-semibold">轉帳優惠折扣（-3%）</span>
        <span class="text-sm font-bold text-[#5A746B]"
          >-NT${{ hiddenSurcharge.toLocaleString() }}</span
        >
      </div> -->
      <!-- 分隔線 + 總計 -->
      <div
        class="flex justify-between items-end pt-3 mt-1 border-t border-[#E8F0E9]"
      >
        <div class="flex gap-2 items-baseline">
          <div class="text-sm font-black text-[#5A746B]">訂單總計</div>
        </div>
        <span
          class="text-3xl font-black tracking-tighter leading-none text-[#5A746B]"
        >
          <span class="text-sm">NT$</span>
          {{ displayTotal.toLocaleString() }}
        </span>
      </div>
    </div>
  </div>
</template>
