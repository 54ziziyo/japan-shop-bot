<script setup lang="ts">
const handleReload = () => {
  window.location.reload();
};
</script>

<template>
  <div
    class="min-h-screen bg-[#F9F9F9] text-[#1A1A1A] font-sans antialiased flex items-center justify-center"
  >
    <div class="text-center px-6">
      <h1 class="text-4xl font-black tracking-tighter leading-none mb-4">
        🏠 囉姆嚕日貨代購
      </h1>
      <p class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">
        日本代購機器人，輕鬆購買日本商品
      </p>
      <div class="flex flex-col justify-center space-y-4">
        <NuxtLink
          to="/cart"
          class="inline-block py-3 bg-black text-white font-black text-sm uppercase tracking-widest rounded-full hover:bg-gray-800 transition-colors"
        >
          查看購物車
        </NuxtLink>
        <!-- <button
          @click="handleReload"
          class="inline-block py-3 border border-black text-black font-black text-sm uppercase tracking-widest rounded-full hover:bg-gray-800 hover:text-white transition-colors"
        >
          重新整理
        </button> -->
      </div>
    </div>
  </div>
</template>
