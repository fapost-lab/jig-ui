import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import { globalIgnores } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';

// Correctness only; the layout of the code is Prettier's (.prettierrc.json), so the two never disagree.
export default defineConfigWithVueTs(
  { files: ['**/*.{ts,vue}'] },
  globalIgnores(['dist/**', '.ai/**', 'docs/**']),
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    // An optional prop typed in TypeScript is undefined until given; a default for each would be noise.
    rules: { 'vue/require-default-prop': 'off' },
  },
  {
    // Tests break Jig's answers on purpose, through JSON no type describes.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // shadcn-vue names its components by one word (Button, Card); the rule is for components of our own.
    files: ['web/components/ui/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  skipFormatting,
);
