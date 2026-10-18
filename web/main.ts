import { createApp } from 'vue';
import App from './App.vue';
import './lib/theme'; // applies the remembered theme before the first render
import { router } from './router';
import './style.css';

createApp(App).use(router).mount('#app');
