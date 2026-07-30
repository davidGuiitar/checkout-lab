import { createStore } from 'vuex'

export interface CheckoutState {
  apiUrl: string
}

export default createStore<CheckoutState>({
  state: {
    apiUrl: 'http://localhost:3000',
  },
})
