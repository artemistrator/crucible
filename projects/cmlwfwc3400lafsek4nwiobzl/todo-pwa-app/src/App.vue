<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'

const {
  offlineReady,
  needRefresh,
  updateServiceWorker,
} = useRegisterSW()
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900">
    <h1 class="text-3xl font-bold mb-4 text-blue-600">My Tasks</h1>
    <p class="text-lg mb-8">Infrastructure PWA initialized successfully.</p>

    <!-- PWA Status Indicators -->
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <div v-if="offlineReady" class="bg-green-100 text-green-800 px-4 py-2 rounded shadow border border-green-200">
        App ready to work offline
      </div>
      <div v-if="needRefresh" class="bg-blue-100 text-blue-800 px-4 py-2 rounded shadow border border-blue-200 flex gap-2 items-center">
        <span>New content available, click on reload button to update.</span>
        <button @click="updateServiceWorker()" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          Reload
        </button>
      </div>
    </div>
  </div>
</template>
