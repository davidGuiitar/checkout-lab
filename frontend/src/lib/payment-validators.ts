export type CardBrand = 'Visa' | 'Mastercard' | null

export function normalizeCardNumber(value: string): string {
  return value.replace(/\D/g, '')
}

export function formatExpiryInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

export function detectCardBrand(value: string): CardBrand {
  const number = normalizeCardNumber(value)
  if (/^4/.test(number)) return 'Visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(number)) return 'Mastercard'
  return null
}

export function isValidLuhn(value: string): boolean {
  const number = normalizeCardNumber(value)
  if (number.length < 13 || number.length > 19) return false

  const sum = [...number]
    .reverse()
    .reduce((total, digit, index) => {
      let parsed = Number(digit)
      if (index % 2 === 1) parsed = parsed > 4 ? parsed * 2 - 9 : parsed * 2
      return total + parsed
    }, 0)

  return sum % 10 === 0
}

export function isValidExpiry(value: string, now = new Date()): boolean {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value)
  if (!match) return false

  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  return year > currentYear || (year === currentYear && month >= currentMonth)
}

export function isValidCvc(value: string, brand: CardBrand): boolean {
  return brand === 'Visa' ? /^\d{3,4}$/.test(value) : /^\d{3}$/.test(value)
}
