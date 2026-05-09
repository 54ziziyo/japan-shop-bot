<script setup>
// 員工折扣碼管理後台
// 需在 Vercel 環境變數設定 ADMIN_SECRET
import {
  formatCouponDiscountSummary,
  parseCouponTierRules,
} from '#shared/coupons';

useHead({ title: '折扣碼管理' });

const adminSecret = ref('');
const authenticated = ref(false);
const authError = ref('');
const authLoading = ref(false);

const coupons = ref([]);
const listLoading = ref(false);

const form = ref({
  code: '',
  discountTwd: '',
  totalQuantity: '1',
  expiresAt: '',
  perUserLimit: true,
  discountRulesJson: '',
});
const formError = ref('');
const formSuccess = ref('');
const submitting = ref(false);

const authenticate = async () => {
  if (!adminSecret.value.trim()) {
    authError.value = '請輸入管理密碼';
    return;
  }
  authLoading.value = true;
  authError.value = '';
  try {
    const res = await $fetch('/api/admin/coupons', {
      headers: { 'x-admin-secret': adminSecret.value },
    });
    coupons.value = res.coupons;
    authenticated.value = true;
  } catch {
    authError.value = '密碼錯誤或發生錯誤，請再試一次';
  } finally {
    authLoading.value = false;
  }
};

const loadCoupons = async () => {
  listLoading.value = true;
  try {
    const res = await $fetch('/api/admin/coupons', {
      headers: { 'x-admin-secret': adminSecret.value },
    });
    coupons.value = res.coupons;
  } finally {
    listLoading.value = false;
  }
};

const createCoupon = async () => {
  formError.value = '';
  formSuccess.value = '';
  const discount = Number(form.value.discountTwd);
  const qty = Number(form.value.totalQuantity);
  const discountRulesText = form.value.discountRulesJson.trim();
  let discountRules = [];

  if (!form.value.code.trim()) {
    formError.value = '請輸入折扣碼代碼';
    return;
  }
  if (discountRulesText) {
    try {
      discountRules = parseCouponTierRules(JSON.parse(discountRulesText));
    } catch {
      formError.value = '件數折扣規則 JSON 格式不正確';
      return;
    }
    if (!discountRules.length) {
      formError.value = '請至少輸入一組有效的件數折扣規則';
      return;
    }
  } else if (!discount || discount <= 0) {
    formError.value = '折扣金額需大於 0';
    return;
  }
  if (!qty || qty <= 0 || !Number.isInteger(qty)) {
    formError.value = '發行數量需為正整數';
    return;
  }

  submitting.value = true;
  try {
    const created = await $fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'x-admin-secret': adminSecret.value },
      body: {
        code: form.value.code.trim().toUpperCase(),
        discountTwd: discountRules.length ? 0 : discount,
        discountRules: discountRules.length ? discountRules : null,
        totalQuantity: qty,
        expiresAt: form.value.expiresAt || null,
        perUserLimit: form.value.perUserLimit,
      },
    });
    formSuccess.value = `折扣碼 ${created.coupon.code} 建立成功！`;
    form.value = {
      code: '',
      discountTwd: '',
      totalQuantity: '1',
      expiresAt: '',
      perUserLimit: true,
      discountRulesJson: '',
    };
    await loadCoupons();
  } catch (err) {
    formError.value = err.data?.statusMessage || '建立失敗，請再試一次';
  } finally {
    submitting.value = false;
  }
};

const toggleCoupon = async (coupon) => {
  try {
    await $fetch('/api/admin/coupon-toggle', {
      method: 'POST',
      headers: { 'x-admin-secret': adminSecret.value },
      body: { id: coupon.id, isActive: !coupon.is_active },
    });
    await loadCoupons();
  } catch {
    alert('更新失敗，請再試一次');
  }
};

const deleteCoupon = async (coupon) => {
  if (!confirm(`確定要刪除折扣碼「${coupon.code}」嗎？此操作無法復原。`))
    return;
  try {
    await $fetch('/api/admin/coupon-delete', {
      method: 'POST',
      headers: { 'x-admin-secret': adminSecret.value },
      body: { id: coupon.id, code: coupon.code },
    });
    await loadCoupons();
  } catch {
    alert('刪除失敗，請再試一次');
  }
};

