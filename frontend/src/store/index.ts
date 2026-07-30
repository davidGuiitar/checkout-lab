import { createStore } from 'vuex'

export interface Product {
  id: string
  name: string
  description: string
  price: number
  stock: number
}

export interface CheckoutConfig {
  baseFee: number
  deliveryFee: number
  paymentPublicKey: string | null
  paymentApiUrl: string | null
  tokenizationKey: string | null
  contracts: {
    termsUrl: string
    personalDataUrl: string
  } | null
}

export interface CheckoutDraft {
  fullName: string
  email: string
  phone: string
  recipientName: string
  address: string
  city: string
  department: string
  notes: string
  installments: number
}

export interface CheckoutState {
  apiUrl: string
  product: Product | null
  config: CheckoutConfig
  draft: CheckoutDraft
  isLoading: boolean
  error: string | null
}

const emptyDraft = (): CheckoutDraft => ({
  fullName: '',
  email: '',
  phone: '',
  recipientName: '',
  address: '',
  city: '',
  department: '',
  notes: '',
  installments: 1,
})

function loadDraft(): CheckoutDraft {
  try {
    const saved = window.localStorage.getItem('checkout-draft')
    return saved ? { ...emptyDraft(), ...JSON.parse(saved) } : emptyDraft()
  } catch {
    return emptyDraft()
  }
}

const apiUrl = typeof __API_URL__ === 'string' ? __API_URL__ : 'http://localhost:3000'

export default createStore<CheckoutState>({
  state: {
    apiUrl,
    product: null,
    config: {
      baseFee: 2_000,
      deliveryFee: 8_000,
      paymentPublicKey: null,
      paymentApiUrl: null,
      tokenizationKey: null,
      contracts: null,
    },
    draft: loadDraft(),
    isLoading: false,
    error: null,
  },
  mutations: {
    setLoading(state, payload) {
      state.isLoading = Boolean(payload)
    },
    setData(state, payload) {
      const data = payload as { product: Product; config: CheckoutConfig }
      state.product = data.product
      state.config = data.config
    },
    setError(state, payload) {
      state.error = payload ? String(payload) : null
    },
    saveDraft(state, payload) {
      state.draft = { ...state.draft, ...(payload as Partial<CheckoutDraft>) }
      window.localStorage.setItem('checkout-draft', JSON.stringify(state.draft))
    },
  },
  actions: {
    async fetchCheckoutData({ commit, state }) {
      commit('setLoading', true)
      commit('setError', null)
      try {
        const [productResponse, configResponse] = await Promise.all([
          fetch(`${state.apiUrl}/products/featured`),
          fetch(`${state.apiUrl}/checkout/config`),
        ])
        if (!productResponse.ok || !configResponse.ok) throw new Error('No fue posible cargar el checkout.')
        commit('setData', {
          product: (await productResponse.json()) as Product,
          config: (await configResponse.json()) as CheckoutConfig,
        })
      } catch (error: unknown) {
        commit('setError', error instanceof Error ? error.message : 'Error de conexión.')
      } finally {
        commit('setLoading', false)
      }
    },
  },
})
