import { mount } from '@vue/test-utils'
import CardPreview from './CardPreview.vue'

describe('CardPreview', () => {
  it('renders entered data and identifies Visa', () => {
    const wrapper = mount(CardPreview, {
      props: {
        number: '4111 1111',
        holder: 'Ada Lovelace',
        expiry: '12/30',
        cvc: '',
        brand: 'Visa',
        showBack: false,
      },
    })

    expect(wrapper.text()).toContain('4111 1111 •••• ••••')
    expect(wrapper.text()).toContain('ADA LOVELACE')
    expect(wrapper.text()).toContain('Visa detectada')
    expect(wrapper.get('.payment-card').attributes('data-brand')).toBe('visa')
  })

  it('shows Mastercard and flips to the protected CVC side', () => {
    const wrapper = mount(CardPreview, {
      props: {
        number: '5555 5555 5555 4444',
        holder: '',
        expiry: '',
        cvc: '12',
        brand: 'Mastercard',
        showBack: true,
      },
    })

    expect(wrapper.text()).toContain('Mastercard detectada')
    expect(wrapper.get('.payment-card').classes()).toContain('is-flipped')
    expect(wrapper.get('.signature-row strong').text()).toBe('•••')
  })

  it('renders a neutral state before the brand is recognized', () => {
    const wrapper = mount(CardPreview, {
      props: {
        number: '3',
        holder: '',
        expiry: '',
        cvc: '',
        brand: null,
        showBack: false,
      },
    })

    expect(wrapper.text()).toContain('Franquicia aún no reconocida')
    expect(wrapper.get('.payment-card').attributes('data-brand')).toBe('generic')
  })
})
