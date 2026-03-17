<script setup>
defineProps({
  orderNo: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
  total: { type: Number, default: 0 },
});

defineEmits(['close']);

const BANK_NAME = '玉山銀行';
const BANK_CODE = '808';
const BANK_ACCOUNT = '0624940150560';
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <div
      class="w-16 h-16 bg-[#E8F0E9] rounded-full flex items-center justify-center mb-6 shadow-lg shadow-[#749D8E]/10"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#749D8E"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </div>
    <h2 class="text-xl font-black tracking-tight mb-1 text-[#5A746B]">
      訂單已提交！
    </h2>
    <p v-if="orderNo" class="text-xs text-[#A4B8B0] font-mono mb-6">
      #{{ orderNo }}
    </p>

    <!-- 銀行轉帳提示 -->
    <div
      v-if="paymentMethod === 'bank_transfer'"
      class="w-full max-w-xs bg-[#F4F9F5] border border-[#D1E2D5] rounded-3xl px-5 py-4 mb-6 text-left"
    >
      <p
        class="text-[10px] font-black text-[#A4B8B0] uppercase tracking-widest mb-3"
      >
        匯款資訊
      </p>
      <div class="space-y-4">
        <div class="flex justify-between">
          <span class="text-xs text-[#A4B8B0]">銀行</span>
          <span class="text-xs font-bold text-[#5A746B]"
            >{{ BANK_NAME }}{{ BANK_CODE }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-xs text-[#A4B8B0]">帳號</span>
          <span
            class="text-sm font-black font-mono tracking-wider text-[#5A746B]"
            >{{ BANK_ACCOUNT }}</span
          >
        </div>
        <div class="flex justify-between border-t border-[#D1E2D5] pt-2 mt-2">
          <span class="text-xs text-[#A4B8B0]">轉帳金額</span>
          <span class="text-sm font-black text-[#5A746B]"
            >NT${{ total.toLocaleString() }}</span
          >
        </div>
      </div>
    </div>

    <p
      v-if="paymentMethod === 'bank_transfer'"
      class="text-sm font-bold text-red-500 mb-2"
    >
      請於三天內完成轉帳，逾期將自動取消訂單<br />若已完成轉帳請忽略此訊息
    </p>
    <p class="text-sm text-[#749D8E] leading-relaxed mb-8 max-w-xs font-medium">
      ⚠️ 請留意 LINE 訊息通知
    </p>

    <button
      class="text-xs font-bold text-[#749D8E] hover:text-[#5A746B] transition-all border-b-2 border-[#749D8E] pb-1 uppercase tracking-widest"
      @click="$emit('close')"
    >
      返回官方帳號
    </button>
  </div>
</template>
