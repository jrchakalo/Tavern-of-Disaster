import './assets/main.css';
import { createPinia } from 'pinia';
import router from './router';
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App)

app.use(createPinia());
app.use(router);

app.mount('#app');
