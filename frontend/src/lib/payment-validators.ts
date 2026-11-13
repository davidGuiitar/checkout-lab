// Validaciones y formateo de tarjetas del lado del cliente.

/** Franquicias soportadas (null = no reconocida). */
export type CardBrand = 'Visa' | 'Mastercard' | null

/** Deja solo los dígitos (quita espacios y separadores). */
export function normalizeCardNumber(value: string): string {
  return value.replace(/\D/g, '')
}

/** Formatea lo que escribe el usuario como "MM/AA" (máx. 4 dígitos). */
export function formatExpiryInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

/**
 * Detecta la franquicia por el prefijo (BIN):
 * Visa empieza por 4; Mastercard por 51-55 o 2221-2720.
 */
export function detectCardBrand(value: string): CardBrand {
  const number = normalizeCardNumber(value)
  if (/^4/.test(number)) return 'Visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(number)) return 'Mastercard'
  return null
}

/**
 * Algoritmo de Luhn: desde la derecha, duplica cada segundo dígito (restando
 * 9 si pasa de 9) y la suma total debe ser múltiplo de 10.
 */
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

/** La tarjeta es válida hasta el último día de su mes de vencimiento. */
export function isValidExpiry(value: string, now = new Date()): boolean {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value)
  if (!match) return false

  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  return year > currentYear || (year === currentYear && month >= currentMonth)
}

/** CVC de 3 dígitos; para Visa se permiten también 4. */
export function isValidCvc(value: string, brand: CardBrand): boolean {
  return brand === 'Visa' ? /^\d{3,4}$/.test(value) : /^\d{3}$/.test(value)
}
