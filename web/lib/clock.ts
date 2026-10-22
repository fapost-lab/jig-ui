import { shallowRef } from 'vue';

/** The time, moved on once a minute: one clock for every age the page shows, so an age grows with no read of Jig. */
export const minute = shallowRef(new Date());
setInterval(() => (minute.value = new Date()), 60_000);
