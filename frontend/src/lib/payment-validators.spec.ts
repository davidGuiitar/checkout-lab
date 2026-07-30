import {
  detectCardBrand,
  isValidCvc,
  isValidExpiry,
  isValidLuhn,
  normalizeCardNumber,
} from './payment-validators'

describe('payment validators', () => {
  it('normalizes and detects accepted card brands', () => {
    expect(normalizeCardNumber('4111 1111-1111 1111')).toBe('4111111111111111')
    expect(detectCardBrand('4111 1111 1111 1111')).toBe('Visa')
    expect(detectCardBrand('5555 5555 5555 4444')).toBe('Mastercard')
    expect(detectCardBrand('378282246310005')).toBeNull()
  })

  it('validates card numbers with Luhn', () => {
    expect(isValidLuhn('4111 1111 1111 1111')).toBe(true)
    expect(isValidLuhn('4111 1111 1111 1112')).toBe(false)
  })

  it('validates a current or future expiry and CVC length', () => {
    const now = new Date(2026, 6, 1)
    expect(isValidExpiry('07/26', now)).toBe(true)
    expect(isValidExpiry('06/26', now)).toBe(false)
    expect(isValidCvc('123', 'Mastercard')).toBe(true)
    expect(isValidCvc('1234', 'Visa')).toBe(true)
    expect(isValidCvc('12', 'Visa')).toBe(false)
  })
})
