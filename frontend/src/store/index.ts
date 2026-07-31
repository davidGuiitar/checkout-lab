import { createStore } from 'vuex'

export interface Product {
  id: string
  slug: string
  name: string
  description: string
  price: number
  stock: number
}

export interface CartItem {
  productId: string
  quantity: number
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
  products: Product[]
  product: Product | null
  cart: CartItem[]
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

function loadCart(): CartItem[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem('checkout-cart') ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter(
      (item): item is CartItem =>
        typeof item?.productId === 'string' &&
        Number.isInteger(item?.quantity) &&
        item.quantity > 0,
    )
  } catch {
    return []
  }
}

function persistCart(cart: CartItem[]): void {
  window.localStorage.setItem('checkout-cart', JSON.stringify(cart))
}

const apiUrl = typeof __API_URL__ === 'string' ? __API_URL__ : 'http://localhost:3000'

export function createCheckoutStore() {
  return createStore<CheckoutState>({
    state: {
      apiUrl,
      products: [],
      product: null,
      cart: loadCart(),
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
        const data = payload as { products: Product[]; config: CheckoutConfig }
        const selectedId = state.product?.id
        state.products = data.products
        state.product =
          data.products.find(({ id }) => id === selectedId) ?? data.products[0] ?? null
        state.config = data.config
        state.cart = state.cart
          .map((item) => {
            const product = data.products.find(({ id }) => id === item.productId)
            return product
              ? { ...item, quantity: Math.min(item.quantity, product.stock) }
              : null
          })
          .filter((item): item is CartItem => Boolean(item?.quantity))
        persistCart(state.cart)
      },
      selectProduct(state, payload) {
        const product = payload as Product
        state.product = state.products.find(({ id }) => id === product.id) ?? null
      },
      addToCart(state, payload) {
        const product = payload as Product
        const existing = state.cart.find(({ productId }) => productId === product.id)
        const totalUnits = state.cart.reduce((sum, item) => sum + item.quantity, 0)
        if (existing) {
          existing.quantity = Math.min(
            product.stock,
            existing.quantity + 1,
            existing.quantity + Math.max(0, 100 - totalUnits),
          )
        } else if (product.stock > 0 && totalUnits < 100) {
          state.cart.push({ productId: product.id, quantity: 1 })
        }
        persistCart(state.cart)
      },
      updateCartQuantity(state, payload) {
        const { productId, quantity } = payload as CartItem
        const item = state.cart.find((candidate) => candidate.productId === productId)
        const product = state.products.find(({ id }) => id === productId)
        if (!item || !product) return
        const otherUnits = state.cart.reduce(
          (sum, candidate) =>
            sum + (candidate.productId === productId ? 0 : candidate.quantity),
          0,
        )
        item.quantity = Math.min(
          product.stock,
          Math.max(1, Math.min(100 - otherUnits, Math.trunc(quantity) || 1)),
        )
        persistCart(state.cart)
      },
      removeFromCart(state, payload) {
        state.cart = state.cart.filter(({ productId }) => productId !== String(payload))
        persistCart(state.cart)
      },
      clearCart(state) {
        state.cart = []
        persistCart(state.cart)
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
          const [productsResponse, configResponse] = await Promise.all([
            fetch(`${state.apiUrl}/products`),
            fetch(`${state.apiUrl}/checkout/config`),
          ])
          if (!productsResponse.ok || !configResponse.ok) {
            throw new Error('No fue posible cargar el checkout.')
          }
          commit('setData', {
            products: (await productsResponse.json()) as Product[],
            config: (await configResponse.json()) as CheckoutConfig,
          })
        } catch (error: unknown) {
          commit(
            'setError',
            error instanceof Error ? error.message : 'Error de conexión.',
          )
        } finally {
          commit('setLoading', false)
        }
      },
    },
  })
}

export default createCheckoutStore()
