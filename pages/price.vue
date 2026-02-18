<script setup>
const jpPrice = ref(null);
const type = ref('2kg');
const result = ref(null);
const currentExchangeRate = 0.2;

const shippingTable = {
  '1kg': {
    fee: 2050 * currentExchangeRate - 170,
    jpFee: 2050,
    desc: '不超過 1.0kg',
  },
  '2kg': {
    fee: 2750 * currentExchangeRate - 170,
    jpFee: 2750,
    desc: '不超過 2.0kg',
  },
  '3kg': {
    fee: 3450 * currentExchangeRate - 170,
    jpFee: 3450,
    desc: '不超過 3.0kg',
  },
  '4kg': {
    fee: 4150 * currentExchangeRate - 170,
    jpFee: 4150,
    desc: '不超過 4.0kg',
  },
  '5kg': {
    fee: 4850 * currentExchangeRate - 170,
    jpFee: 4850,
    desc: '不超過 5.0kg',
  },
  '6kg': {
    fee: 5550 * currentExchangeRate - 170,
    jpFee: 5550,
    desc: '不超過 6.0kg',
  },
  '7kg': {
    fee: 6250 * currentExchangeRate - 170,
    jpFee: 6250,
    desc: '不超過 7.0kg',
  },
  '8kg': {
    fee: 6950 * currentExchangeRate - 170,
    jpFee: 6950,
    desc: '不超過 8.0kg',
  },
  '9kg': {
    fee: 7650 * currentExchangeRate - 170,
    jpFee: 7650,
    desc: '不超過 9.0kg',
  },
  '10kg': {
    fee: 8350 * currentExchangeRate - 170,
    jpFee: 8350,
    desc: '不超過 10.0kg',
  },
  '11kg': {
    fee: 8850 * currentExchangeRate - 170,
    jpFee: 8850,
    desc: '不超過 11.0kg',
  },
  '12kg': {
    fee: 9350 * currentExchangeRate - 170,
    jpFee: 9350,
    desc: '不超過 12.0kg',
  },
  '13kg': {
    fee: 9850 * currentExchangeRate - 170,
    jpFee: 9850,
    desc: '不超過 13.0kg',
  },
  '14kg': {
    fee: 10350 * currentExchangeRate - 170,
    jpFee: 10350,
    desc: '不超過 14.0kg',
  },
  '15kg': {
    fee: 10850 * currentExchangeRate - 170,
    jpFee: 10850,
    desc: '不超過 15.0kg',
  },
  '16kg': {
    fee: 11350 * currentExchangeRate - 170,
    jpFee: 11350,
    desc: '不超過 16.0kg',
  },
  '17kg': {
    fee: 11850 * currentExchangeRate - 170,
    jpFee: 11850,
    desc: '不超過 17.0kg',
  },
  '18kg': {
    fee: 12350 * currentExchangeRate - 170,
    jpFee: 12350,
    desc: '不超過 18.0kg',
  },
  '19kg': {
    fee: 12850 * currentExchangeRate - 170,
    jpFee: 12850,
    desc: '不超過 19.0kg',
  },
  '20kg': {
    fee: 13350 * currentExchangeRate - 170,
    jpFee: 13350,
    desc: '不超過 20.0kg',
  },
  '21kg': {
    fee: 13850 * currentExchangeRate - 170,
    jpFee: 13850,
    desc: '不超過 21.0kg',
  },
  '22kg': {
    fee: 14350 * currentExchangeRate - 170,
    jpFee: 14350,
    desc: '不超過 22.0kg',
  },
  '23kg': {
    fee: 14850 * currentExchangeRate - 170,
    jpFee: 14850,
    desc: '不超過 23.0kg',
  },
  '24kg': {
    fee: 15350 * currentExchangeRate - 170,
    jpFee: 15350,
    desc: '不超過 24.0kg',
  },
  '25kg': {
    fee: 15850 * currentExchangeRate - 170,
    jpFee: 15850,
    desc: '不超過 25.0kg',
  },
  '26kg': {
    fee: 16350 * currentExchangeRate - 170,
    jpFee: 16350,
    desc: '不超過 26.0kg',
  },
  '27kg': {
    fee: 16850 * currentExchangeRate - 170,
    jpFee: 16850,
    desc: '不超過 27.0kg',
  },
  '28kg': {
    fee: 17350 * currentExchangeRate - 170,
    jpFee: 17350,
    desc: '不超過 28.0kg',
  },
  '29kg': {
    fee: 17850 * currentExchangeRate - 170,
    jpFee: 17850,
    desc: '不超過 29.0kg',
  },
  '30kg': {
    fee: 18350 * currentExchangeRate - 170,
    jpFee: 18350,
    desc: '不超過 30.0kg',
  },
};

