<script setup>
defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, required: true },
  lineName: { type: String, default: '' },
  hiddenSurcharge: { type: Number, default: 0 },
  hasPromoItems: { type: Boolean, default: false },
});

const BANK_NAME = '玉山銀行';
const BANK_CODE = '808';
const BANK_ACCOUNT = '0624940150560';
const BANK_ACCOUNT_NAME = '騎旅生活股份有限公司';

const copyAccount = () => {
  navigator.clipboard.writeText(BANK_ACCOUNT).then(() => {
    alert(`${BANK_NAME}：${BANK_CODE}
帳號：${BANK_ACCOUNT} 
戶名：${BANK_ACCOUNT_NAME}

已為您複製銀行帳號！`);
  });
};
</script>

<template>
  <div>
    <!-- ── Customer Info Form ── -->
    <p
      class="text-xl font-black text-[#5A746B] border-t border-[#E8F0E9] pt-8 mb-4"
    >
      ▍收件資訊
    </p>
    <div class="space-y-4">
      <!-- LINE 名稱 (唯讀) -->
      <div>
        <label
          class="text-[10px] font-bold text-[#749D8E] uppercase tracking-wider block mb-1.5"
          >LINE 名稱</label
        >
        <div
          class="w-full border border-[#E8F0E9] rounded-2xl px-4 py-3 text-sm font-medium bg-[#F4F9F5] text-[#749D8E]"
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
          class="text-[10px] font-bold text-[#749D8E] uppercase tracking-wider block mb-1.5"
          >收件人</label
        >
        <input
          v-model="form.name"
          type="text"
          :class="[
            'w-full text-[#4A5D59] border rounded-2xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all',
            errors.name
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
              : 'border-[#E8F0E9] focus:border-[#749D8E] focus:ring-[#749D8E]/10',
          ]"
          placeholder="請填寫真實姓名（嚴禁暱稱），以免配送失敗"
        />
        <p
          v-if="errors.name"
          class="text-[10px] text-red-500 font-semibold mt-1"
        >
          {{ errors.name }}
        </p>
      </div>

      <!-- 手機號碼 -->
      <div>
        <label
          class="text-[10px] font-bold text-[#749D8E] uppercase tracking-wider block mb-1.5"
          >手機號碼</label
        >
        <input
          v-model="form.phone"
          type="tel"
          inputmode="numeric"
          maxlength="10"
          :class="[
            'w-full text-[#4A5D59] border rounded-2xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all',
            errors.phone
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
              : 'border-[#E8F0E9] focus:border-[#749D8E] focus:ring-[#749D8E]/10',
          ]"
          placeholder="0912345678"
        />
        <p
          v-if="errors.phone"
          class="text-[10px] text-red-500 font-semibold mt-1"
        >
          {{ errors.phone }}
        </p>
      </div>

      <!-- 地址 -->
      <div>
        <label
          class="text-[10px] font-bold text-[#749D8E] uppercase tracking-wider block mb-1.5"
          >台灣收件地址</label
        >
        <input
          v-model="form.address"
          type="text"
          :class="[
            'w-full text-[#4A5D59] border rounded-2xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all',
            errors.address
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
              : 'border-[#E8F0E9] focus:border-[#749D8E] focus:ring-[#749D8E]/10',
          ]"
          placeholder="地址請務必填寫正確，配送失敗需自行負擔"
        />
        <p
          v-if="errors.address"
          class="text-[10px] text-red-500 font-semibold mt-1"
        >
          {{ errors.address }}
        </p>
        <p v-else class="text-[10px] text-[#749D8E] mt-1">
          例：台北市大安區忠孝東路四段123號5樓
        </p>
      </div>

      <!-- 電子信箱（電子發票用） -->
      <div>
        <label
          class="text-[10px] font-bold text-[#749D8E] uppercase tracking-wider block mb-1.5"
          >電子信箱</label
        >
        <input
          v-model="form.email"
          type="email"
          inputmode="email"
          :class="[
            'w-full text-[#4A5D59] border rounded-2xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all',
            errors.email
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
              : 'border-[#E8F0E9] focus:border-[#749D8E] focus:ring-[#749D8E]/10',
          ]"
          placeholder="example@email.com"
        />
        <p
          v-if="errors.email"
          class="text-[10px] text-red-500 font-semibold mt-1"
        >
          {{ errors.email }}
        </p>
        <p v-else class="text-[10px] text-[#749D8E] mt-1">用於寄送電子發票</p>
      </div>

      <!-- 支付方式 -->
      <div>
        <label
          class="text-[10px] font-bold text-[#749D8E] uppercase tracking-wider block mb-3"
          >支付方式</label
        >
        <div class="space-y-3">
          <!-- <label
            class="flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all"
            :class="form.paymentMethod === 'ecpay' ? 'border-[#749D8E] bg-[#749D8E]/5' : 'border-[#E8F0E9] bg-white'"
          >
            <input type="radio" v-model="form.paymentMethod" value="ecpay" class="mt-0.5 accent-[#749D8E]" />
            <div>
              <p class="text-sm font-bold leading-tight text-[#4A5D59]">綠界付款</p>
              <p class="text-[10px] text-[#A4B8B0] mt-0.5">Visa / Mastercard 信用卡付款</p>
            </div>
          </label> -->
          <label
            class="flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all"
            :class="
              form.paymentMethod === 'bank_transfer'
                ? 'border-[#749D8E] bg-[#749D8E]/5'
                : 'border-[#E8F0E9] bg-white'
            "
          >
            <input
              type="radio"
              v-model="form.paymentMethod"
              value="bank_transfer"
              class="mt-0.5 accent-[#749D8E]"
            />
            <div>
              <p class="text-sm font-bold leading-tight text-[#4A5D59]">
                銀行轉帳
              </p>
              <p class="text-[10px] text-[#A4B8B0] mt-0.5">
                直接轉帳至指定帳戶
                <!-- <span class="text-[#749D8E] font-bold"
                  >，享 3% 優惠，省 NT${{
                    hiddenSurcharge.toLocaleString()
                  }}</span> -->
              </p>
            </div>
          </label>
        </div>
      </div>

      <!-- 銀行轉帳：帳號末五碼 -->
      <div v-if="form.paymentMethod === 'bank_transfer'" class="space-y-2">
        <label
          class="text-[10px] font-bold text-[#A4B8B0] uppercase tracking-wider block"
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
            'w-full border rounded-2xl px-4 py-3 text-sm font-medium bg-white focus:outline-none focus:ring-1 transition-all text-[#4A5D59]',
            errors.accountLast5
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
              : 'border-[#E8F0E9] focus:border-[#749D8E] focus:ring-[#749D8E]/10',
          ]"
          placeholder="請輸入帳號末五碼，以便核對入帳"
        />
        <p
          v-if="errors.accountLast5"
          class="text-[9px] text-red-500 font-semibold mt-1"
        >
          {{ errors.accountLast5 }}
        </p>

        <!-- 銀行轉帳資訊框 -->
        <div
          class="relative bg-red-50/80 border border-red-100 rounded-[2rem] p-5 cursor-pointer hover:bg-white hover:shadow-xl hover:shadow-red-500/5 transition-all duration-500 group overflow-hidden mt-5"
          @click="copyAccount"
        >
          <div
            class="absolute -top-10 -right-10 w-32 h-32 bg-red-100/40 rounded-full blur-3xl"
          ></div>

          <div
            class="absolute top-4 right-4 flex items-center justify-center bg-white border border-red-100 w-9 h-9 rounded-xl text-red-500 shadow-sm group-hover:bg-red-500 group-hover:text-white group-hover:border-red-500 transition-all duration-300"
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
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path
                d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
              ></path>
            </svg>
          </div>

          <div class="flex items-center gap-2 mb-3">
            <p
              class="text-sm font-black uppercase tracking-[0.2em] text-red-500"
            >
              ▍匯款資訊
            </p>
          </div>

          <div class="space-y-4">
            <div class="flex flex-col gap-2">
              <span class="text-[10px] font-black text-red-300 tracking-wider"
                >銀行名稱</span
              >
              <p
                class="text-[14px] font-black text-red-800 tracking-tight leading-tight"
              >
                {{ BANK_NAME }} ({{ BANK_CODE }})
              </p>
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-[10px] font-black text-red-300 tracking-wider"
                >銀行戶名</span
              >
              <p
                class="text-[14px] font-black text-red-800 tracking-tight leading-tight"
              >
                {{ BANK_ACCOUNT_NAME }}
              </p>
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-[10px] font-black text-red-300 tracking-wider"
                >匯款帳號</span
              >
              <div
                class="w-full bg-white/60 border border-red-100 rounded-2xl py-3 flex flex-col items-center justify-center shadow-inner group-hover:border-red-300 transition-colors"
              >
                <span
                  class="text-[20px] font-black font-mono tracking-[0.05em] text-red-800"
                >
                  {{ BANK_ACCOUNT }}
                </span>
                <span class="text-[9px] font-bold text-red-300"
                  >點擊區域即可自動複製</span
                >
              </div>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-red-100/50">
            <p
              class="text-[12px] font-bold text-red-600 text-center leading-relaxed"
            >
              ⚡ 訂單依據『匯款先後順序』安排出貨
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="hasPromoItems"
        class="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
      >
        <p class="text-[10px] text-amber-700 font-semibold leading-relaxed">
          ⏰ 請注意特價商品截止時間，系統於每日 22:00 統一採購。<br />
          請儘早下單以免錯過特價或庫存，若遇價格恢復原價需補足差額。
        </p>
      </div>
    </div>
  </div>
</template>
