<script setup>
defineProps({
  item: { type: Object, required: true },
  jpyRate: { type: Number, default: 0 },
});
</script>

<template>
  <div
    class="flex gap-4 items-start p-4 rounded-[1.5rem] border transition-all"
    :class="
      item.soldOut
        ? 'border-red-200 bg-red-50/50 opacity-60'
        : item.priceChanged
          ? 'border-amber-200 bg-amber-50/30'
          : 'border-[#E8F0E9] bg-white'
    "
  >
    <div
      class="w-20 h-20 rounded-[1.25rem] overflow-hidden flex-shrink-0 bg-[#F4F9F5] shadow-[0_4px_15px_rgb(116,157,142,0.1)]"
    >
      <img
        :src="
          item.image_url || 'https://placehold.co/128x128.png?text=No+Image'
        "
        class="w-full h-full object-cover"
      />
    </div>
    <div class="flex-1 min-w-0">
      <h3
        class="font-bold text-sm truncate leading-tight mb-0.5 text-[#4A5D59]"
      >
        {{ item.product_title }}
      </h3>
      <p
        v-if="item.product_code"
        class="text-[9px] font-mono text-[#749D8E]/50 tracking-wide mb-0.5"
      >
        {{ item.product_code }}
      </p>
      <p
        class="text-[10px] text-[#749D8E] font-semibold uppercase tracking-wider mb-1.5"
      >
        {{ item.color }}
        <span class="mx-0.5 opacity-40">/</span>
        {{ item.size }}
        <span class="mx-0.5 opacity-40">×</span>
        {{ item.quantity || 1 }}
      </p>
      <div v-if="item.soldOut">
        <span class="text-[10px] font-black text-red-500 tracking-wider"
          >❌ 此貨已售完</span
        >
      </div>
      <div v-else>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[#5A746B] font-black text-base tracking-tighter">
            NT${{ parsePriceTwd(item.displayPrice, jpyRate).toLocaleString() }}
          </span>
          <template v-if="item.priceChanged">
            <span class="text-[9px] text-[#A4B8B0] line-through">
              NT${{ parsePriceTwd(item.oldPrice, jpyRate).toLocaleString() }}
            </span>
            <span
              class="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full"
            >
              價格已更新
            </span>
          </template>
        </div>
        <p
          v-if="item.promoDeadline"
          class="text-[9px] text-orange-600 font-semibold mt-1"
        >
          特價至 {{ item.promoDeadline }}
        </p>
      </div>
    </div>
  </div>
</template>
