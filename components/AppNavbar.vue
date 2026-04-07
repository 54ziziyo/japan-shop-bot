<script setup>
defineProps({
  title: { type: String, required: true },
});
</script>

<template>
  <nav
    class="flex-shrink-0 z-30 bg-[#F4F9F5]/70 backdrop-blur-xl p-6 flex items-end justify-between border-b border-[#E8F0E9]"
  >
    <div>
      <slot name="subtitle" />
      <h1
        class="text-3xl font-black tracking-tight leading-none text-[#5A746B]"
      >
        {{ title }}
      </h1>
    </div>
    <slot name="right" />
  </nav>
</template>
