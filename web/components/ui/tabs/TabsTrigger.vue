<script setup lang="ts">
  import type { TabsTriggerProps } from 'reka-ui';
  import type { HTMLAttributes } from 'vue';
  import { reactiveOmit } from '@vueuse/core';
  import { cn } from 'cn';
  import { TabsTrigger, useForwardProps } from 'reka-ui';

  const props = defineProps<
    TabsTriggerProps & {
      class?: HTMLAttributes['class'];
    }
  >();

  const delegatedProps = reactiveOmit(props, 'class');

  const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    :class="
      cn(
        'relative inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-active:bg-muted data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
        props.class,
      )
    "
    v-bind="forwardedProps"
  >
    <slot />
  </TabsTrigger>
</template>