const formatDate = (str) => {
  if (!str) return '-';
  return new Date(str).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatExpiry = (str) => {
  if (!str) return null;
  const d = new Date(str);
  const isExpired = d < new Date();
  return { text: formatDate(str), expired: isExpired };
};
</script>

<template>
  <div class="min-h-screen bg-[#FDFCF8] text-[#4A5D59] font-sans p-6">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-xl font-black text-[#4A5D59] tracking-wide mb-8">
        🏷️ 折扣碼管理
      </h1>

      <!-- 驗證 -->
      <div
        v-if="!authenticated"
        class="bg-white rounded-3xl p-6 shadow-sm border border-[#E8F0E9] mb-6"
      >
        <p class="text-sm font-bold text-[#5A746B] mb-4">請輸入管理密碼</p>
        <div class="flex gap-3">
          <input
            v-model="adminSecret"
            type="password"
            placeholder="管理密碼"
            class="flex-1 px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E]"
            @keyup.enter="authenticate"
          />
          <button
            :disabled="authLoading"
            class="px-5 py-2.5 text-sm font-bold bg-[#749D8E] text-white rounded-2xl disabled:opacity-40"
            @click="authenticate"
          >
            {{ authLoading ? '確認中...' : '登入' }}
          </button>
        </div>
        <p v-if="authError" class="text-xs text-red-500 mt-2">
          {{ authError }}
        </p>
      </div>

      <template v-else>
        <!-- 新增折扣碼 -->
        <div
          class="bg-white rounded-3xl p-6 shadow-sm border border-[#E8F0E9] mb-6"
        >
          <p
            class="text-[10px] font-black text-[#749D8E] uppercase tracking-widest mb-4"
          >
            新增折扣碼
          </p>
          <div class="space-y-3">
            <div>
              <label class="text-xs font-semibold text-[#5A746B] block mb-1"
                >折扣碼代碼</label
              >
              <input
                v-model="form.code"
                type="text"
                placeholder="e.g. WELCOME100"
                class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E] uppercase"
              />
            </div>
            <div class="flex gap-3">
              <div class="flex-1">
                <label class="text-xs font-semibold text-[#5A746B] block mb-1"
                  >折扣金額（台幣）</label
                >
                <input
                  v-model="form.discountTwd"
                  type="number"
                  placeholder="e.g. 100"
                  min="1"
                  class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E]"
                />
              </div>
              <div class="flex-1">
                <label class="text-xs font-semibold text-[#5A746B] block mb-1"
                  >發行數量（張）</label
                >
                <input
                  v-model="form.totalQuantity"
                  type="number"
                  placeholder="e.g. 10"
                  min="1"
                  step="1"
                  class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E]"
                />
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold text-[#5A746B] block mb-1"
                >件數折扣規則 JSON（留空代表固定折扣）</label
              >
              <textarea
                v-model="form.discountRulesJson"
                rows="4"
                placeholder='[{"minItems":3,"discountTwd":100},{"minItems":5,"discountTwd":300},{"minItems":8,"discountTwd":500}]'
                class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E] font-mono"
              />
              <p class="text-[10px] text-[#A4B8B0] mt-1 leading-relaxed">
                格式範例：[{"minItems":3,"discountTwd":100}]。
                只要有填入 JSON，系統就會依件數門檻套用折扣。
              </p>
            </div>
            <div>
              <label class="text-xs font-semibold text-[#5A746B] block mb-1"
                >到期時間（不填則永不過期）</label
              >
              <input
                v-model="form.expiresAt"
                type="datetime-local"
                class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E]"
              />
            </div>
            <!-- 每人限用一次 -->
            <label
              class="flex items-center gap-3 cursor-pointer select-none py-1"
            >
              <span
                :class="[
                  'flex-shrink-0 w-10 h-6 rounded-full transition-colors relative',
                  form.perUserLimit ? 'bg-[#749D8E]' : 'bg-[#D4E2DA]',
                ]"
                @click="form.perUserLimit = !form.perUserLimit"
              >
                <span
                  :class="[
                    'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    form.perUserLimit ? 'translate-x-5' : 'translate-x-1',
                  ]"
                />
              </span>
              <span class="text-xs font-semibold text-[#5A746B]">
                每人限用一次
                <span class="text-[#A4B8B0] font-normal ml-1"
                  >（關閉後同一人可重複使用）</span
                >
              </span>
            </label>
          </div>
          <p v-if="formError" class="text-xs text-red-500 mt-3">
            {{ formError }}
          </p>
          <p
            v-if="formSuccess"
            class="text-xs text-[#749D8E] font-semibold mt-3"
          >
            {{ formSuccess }}
          </p>
          <button
            :disabled="submitting"
            class="mt-4 w-full py-3 text-sm font-bold bg-[#749D8E] text-white rounded-2xl disabled:opacity-40"
            @click="createCoupon"
          >
            {{ submitting ? '建立中...' : '＋ 新增折扣碼' }}
          </button>
        </div>

        <!-- 折扣碼列表 -->
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-[#E8F0E9]">
          <div class="flex items-center justify-between mb-4">
            <p
              class="text-[10px] font-black text-[#749D8E] uppercase tracking-widest"
            >
              現有折扣碼
            </p>
            <button
              class="text-xs text-[#749D8E] font-semibold"
              @click="loadCoupons"
            >
              重新整理
            </button>
          </div>
          <div
            v-if="listLoading"
            class="text-xs text-[#A4B8B0] text-center py-4"
          >
            載入中...
          </div>
          <div
            v-else-if="!coupons.length"
            class="text-xs text-[#A4B8B0] text-center py-4"
          >
            尚無折扣碼
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="c in coupons"
              :key="c.id"
              class="flex items-center justify-between p-4 rounded-2xl border transition-opacity"
              :class="
                c.is_active
                  ? 'border-[#D4E2DA] bg-[#F9FDFB]'
                  : 'border-[#E8E8E8] bg-[#F8F8F8] opacity-50'
              "
            >
              <div>
                <p class="text-sm font-black text-[#4A5D59] tracking-widest">
                  {{ c.code }}
                </p>
                <p class="text-xs text-[#749D8E] mt-0.5">
                  {{ formatCouponDiscountSummary(c) }} · 已用
                  {{ c.used_count }} / {{ c.total_quantity }} 張
                  <span
                    class="ml-1"
                    :class="
                      c.per_user_limit ? 'text-[#A4B8B0]' : 'text-amber-500'
                    "
                    >·
                    {{ c.per_user_limit ? '每人限用一次' : '可重複使用' }}
                  </span>
                </p>
                <p
                  class="text-[10px] mt-0.5"
                  :class="
                    formatExpiry(c.expires_at)?.expired
                      ? 'text-red-400 font-semibold'
                      : 'text-[#A4B8B0]'
                  "
                >
                  <template v-if="c.expires_at">
                    {{
                      formatExpiry(c.expires_at)?.expired ? '已過期 ' : '到期 '
                    }}{{ formatDate(c.expires_at) }}
                  </template>
                  <template v-else>永不過期</template>
                  · 建立於 {{ formatDate(c.created_at) }}
                </p>
              </div>
              <div class="flex flex-col gap-1.5">
                <button
                  class="text-xs font-bold px-3 py-1.5 rounded-xl"
                  :class="
                    c.is_active
                      ? 'bg-[#F0E8E8] text-[#A05050]'
                      : 'bg-[#E8F0E9] text-[#749D8E]'
                  "
                  @click="toggleCoupon(c)"
                >
                  {{ c.is_active ? '停用' : '啟用' }}
                </button>
                <button
                  class="text-xs font-bold px-3 py-1.5 rounded-xl bg-red-500 text-white"
                  @click="deleteCoupon(c)"
                >
                  刪除
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
