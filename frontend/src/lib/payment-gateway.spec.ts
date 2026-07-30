const mockEncrypt = jest.fn()
const mockSetProtectedHeader = jest.fn(() => ({ encrypt: mockEncrypt }))
let mockEncodedCard: Uint8Array
const mockCompactEncrypt = jest.fn().mockImplementation((value: Uint8Array) => {
  mockEncodedCard = value
  return { setProtectedHeader: mockSetProtectedHeader }
})
const mockImportSpki = jest.fn()

jest.mock('jose', () => ({
  CompactEncrypt: mockCompactEncrypt,
  importSPKI: mockImportSpki,
}))

import { tokenizeCard } from './payment-gateway'

describe('tokenizeCard', () => {
  const card = {
    number: 'test-1234',
    expiry: '12/30',
    cvc: 'test-cvc',
    holderName: 'Test Customer',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockImportSpki.mockResolvedValue('encryption-key')
    mockEncrypt.mockResolvedValue('encrypted-jwe')
  })

  it('encrypts card data locally and sends only the JWE to the API', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ token: 'tok_test_safe' }),
    })

    await expect(
      tokenizeCard('http://localhost:3000/', 'public-key', card),
    ).resolves.toBe('tok_test_safe')

    expect(mockImportSpki).toHaveBeenCalledWith('public-key', 'RSA-OAEP-256')
    expect(mockSetProtectedHeader).toHaveBeenCalledWith({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
    })
    expect(JSON.parse(new TextDecoder().decode(mockEncodedCard))).toEqual({
      number: '1234',
      cvc: 'test-cvc',
      exp_month: '12',
      exp_year: '30',
      card_holder: 'Test Customer',
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/checkout/tokenize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ payload: 'encrypted-jwe' }),
      }),
    )
    expect(JSON.stringify((globalThis.fetch as jest.Mock).mock.calls)).not.toContain(
      'test-cvc',
    )
  })

  it.each([
    [{ ok: false, token: 'tok_test_safe' }],
    [{ ok: true, token: undefined }],
  ])('rejects invalid tokenization responses', async ({ ok, token }) => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok,
      json: jest.fn().mockResolvedValue({ token }),
    })

    await expect(
      tokenizeCard('http://localhost:3000', 'public-key', card),
    ).rejects.toThrow('La tarjeta no pudo ser tokenizada.')
  })
})