// 服務費規則配置
const serviceFeeRules = [
  { max: 12000, baseFee: 200, rate: 0, desc: '¥12,000以下：固定服務費 NT$200' },
  { max: 40000, baseFee: 0, rate: 0.07, desc: '¥12,001-40,000：服務費 7%' },
  { max: 80000, baseFee: 0, rate: 0.06, desc: '¥40,001-80,000：服務費 6%' },
  { max: Infinity, baseFee: 0, rate: 0.05, desc: '¥80,001以上：服務費 5%' },
];

const rate = currentExchangeRate + 0.01; // 換匯 1% 的海外交易手續費
const calculateAllInPrice = (jpPrice, type) => {
  // 根據規則查找對應的服務費
  const rule = serviceFeeRules.find((r) => jpPrice <= r.max);
  const serviceRate = rule.rate;
  const baseFee = rule.baseFee;

  const shipping = shippingTable[type].fee;
  const twdBeforeService = jpPrice * rate;
  const serviceCharge = jpPrice * currentExchangeRate * serviceRate + baseFee; // 這裡先按照日幣價格計算服務費
  // const serviceCharge = twdBeforeService * serviceRate + baseFee; // 可考慮服務費是否包含匯率手續費
  const total = twdBeforeService + serviceCharge + shipping;

  return {
    total: Math.ceil(total),
    breakdown: {
      twdBeforeService: Math.ceil(twdBeforeService),
      serviceCharge: Math.ceil(serviceCharge),
      shipping: shipping,
      serviceRate: serviceRate,
      baseFee: baseFee,
    },
  };
};

const handleCalculate = () => {
  const price = parseFloat(jpPrice.value);
  if (isNaN(price) || price <= 0) {
    alert('請輸入有效的日幣價格');
    return;
  }
  result.value = calculateAllInPrice(price, type.value);
};
</script>

<template>
  <div class="app-container">
    <div class="calculator-wrapper">
      <div class="calculator-card">
        <h1 class="title">🛍️ 代購價格計算器</h1>

        <!-- 輸入區 -->
        <div class="input-section">
          <label class="label"> 日本商品價格 (JPY) </label>
          <input
            v-model.number="jpPrice"
            type="number"
            placeholder="例如: 25000"
            class="input-field"
            @keypress.enter="handleCalculate"
          />
        </div>

        <!-- 商品重量 -->
        <div class="type-section">
          <label class="label"> 商品重量 </label>
          <select v-model="type" class="select-field">
            <option
              v-for="(value, key) in shippingTable"
              :key="key"
              :value="key"
            >
              {{ value.desc }} - 運費 ¥{{ value.jpFee }} (約NT${{
                Math.ceil(value.fee)
              }})
            </option>
          </select>
        </div>

        <!-- 計算按鈕 -->
        <button class="calculate-btn" @click="handleCalculate">
          💰 計算價格
        </button>

        <!-- 結果區 -->
        <div v-if="result" class="result-section">
          <h2 class="result-title">📊 計算結果</h2>

          <div class="breakdown">
            <div class="breakdown-item">
              <span
                >💴 日幣轉台幣匯率
                {{ Number(rate.toFixed(10)) }} (含海外手續費)</span
              >
              <span class="amount"
                >NT$
                {{ result.breakdown.twdBeforeService.toLocaleString() }}</span
              >
            </div>

            <div class="breakdown-item">
              <span>
                💼 服務費
                {{
                  result.breakdown.serviceRate > 0
                    ? ` (${result.breakdown.serviceRate * 100}%)`
                    : ' (固定)'
                }}
              </span>
              <span class="amount"
                >NT$ {{ result.breakdown.serviceCharge.toLocaleString() }}</span
              >
            </div>

            <div class="breakdown-item">
              <span>📦 運費 ({{ type }})</span>
              <span class="amount"
                >NT$ {{ result.breakdown.shipping.toLocaleString() }}</span
              >
            </div>

            <div class="total-divider">
              <div class="total-card">
                <span class="total-label"> 🎯 總價 </span>
                <span class="total-amount">
                  NT$ {{ result.total.toLocaleString() }}
                </span>
              </div>
            </div>
          </div>

          <div class="info-box">
            <p class="info-title">📌 計費說明：</p>
            <ul class="info-list">
              <li v-for="(rule, index) in serviceFeeRules" :key="index">
                {{ rule.desc }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, sans-serif;
}

