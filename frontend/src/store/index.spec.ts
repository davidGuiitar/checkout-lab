import { createCheckoutStore } from './index'

describe('checkout store', () => {
  const product = {
    id: 'product-id',
    slug: 'product',
    name: 'Product',
    description: 'Description',
    price: 100_000,
    stock: 2,
  }
  const products = [product]
  const config = {
    baseFee: 2_000,
    deliveryFee: 8_000,
    paymentPublicKey: 'pub_example',
    paymentApiUrl: 'https://payments.example',
    tokenizationKey: 'public-key',
    contracts: {
      termsUrl: 'https://contracts.example/terms',
      personalDataUrl: 'https://contracts.example/privacy',
    },
  }
  const response = (body: unknown, ok = true) =>
    ({
      ok,
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as Response

  beforeEach(() => {
    window.localStorage.clear()
    jest.restoreAllMocks()
  })

  it('uses defaults and restores only the non-sensitive draft', () => {
    window.localStorage.setItem(
      'checkout-draft',
      JSON.stringify({ fullName: 'Saved Customer', installments: 3 }),
    )

    const store = createCheckoutStore()
    expect(store.state.apiUrl).toBe('http://localhost:3000')
    expect(store.state.draft).toMatchObject({
      fullName: 'Saved Customer',
      installments: 3,
      address: '',
    })
    expect(store.state).not.toHaveProperty('card')
  })

  it('recovers from invalid local storage and persists draft mutations', () => {
    window.localStorage.setItem('checkout-draft', '{invalid')
    const store = createCheckoutStore()
    expect(store.state.draft.fullName).toBe('')

    store.commit('saveDraft', { fullName: 'New Customer' })
    expect(store.state.draft.fullName).toBe('New Customer')
    expect(window.localStorage.getItem('checkout-draft')).toContain('New Customer')
    store.commit('setError', 'failure')
    store.commit('setLoading', true)
    expect(store.state.error).toBe('failure')
    expect(store.state.isLoading).toBe(true)
    store.commit('setError', null)
    expect(store.state.error).toBeNull()
  })

  it('loads product and checkout configuration', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(products))
      .mockResolvedValueOnce(response(config))
    globalThis.fetch = fetchMock
    const store = createCheckoutStore()

    await store.dispatch('fetchCheckoutData')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/products',
    )
    expect(store.state.products).toEqual(products)
    expect(store.state.product).toEqual(product)
    expect(store.state.config).toEqual(config)
    expect(store.state.error).toBeNull()
    expect(store.state.isLoading).toBe(false)
  })

  it('selects a product and preserves it when the catalog refreshes', () => {
    const secondProduct = { ...product, id: 'product-2', slug: 'product-2' }
    const store = createCheckoutStore()
    store.commit('setData', { products: [product, secondProduct], config })
    store.commit('selectProduct', secondProduct)
    store.commit('setData', { products: [product, secondProduct], config })

    expect(store.state.product).toEqual(secondProduct)
  })

  it('persists cart products, clamps quantities and removes lines', () => {
    const secondProduct = { ...product, id: 'product-2', slug: 'product-2', stock: 5 }
    const store = createCheckoutStore()
    store.commit('setData', { products: [product, secondProduct], config })

    store.commit('addToCart', product)
    store.commit('addToCart', secondProduct)
    store.commit('updateCartQuantity', {
      productId: product.id,
      quantity: 99,
    })
    expect(store.state.cart).toEqual([
      { productId: product.id, quantity: 2 },
      { productId: secondProduct.id, quantity: 1 },
    ])
    expect(window.localStorage.getItem('checkout-cart')).toContain(product.id)

    store.commit('removeFromCart', product.id)
    expect(store.state.cart).toEqual([{ productId: secondProduct.id, quantity: 1 }])
    store.commit('clearCart')
    expect(store.state.cart).toEqual([])
  })

  it('restores valid cart lines and prunes unavailable products', () => {
    window.localStorage.setItem(
      'checkout-cart',
      JSON.stringify([
        { productId: product.id, quantity: 20 },
        { productId: 'missing', quantity: 1 },
      ]),
    )
    const store = createCheckoutStore()
    store.commit('setData', { products, config })

    expect(store.state.cart).toEqual([{ productId: product.id, quantity: 2 }])
  })

  it('reports HTTP and network errors while always clearing loading', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response(config))
    const store = createCheckoutStore()

    await store.dispatch('fetchCheckoutData')
    expect(store.state.error).toBe('No fue posible cargar el checkout.')
    expect(store.state.isLoading).toBe(false)

    globalThis.fetch = jest.fn().mockRejectedValue('offline')
    await store.dispatch('fetchCheckoutData')
    expect(store.state.error).toBe('Error de conexión.')
    expect(store.state.isLoading).toBe(false)
  })
})
