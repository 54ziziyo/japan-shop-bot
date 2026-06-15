<script setup>
// 員工折扣碼管理後台
// 需在 Vercel 環境變數設定 ADMIN_SECRET
import { formatCouponAdminSummary } from '#shared/coupons';

useHead({ title: '折扣碼管理' });

const adminSecret = ref('');
const authenticated = ref(false);
const authError = ref('');
const authLoading = ref(false);
// 連試鎖定：連續錯誤 3 次後鎖定 60 秒
const loginAttempts = ref(0);
const lockedUntil = ref(0);
const lockRemaining = ref(0);
let lockTimer = null;

function startLockCountdown() {
  lockRemaining.value = Math.ceil((lockedUntil.value - Date.now()) / 1000);
  lockTimer = setInterval(() => {
    lockRemaining.value = Math.ceil((lockedUntil.value - Date.now()) / 1000);
    if (lockRemaining.value <= 0) {
      clearInterval(lockTimer);
      lockTimer = null;
      lockRemaining.value = 0;
    }
  }, 1000);
}

const coupons = ref([]);
const listLoading = ref(false);

const partnerCommissions = ref([]);
const commissionsLoading = ref(false);

const couponMode = ref('fixed'); // 'fixed' | 'tiered'

// 計算安全警示：折扣 + 分潤是否可能超過最低利潤保護
const tierRulesWarning = computed(() => {
  if (couponMode.value !== 'tiered') return null;
  for (const rule of form.value.tierRules) {
    const minItems = Number(rule.minItems);
    const discountTwd = Number(rule.discountTwd);
    const commissionTwd = Number(rule.commissionTwd) || 0;
    if (!minItems || !discountTwd) continue;
    const totalCost = discountTwd + commissionTwd;
    const minSafeProfit = minItems * 100;
    if (totalCost >= minSafeProfit) {
      return `⚠️ 安全警示：${minItems} 件規則折扣 NT$${discountTwd} + 分潤 NT$${commissionTwd} = NT$${totalCost}，若客人全買最低利潤商品（每件最低賺 NT$100），此規則會導致虧損（最低保護利潤 NT$${minSafeProfit}）。建議折扣 + 分潤 < ${minItems} × 100。`;
    }
  }
  return null;
});

const form = ref({
  code: '',
  partnerName: '',
  discountTwd: '',
  commissionTwd: '',
  totalQuantity: '1',
  expiresAt: '',
  perUserLimit: true,
  tierRules: [],
});

function setTieredMode() {
  couponMode.value = 'tiered';
  if (form.value.tierRules.length === 0) {
    form.value.tierRules.push({ minItems: '', discountTwd: '', commissionTwd: '' });
  }
}

function addTierRule() {
  form.value.tierRules.push({ minItems: '', discountTwd: '', commissionTwd: '' });
}

function removeTierRule(idx) {
  form.value.tierRules.splice(idx, 1);
}
const formError = ref('');
const formSuccess = ref('');
const submitting = ref(false);

const authenticate = async () => {
  if (lockRemaining.value > 0) {
    authError.value = `已鎖定，請等待 ${lockRemaining.value} 秒後再試`;
    return;
  }
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
    loginAttempts.value = 0;
    await loadPartnerCommissions();
  } catch {
    loginAttempts.value++;
    if (loginAttempts.value >= 3) {
      lockedUntil.value = Date.now() + 60_000;
      loginAttempts.value = 0;
      startLockCountdown();
      authError.value = '密碼錯誤次數過多，已鎖定 60 秒';
    } else {
      authError.value = `密碼錯誤（第 ${loginAttempts.value} / 3 次），請再試一次`;
    }
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
  await loadPartnerCommissions();
};

const loadPartnerCommissions = async () => {
  commissionsLoading.value = true;
  try {
    const res = await $fetch('/api/admin/partner-commissions', {
      headers: { 'x-admin-secret': adminSecret.value },
    });
    partnerCommissions.value = res.partners;
  } catch {
    // 靜默失敗，不影響主流程
  } finally {
    commissionsLoading.value = false;
  }
};

