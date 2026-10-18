import stylistic from '@stylistic/eslint-plugin';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import { globalIgnores } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';

// Correctness, and layout only where Prettier keeps what it finds: the rest of the layout is Prettier's
// (.prettierrc.json), so the two never disagree.
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
    // The page's typecheck sees Node's types, for the API types it takes from the server; Node's globals do not exist in a browser.
    files: ['web/**/*.{ts,vue}'],
    ignores: ['web/**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', 'process', 'Buffer', 'global', '__dirname', '__filename', 'require', 'module', 'exports'],
      // Types only: a value imported from the server would bring server code into the page's bundle.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/server/**'], allowTypeImports: true, message: 'The page takes only types from the server.' }] },
      ],
    },
  },
  {
    // shadcn-vue names its components by one word (Button, Card); the rule is for components of our own.
    files: ['web/components/ui/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  skipFormatting,
  {
    // An object type of two members or more — `{ a: …; b: … }` — has a line per member: one long line is hard to read.
    // After skipFormatting, which turns the rule off; Prettier keeps an object type it finds expanded.
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/object-curly-newline': [
        'error',
        // One member: on one line or not, as Prettier fits it.
        { TSTypeLiteral: { minProperties: 2, consistent: true }, TSInterfaceBody: { minProperties: 2, consistent: true } },
      ],
    },
  },
  {
    // A component's props and events, one member or more: what it takes reads down the page.
    files: ['**/*.vue'],
    rules: {
      '@stylistic/object-curly-newline': ['error', { TSTypeLiteral: { minProperties: 1 }, TSInterfaceBody: { minProperties: 1 } }],
      // A blank line after a statement of several lines, such as the props, so the next one does not run into it.
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: ['multiline-const', 'multiline-expression'], next: '*' },
      ],
    },
  },
);
