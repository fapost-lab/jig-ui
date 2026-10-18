import { ref, watch, watchEffect } from 'vue';

export type Theme = 'dark' | 'light';

/** Remembered by this browser only; storage that throws leaves the page dark. */
const KEY = 'jig-ui.theme';

function stored(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** The page's theme: dark unless this browser chose light. */
export const theme = ref<Theme>(stored());

watchEffect(() => document.documentElement.classList.toggle('dark', theme.value === 'dark'));

// Only a choice is stored, so a browser that never chose follows a later change of the default.
watch(theme, (next) => {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage refused: the choice holds until the page closes.
  }
});