const createCoupon = async () => {
  formError.value = '';
  formSuccess.value = '';

  if (!form.value.code.trim()) {
    formError.value = '請輸入折扣碼代碼';
    return;
  }
  const qty = Number(form.value.totalQuantity);
  if (!qty || qty <= 0 || !Number.isInteger(qty)) {
    formError.value = '發行數量需為正整數';
    return;
  }

  let discountTwd = 0;
  let commissionTwd = 0;
  let discountRules = null;

  if (couponMode.value === 'fixed') {
    discountTwd = Number(form.value.discountTwd);
    commissionTwd = Number(form.value.commissionTwd) || 0;
    if (!discountTwd || discountTwd <= 0) {
      formError.value = '折扣金額需大於 0';
      return;
    }
  } else {
    const rules = form.value.tierRules;
    if (!rules.length) {
      formError.value = '請至少新增一組件數折扣規則';
      return;
    }
    const parsed = [];
    for (const r of rules) {
      const mi = Number(r.minItems);
      const dt = Number(r.discountTwd);
      const ct = Number(r.commissionTwd) || 0;
      if (!mi || mi <= 0 || !Number.isInteger(mi)) {
        formError.value = '每條規則的最少件數需為正整數';
        return;
      }
      if (!dt || dt <= 0) {
        formError.value = '每條規則的折扣金額需大於 0';
        return;
      }
      parsed.push({ minItems: mi, discountTwd: dt, commissionTwd: ct });
    }
    discountRules = parsed;
  }

  submitting.value = true;
  try {
    const created = await $fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'x-admin-secret': adminSecret.value },
      body: {
        code: form.value.code.trim().toUpperCase(),
        partnerName: form.value.partnerName.trim() || null,
        discountTwd,
        commissionTwd,
        discountRules,
        totalQuantity: qty,
        expiresAt: form.value.expiresAt || null,
        perUserLimit: form.value.perUserLimit,
      },
    });
    formSuccess.value = `折扣碼 ${created.coupon.code} 建立成功！`;
    form.value = {
      code: '',
      partnerName: '',
      discountTwd: '',
      commissionTwd: '',
      totalQuantity: '1',
      expiresAt: '',
      perUserLimit: true,
      tierRules: [],
    };
    couponMode.value = 'fixed';
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
            :disabled="lockRemaining > 0"
            @keyup.enter="authenticate"
          />
          <button
            :disabled="authLoading || lockRemaining > 0"
            class="px-5 py-2.5 text-sm font-bold bg-[#749D8E] text-white rounded-2xl disabled:opacity-40"
            @click="authenticate"
          >
            {{ lockRemaining > 0 ? `鎖定中 ${lockRemaining}s` : authLoading ? '確認中...' : '登入' }}
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

            <!-- 網紅名稱 -->
            <div>
              <label class="text-xs font-semibold text-[#5A746B] block mb-1">網紅名稱 / 代碼</label>
              <input
                v-model="form.partnerName"
                type="text"
                placeholder="e.g. @influencer"
                class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E]"
              />
            </div>

            <!-- 折扣類型切換 -->
            <div>
              <label class="text-xs font-semibold text-[#5A746B] block mb-2">折扣類型</label>
              <div class="flex rounded-xl overflow-hidden border border-[#D4E2DA]">
                <button
                  type="button"
                  :class="['flex-1 py-2 text-xs font-bold transition-colors', couponMode === 'fixed' ? 'bg-[#749D8E] text-white' : 'bg-[#F4F7F5] text-[#5A746B]']"
                  @click="couponMode = 'fixed'"
                >固定折扣</button>
                <button
                  type="button"
                  :class="['flex-1 py-2 text-xs font-bold transition-colors', couponMode === 'tiered' ? 'bg-[#749D8E] text-white' : 'bg-[#F4F7F5] text-[#5A746B]']"
                  @click="setTieredMode"
                >件數階梯折扣</button>
              </div>
            </div>

            <!-- 固定折扣欄位 -->
            <template v-if="couponMode === 'fixed'">
              <div class="grid gap-3 md:grid-cols-2">
                <div>
                  <label class="text-xs font-semibold text-[#5A746B] block mb-1">折扣金額（台幣）</label>
                  <input
                    v-model="form.discountTwd"
                    type="number"
                    placeholder="e.g. 100"
                    min="1"
                    class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E]"
                  />
                </div>
                <div>
                  <label class="text-xs font-semibold text-[#5A746B] block mb-1">分潤（台幣）</label>
                  <input
                    v-model="form.commissionTwd"
                    type="number"
                    placeholder="0"
                    min="0"
                    class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E]"
                  />
                </div>
              </div>
            </template>

            <!-- 件數階梯折扣規則建立器 -->
            <template v-else>
              <div>
                <label class="text-xs font-semibold text-[#5A746B] block mb-2">折扣條件</label>
                <div class="space-y-2">
                  <div class="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 text-[10px] font-bold text-[#A4B8B0] uppercase px-1">
                    <span>最少件數</span>
                    <span>折扣（台幣）</span>
                    <span>分潤（台幣）</span>
                    <span></span>
                  </div>
                  <div
                    v-for="(rule, idx) in form.tierRules"
                    :key="idx"
                    class="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 items-center"
                  >
                    <input
                      v-model="rule.minItems"
                      type="number"
                      placeholder="3"
                      min="1"
                      step="1"
                      class="px-3 py-2 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-xl focus:outline-none focus:border-[#749D8E]"
                    />
                    <input
                      v-model="rule.discountTwd"
                      type="number"
                      placeholder="30"
                      min="1"
                      class="px-3 py-2 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-xl focus:outline-none focus:border-[#749D8E]"
                    />
                    <input
                      v-model="rule.commissionTwd"
                      type="number"
                      placeholder="0"
                      min="0"
                      class="px-3 py-2 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-xl focus:outline-none focus:border-[#749D8E]"
                    />
                    <button
                      type="button"
                      class="w-8 h-8 flex items-center justify-center text-[#A4B8B0] hover:text-red-400 transition-colors rounded-lg"
                      @click="removeTierRule(idx)"
                    >✕</button>
                  </div>
                </div>
                <button
                  type="button"
                  class="mt-2 text-xs font-bold text-[#749D8E] flex items-center gap-1"
                  @click="addTierRule"
                >＋ 新增條件</button>
                <p
                  v-if="tierRulesWarning"
                  class="text-[11px] text-amber-600 font-semibold mt-2 leading-relaxed bg-amber-50 rounded-xl px-3 py-2"
                >
                  {{ tierRulesWarning }}
                </p>
              </div>
            </template>

            <!-- 發行數量 -->
            <div>
              <label class="text-xs font-semibold text-[#5A746B] block mb-1">發行數量（張）</label>
              <input
                v-model="form.totalQuantity"
                type="number"
                placeholder="e.g. 10"
                min="1"
                step="1"
                class="w-full px-4 py-2.5 text-sm bg-[#F4F7F5] border border-[#D4E2DA] rounded-2xl focus:outline-none focus:border-[#749D8E]"
              />
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
                  {{ formatCouponAdminSummary(c) }} · 已用
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
        <!-- 折扣碼列表 end -->
        </div>

        <!-- 網紅分潤彙總 -->
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-[#E8F0E9] mt-6">
          <div class="flex items-center justify-between mb-4">
            <p class="text-[10px] font-black text-[#749D8E] uppercase tracking-widest">
              網紅分潤彙總
            </p>
            <button class="text-xs text-[#749D8E] font-semibold" @click="loadPartnerCommissions">
              重新整理
            </button>
          </div>
          <p class="text-[10px] text-[#A4B8B0] mb-3">
            已排除取消訂單。「待確認」= 待付款訂單，「已確認」= 付款確認後可發放分潤。
          </p>
          <div v-if="commissionsLoading" class="text-xs text-[#A4B8B0] text-center py-4">載入中...</div>
          <div v-else-if="!partnerCommissions.length" class="text-xs text-[#A4B8B0] text-center py-4">
            尚無分潤資料
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="p in partnerCommissions"
              :key="p.partnerName"
              class="p-4 rounded-2xl border border-[#D4E2DA] bg-[#F9FDFB]"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-black text-[#4A5D59]">{{ p.partnerName }}</p>
                  <p class="text-[11px] text-[#749D8E] mt-0.5">
                    折扣碼：{{ p.codes.join('、') }}
                  </p>
                  <p class="text-[11px] text-[#A4B8B0] mt-0.5">
                    訂單數：{{ p.totalOrders }} 筆 · 客人折扣合計：NT${{ p.totalDiscount.toLocaleString() }}
                  </p>
                </div>
                <div class="text-right flex-shrink-0">
                  <p class="text-xs text-[#A4B8B0]">待確認</p>
                  <p class="text-sm font-bold text-amber-600">NT${{ p.pendingCommission.toLocaleString() }}</p>
                </div>
              </div>
              <div class="mt-2 pt-2 border-t border-[#E8F0E9] flex items-center justify-between">
                <p class="text-[11px] text-[#5A746B]">已確認（可發放分潤）</p>
                <p class="text-base font-black text-[#4A5D59]">NT${{ p.confirmedCommission.toLocaleString() }}</p>
              </div>
              <div class="mt-1 flex items-center justify-between">
                <p class="text-[11px] text-[#A4B8B0]">累計總分潤（含待確認）</p>
                <p class="text-sm font-bold text-[#749D8E]">NT${{ p.totalCommission.toLocaleString() }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
