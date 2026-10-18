<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { theme } from '@/lib/theme';
</script>

<template>
  <Button
    variant="ghost"
    size="icon-sm"
    :aria-label="theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'"
    @click="theme = theme === 'dark' ? 'light' : 'dark'"
  >
    <Sun v-if="theme === 'dark'" />
    <Moon v-else />
  </Button>
</template>
