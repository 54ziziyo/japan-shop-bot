<script setup>
const props = defineProps({
  orderNo: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
  total: { type: Number, default: 0 },
});

defineEmits(['close']);

const BANK_NAME = '玉山銀行';
const BANK_CODE = '808';
const BANK_ACCOUNT = '0624940150560';
const BANK_ACCOUNT_NAME = '騎旅生活股份有限公司';

const copied = ref(false);
async function copyAccount() {
  await navigator.clipboard.writeText(BANK_ACCOUNT);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
  alert(`${BANK_NAME}：${BANK_CODE}
帳號：${BANK_ACCOUNT}
戶名：${BANK_ACCOUNT_NAME}

應轉帳金額：NT$${props.total.toLocaleString()}

已為您複製銀行帳號！`);
}
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
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm font-black uppercase tracking-[0.2em] text-[#5A746B]">
          ▍匯款資訊
        </p>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-[#D1E2D5] shadow-sm active:opacity-60 transition-opacity"
          :class="copied ? 'border-[#749D8E]' : ''"
          @click="copyAccount"
        >
          <svg
            v-if="!copied"
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#749D8E"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#749D8E"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>
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
