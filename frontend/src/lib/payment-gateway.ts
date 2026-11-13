import { CompactEncrypt, importSPKI } from 'jose'
import { normalizeCardNumber } from './payment-validators'

/** Datos de tarjeta capturados en el formulario (nunca se envían en claro). */
export interface CardDetails {
  number: string
  expiry: string
  cvc: string
  holderName: string
}

interface TokenizationResponse {
  token?: string
}

/** Convierte los datos de la tarjeta en un token seguro para pagar. */
export async function tokenizeCard(
  apiUrl: string,
  tokenizationKey: string,
  card: CardDetails,
): Promise<string> {
  // 1. Cifra la tarjeta en el navegador (JWE) con la llave pública de la
  //    pasarela, de modo que ni el backend puede leer los datos.
  // 2. Envía el JWE al backend, que lo cambia por un token de la pasarela.
  const baseUrl = apiUrl.replace(/\/$/, '')
  // "MM/AA" -> ["MM", "AA"]
  const [expMonth, expYear] = card.expiry.split('/')
  const encryptionKey = await importSPKI(tokenizationKey, 'RSA-OAEP-256')
  const encodedCard = new TextEncoder().encode(
    JSON.stringify({
      number: normalizeCardNumber(card.number),
      cvc: card.cvc,
      exp_month: expMonth,
      exp_year: expYear,
      card_holder: card.holderName,
    }),
  )
  // RSA-OAEP-256 cifra la clave; AES-256-GCM cifra el contenido.
  const payload = await new CompactEncrypt(encodedCard)
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
    .encrypt(encryptionKey)

  const response = await fetch(`${baseUrl}/checkout/tokenize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payload }),
  })
  const body = (await response.json()) as TokenizationResponse

  if (!response.ok || !body.token) {
    throw new Error('La tarjeta no pudo ser tokenizada.')
  }
  return body.token
}
