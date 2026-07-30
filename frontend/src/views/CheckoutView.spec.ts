import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { tokenizeCard } from '../lib/payment-gateway'
import { CheckoutConfig, createCheckoutStore } from '../store'
import CheckoutView from './CheckoutView.vue'

jest.mock('../lib/payment-gateway', () => ({
  tokenizeCard: jest.fn(),
}))

const tokenizeCardMock = tokenizeCard as jest.MockedFunction<typeof tokenizeCard>

describe('CheckoutView', () => {
  const product = {
    id: 'f91a45dc-b838-4d0f-81bb-f1db46ca48fa',
    name: 'Test Product',
    description: 'Test Description',
    price: 100_000,
    stock: 2,
  }
  const config = {
    baseFee: 2_000,
    deliveryFee: 8_000,
    paymentPublicKey: 'pub_example',
    paymentApiUrl: 'https://payments.example',
    tokenizationKey: 'public-encryption-key',
    contracts: {
      termsUrl: 'https://contracts.example/terms',
      personalDataUrl: 'https://contracts.example/privacy',
    },
  }
  const approved = {
    reference: 'CHK-9fe5923f-7fef-4a5c-99fc-20db7464c774',
    status: 'APPROVED',
    total: 110_000,
    product: { id: product.id, name: product.name, stock: 1 },
  }

  const response = (body: unknown, ok = true) =>
    ({
      ok,
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as Response

  function createFetch(
    checkoutResult: unknown = approved,
    checkoutOk = true,
    checkoutConfig: CheckoutConfig = config,
  ) {
    return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/products/featured')) return response(product)
      if (url.endsWith('/checkout/config')) return response(checkoutConfig)
      if (url.endsWith('/checkout') && init?.method === 'POST') {
        return response(checkoutResult, checkoutOk)
      }
      if (url.includes('/transactions/')) return response(approved)
      throw new Error(`Unexpected URL: ${url}`)
    })
  }

  async function mountView(fetchMock = createFetch()) {
    globalThis.fetch = fetchMock
    const store = createCheckoutStore()
    const wrapper = mount(CheckoutView, {
      global: { plugins: [store] },
    })
    await flushPromises()
    return { wrapper, store, fetchMock }
  }

  function button(wrapper: VueWrapper, label: string) {
    const found = wrapper
      .findAll('button')
      .find((candidate) => candidate.text().includes(label))
    if (!found) throw new Error(`Button not found: ${label}`)
    return found
  }

  async function fillValidForm(wrapper: VueWrapper) {
    await button(wrapper, 'Pagar con tarjeta').trigger('click')
    const fieldsets = wrapper.findAll('fieldset')
    const personal = fieldsets[0].findAll('input')
    await personal[0].setValue('Test Customer')
    await personal[1].setValue('customer@example.com')
    await personal[2].setValue('3001234567')

    const delivery = fieldsets[1].findAll('input')
    await delivery[0].setValue('Test Customer')
    await delivery[1].setValue('Test Street 123')
    await delivery[2].setValue('Bogota')
    await delivery[3].setValue('Cundinamarca')

    await wrapper
      .get('input[autocomplete="cc-number"]')
      .setValue(['4111', '1111', '1111', '1111'].join(' '))
    await wrapper.get('input[autocomplete="cc-exp"]').setValue('12/30')
    await wrapper.get('input[autocomplete="cc-csc"]').setValue('123')
    const contracts = wrapper.findAll('input[type="checkbox"]')
    await contracts[0].setValue(true)
    await contracts[1].setValue(true)
  }

  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
    tokenizeCardMock.mockResolvedValue('tok_test_safe')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('completes an approved checkout without persisting sensitive data', async () => {
    const { wrapper, fetchMock } = await mountView()
    expect(wrapper.text()).toContain('Test Product')
    expect(wrapper.text()).toContain('2 unidades disponibles')

    await fillValidForm(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Resumen de pago')
    expect(wrapper.find('input[autocomplete="cc-number"]').exists()).toBe(false)

    await button(wrapper, 'Confirmar pago').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Pago aprobado')
    expect(window.localStorage.getItem('checkout-transaction-reference')).toBe(
      approved.reference,
    )

    const checkoutCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/checkout') &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    const requestBody = String((checkoutCall?.[1] as RequestInit).body)
    const parsedRequest = JSON.parse(requestBody) as Record<string, unknown>
    expect(parsedRequest.paymentToken).toBe('tok_test_safe')
    expect(parsedRequest).not.toHaveProperty('card')
    expect(parsedRequest).not.toHaveProperty('cvc')
    expect(window.localStorage.getItem('checkout-draft')).not.toContain(
      'tok_test_safe',
    )

    await button(wrapper, 'Volver al producto').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Test Product')
    expect(
      window.localStorage.getItem('checkout-transaction-reference'),
    ).toBeNull()
  })

  it('validates the form and reports tokenization errors', async () => {
    const { wrapper } = await mountView()
    await button(wrapper, 'Pagar con tarjeta').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Revisa los datos')
    expect(tokenizeCardMock).not.toHaveBeenCalled()

    await fillValidForm(wrapper)
    tokenizeCardMock.mockRejectedValue(new Error('Tokenization unavailable'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Tokenization unavailable')
    expect(wrapper.text()).toContain('Datos de pago y entrega')
  })

  it('reports missing configuration and safe checkout API errors', async () => {
    const missingConfig = { ...config, tokenizationKey: null }
    const { wrapper } = await mountView(
      createFetch(
        { message: ['Pago inválido.', 'Intenta nuevamente.'] },
        false,
        missingConfig,
      ),
    )
    await fillValidForm(wrapper)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('La tokenización no está configurada.')

    const configured = await mountView(
      createFetch({ message: ['Pago inválido.', 'Intenta nuevamente.'] }, false),
    )
    await fillValidForm(configured.wrapper)
    await configured.wrapper.get('form').trigger('submit')
    await flushPromises()
    await button(configured.wrapper, 'Confirmar pago').trigger('click')
    await flushPromises()
    expect(configured.wrapper.text()).toContain(
      'Pago inválido. Intenta nuevamente.',
    )
  })

  it('polls pending payments and recovers the final state', async () => {
    jest.useFakeTimers()
    const pending = { ...approved, status: 'PENDING' }
    const { wrapper } = await mountView(createFetch(pending))
    await fillValidForm(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await button(wrapper, 'Confirmar pago').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Procesando pago')

    await jest.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    expect(wrapper.text()).toContain('Pago aprobado')
  })

  it('recovers a persisted reference after refresh and clears unknown ones', async () => {
    window.localStorage.setItem(
      'checkout-transaction-reference',
      approved.reference,
    )
    const recovered = await mountView()
    expect(recovered.wrapper.text()).toContain('Pago aprobado')

    recovered.wrapper.unmount()
    window.localStorage.setItem(
      'checkout-transaction-reference',
      approved.reference,
    )
    const failingFetch = createFetch()
    failingFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/transactions/')) return response({}, false)
      if (url.endsWith('/products/featured')) return response(product)
      return response(config)
    })
    await mountView(failingFetch)
    expect(
      window.localStorage.getItem('checkout-transaction-reference'),
    ).toBeNull()
  })
})