.calculator-wrapper {
  max-width: 600px;
  margin: 0 auto;
}

.calculator-card {
  background-color: white;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 2.5rem;
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.title {
  font-size: 2rem;
  font-weight: bold;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 2rem;
  text-align: center;
}

.input-section {
  margin-bottom: 2rem;
}

.label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.input-field {
  width: 100%;
  padding: 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 1.1rem;
  outline: none;
  transition: all 0.3s;
  box-sizing: border-box;
}

.input-field:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.type-section {
  margin-bottom: 2rem;
}

.type-grid {
  display: grid;
  gap: 0.75rem;
}

.type-button {
  padding: 1rem;
  border-radius: 12px;
  border: 2px solid #e2e8f0;
  background-color: white;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.select-field {
  width: 100%;
  padding: 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 1rem;
  outline: none;
  transition: all 0.3s;
  box-sizing: border-box;
  background-color: white;
  cursor: pointer;
  color: #2d3748;
  font-weight: 500;
}

.select-field:hover {
  border-color: #cbd5e0;
}

.select-field:focus {
  border-color: #667eea;
  background-color: #f7fafc;
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.type-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.type-key {
  font-weight: bold;
  font-size: 1.2rem;
  color: #2d3748;
}

.type-key.active {
  color: #667eea;
}

.type-desc {
  color: #718096;
  margin-left: 0.5rem;
  font-size: 0.9rem;
}

.type-fee {
  color: #667eea;
  font-weight: 600;
  font-size: 0.95rem;
}

.calculate-btn {
  width: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: bold;
  padding: 1.2rem;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
  transition: all 0.3s;
  margin-bottom: 2rem;
}

.calculate-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 15px 30px rgba(102, 126, 234, 0.4);
}

.result-section {
  background: linear-gradient(135deg, #f0f4ff 0%, #f5f0ff 100%);
  border-radius: 16px;
  padding: 1.5rem;
  border: 2px solid #e9d5ff;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.result-title {
  font-size: 1.3rem;
  font-weight: bold;
  color: #2d3748;
  margin-bottom: 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.breakdown {
  margin-bottom: 1rem;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  color: #4a5568;
  margin-bottom: 0.8rem;
  padding: 0.5rem;
  background-color: white;
  border-radius: 8px;
}

.amount {
  font-weight: 600;
}

.total-divider {
  border-top: 3px solid #c4b5fd;
  padding-top: 1rem;
  margin-top: 1rem;
}

.total-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
}

.total-label {
  font-size: 1.3rem;
  font-weight: bold;
}

.total-amount {
  font-size: 2rem;
  font-weight: bold;
}

.info-box {
  font-size: 0.85rem;
  color: #718096;
  margin-top: 1rem;
  padding: 1rem;
  background-color: white;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.info-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #4a5568;
}

.info-list {
  margin-left: 1.2rem;
  line-height: 1.8;
  list-style-type: disc;
}
</style>
