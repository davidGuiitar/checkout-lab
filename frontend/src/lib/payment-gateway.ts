import { CompactEncrypt, importSPKI } from 'jose'
import { normalizeCardNumber } from './payment-validators'

export interface CardDetails {
  number: string
  expiry: string
  cvc: string
  holderName: string
}

interface TokenizationResponse {
  token?: string
}

export async function tokenizeCard(
  apiUrl: string,
  tokenizationKey: string,
  card: CardDetails,
): Promise<string> {
  const baseUrl = apiUrl.replace(/\/$/, '')
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
