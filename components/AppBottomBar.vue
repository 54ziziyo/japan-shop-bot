<script setup>
defineProps({
  label: { type: String, required: true },
  sublabel: { type: String, default: '' },
  amount: { type: Number, required: true },
  buttonText: { type: String, required: true },
  disabled: { type: Boolean, default: false },
});

defineEmits(['submit']);
</script>

<template>
  <footer class="fixed bottom-6 left-0 right-0 z-40 px-6">
    <div
      class="max-w-md mx-auto bg-white/80 backdrop-blur-2xl p-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(116,157,142,0.15)] border border-white/50"
    >
      <div class="flex justify-between items-center mb-6">
        <div class="flex flex-col">
          <span
            class="text-[10px] font-black text-[#A4B8B0] uppercase tracking-widest"
            >{{ label }}</span
          >
          <span class="text-[9px] text-[#749D8E] font-bold">{{
            sublabel
          }}</span>
        </div>
        <div class="text-right">
          <p class="text-3xl font-black tracking-tighter text-[#5A746B]">
            <span class="text-sm">NT$</span>
            {{ amount.toLocaleString() }}
          </p>
        </div>
      </div>
      <button
        @click="$emit('submit')"
        :disabled="disabled"
        class="w-full bg-[#749D8E] hover:bg-[#63897B] text-white py-4 rounded-[1.5rem] font-black text-[12px] uppercase tracking-[0.3em] shadow-[0_10px_25px_rgba(116,157,142,0.3)] active:scale-[0.96] transition-all disabled:opacity-50"
      >
        {{ buttonText }}
      </button>
    </div>
  </footer>
</template>
