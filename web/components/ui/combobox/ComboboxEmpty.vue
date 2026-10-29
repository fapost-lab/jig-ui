<script setup lang="ts">
  import type { ComboboxEmptyProps } from 'reka-ui';
  import type { HTMLAttributes } from 'vue';
  import { reactiveOmit } from '@vueuse/core';
  import { cn } from 'cn';
  import { ComboboxEmpty } from 'reka-ui';

  const props = defineProps<
    ComboboxEmptyProps & {
      class?: HTMLAttributes['class'];
    }
  >();

  const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <ComboboxEmpty
    data-slot="combobox-empty"
    v-bind="delegatedProps"
    :class="
      cn('hidden w-full justify-center py-2 text-center text-xs text-muted-foreground group-data-empty/combobox-content:flex', props.class)
    "
  >
    <slot />
  </ComboboxEmpty>
</template>
