import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import store from './store'

// Punto de entrada: monta la app con el store (Vuex) y el router.
createApp(App).use(store).use(router).mount('#app')
