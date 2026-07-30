import { createRouter, createWebHistory } from 'vue-router'
import CheckoutView from '../views/CheckoutView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'checkout',
      component: CheckoutView,
    },
  ],
})

export default router
