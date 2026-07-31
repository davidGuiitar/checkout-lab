<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useStore } from 'vuex'
import { tokenizeCard } from '../lib/payment-gateway'
import {
  detectCardBrand,
  formatExpiryInput,
  isValidCvc,
  isValidExpiry,
  isValidLuhn,
  normalizeCardNumber,
} from '../lib/payment-validators'
import type { CheckoutDraft, CheckoutState, Product } from '../store'

type PaymentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR'

interface CheckoutResult {
  reference: string
  status: PaymentStatus
  total: number
  product: { id: string; name: string; stock: number }
}

const store = useStore<CheckoutState>()
const isFormOpen = ref(false)
const showSummary = ref(false)
const attemptedSubmit = ref(false)
const isTokenizing = ref(false)
const isPaying = ref(false)
const paymentError = ref<string | null>(null)
const paymentToken = ref<string | null>(null)
const transaction = ref<CheckoutResult | null>(null)
const acceptedTerms = ref(false)
const acceptedPersonalData = ref(false)
const card = reactive({ number: '', expiry: '', cvc: '' })
const form = reactive<CheckoutDraft>({ ...store.state.draft })

const products = computed(() => store.state.products)
const product = computed(() => store.state.product)
const config = computed(() => store.state.config)
const brand = computed(() => detectCardBrand(card.number))
const total = computed(
  () => (product.value?.price ?? 0) + config.value.baseFee + config.value.deliveryFee,
)
const cardValid = computed(
  () =>
    Boolean(brand.value) &&
    isValidLuhn(card.number) &&
    isValidExpiry(card.expiry) &&
    isValidCvc(card.cvc, brand.value),
)
const personalValid = computed(() =>
  Boolean(
    form.fullName &&
      form.email.includes('@') &&
      form.phone &&
      form.recipientName &&
      form.address &&
      form.city &&
      form.department &&
      form.installments > 0,
  ),
)
const formValid = computed(
  () =>
    personalValid.value &&
    cardValid.value &&
    acceptedTerms.value &&
    acceptedPersonalData.value,
)
const validationMessage = computed(() => {
  if (!personalValid.value) return 'Revisa los datos personales y de entrega.'
  if (!cardValid.value) return 'Revisa el número, vencimiento y CVC de la tarjeta.'
  if (!acceptedTerms.value || !acceptedPersonalData.value) {
    return 'Acepta ambos contratos para continuar.'
  }
  return null
})

function formatCop(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCardNumber(): void {
  card.number = normalizeCardNumber(card.number)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

function formatExpiry(): void {
  card.expiry = formatExpiryInput(card.expiry)
}

function clearCard(): void {
  card.number = ''
  card.expiry = ''
  card.cvc = ''
}

async function submitDetails(): Promise<void> {
  attemptedSubmit.value = true
  paymentError.value = null
  if (!formValid.value) return
  if (!config.value.tokenizationKey) {
    paymentError.value = 'La tokenización no está configurada.'
    return
  }

  isTokenizing.value = true
  try {
    paymentToken.value = await tokenizeCard(
      store.state.apiUrl,
      config.value.tokenizationKey,
      {
        ...card,
        holderName: form.fullName,
      },
    )
    store.commit('saveDraft', { ...form })
    clearCard()
    isFormOpen.value = false
    showSummary.value = true
  } catch (error: unknown) {
    paymentError.value =
      error instanceof Error ? error.message : 'No fue posible tokenizar la tarjeta.'
  } finally {
    isTokenizing.value = false
  }
}

function productIcon(slug: string): string {
  return (
    {
      'audifonos-inalambricos': '🎧',
      'parlante-bluetooth': '🔊',
      'teclado-mecanico': '⌨️',
      'reloj-inteligente': '⌚',
    }[slug] ?? '🛍️'
  )
}

function openForm(selectedProduct?: Product): void {
  if (selectedProduct) store.commit('selectProduct', selectedProduct)
  Object.assign(form, store.state.draft)
  attemptedSubmit.value = false
  paymentError.value = null
  paymentToken.value = null
  acceptedTerms.value = false
  acceptedPersonalData.value = false
  isFormOpen.value = true
}

async function confirmPayment(): Promise<void> {
  if (!product.value || !paymentToken.value) return
  isPaying.value = true
  paymentError.value = null

  try {
    const response = await fetch(`${store.state.apiUrl}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.value.id,
        customer: {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
        },
        delivery: {
          recipientName: form.recipientName,
          address: form.address,
          city: form.city,
          department: form.department,
          notes: form.notes || undefined,
        },
        paymentToken: paymentToken.value,
        installments: form.installments,
        acceptedTerms: acceptedTerms.value,
        acceptedPersonalData: acceptedPersonalData.value,
      }),
    })
    const body = (await response.json()) as CheckoutResult & { message?: string | string[] }
    if (!response.ok) {
      throw new Error(
        Array.isArray(body.message) ? body.message.join(' ') : body.message || 'Pago rechazado.',
      )
    }

    transaction.value = body
    window.localStorage.setItem('checkout-transaction-reference', body.reference)
    showSummary.value = false
    paymentToken.value = null
    if (body.status === 'PENDING') void pollTransaction(body.reference)
  } catch (error: unknown) {
    paymentError.value =
      error instanceof Error ? error.message : 'No fue posible procesar el pago.'
  } finally {
    isPaying.value = false
  }
}

async function fetchTransaction(reference: string): Promise<CheckoutResult> {
  const response = await fetch(
    `${store.state.apiUrl}/transactions/${encodeURIComponent(reference)}`,
  )
  if (!response.ok) throw new Error('No fue posible recuperar la transacción.')
  return (await response.json()) as CheckoutResult
}

async function pollTransaction(reference: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1_000))
    try {
      const current = await fetchTransaction(reference)
      transaction.value = current
      if (current.status !== 'PENDING') return
    } catch {
      paymentError.value = 'Seguiremos consultando el resultado de forma segura.'
    }
  }
}

async function recoverTransaction(): Promise<void> {
  const reference = window.localStorage.getItem('checkout-transaction-reference')
  if (!reference) return
  try {
    transaction.value = await fetchTransaction(reference)
    if (transaction.value.status === 'PENDING') void pollTransaction(reference)
  } catch {
    window.localStorage.removeItem('checkout-transaction-reference')
  }
}

async function returnToProduct(): Promise<void> {
  transaction.value = null
  paymentError.value = null
  window.localStorage.removeItem('checkout-transaction-reference')
  await store.dispatch('fetchCheckoutData')
}

function statusTitle(status: PaymentStatus): string {
  return (
    {
      PENDING: 'Procesando pago',
      APPROVED: 'Pago aprobado',
      DECLINED: 'Pago rechazado',
      VOIDED: 'Pago anulado',
      ERROR: 'No pudimos completar el pago',
    } as const
  )[status]
}

onMounted(async () => {
  await store.dispatch('fetchCheckoutData')
  await recoverTransaction()
})
</script>

<template>
  <main class="checkout-shell">
    <section class="checkout-card catalog" aria-labelledby="checkout-title">
      <p class="eyebrow">Compra segura</p>
      <h1 id="checkout-title">Elige tu producto</h1>
      <p class="catalog-description">
        Tecnología para todos los días, con pago y entrega seguros.
      </p>
      <div v-if="store.state.isLoading" class="loading" aria-live="polite">
        Cargando productos…
      </div>
      <div v-else-if="store.state.error" class="alert" role="alert">
        {{ store.state.error }}
        <button
          type="button"
          class="text-button"
          @click="store.dispatch('fetchCheckoutData')"
        >
          Reintentar
        </button>
      </div>
      <div v-else-if="products.length" class="product-grid">
        <article v-for="item in products" :key="item.id" class="product-card">
          <div class="product-icon" aria-hidden="true">{{ productIcon(item.slug) }}</div>
          <h2>{{ item.name }}</h2>
          <p class="description">{{ item.description }}</p>
          <div class="product-meta">
            <strong>{{ formatCop(item.price) }}</strong>
            <span :class="{ soldout: item.stock === 0 }">
              {{ item.stock }} unidades disponibles
            </span>
          </div>
          <button
            class="primary-button"
            type="button"
            :disabled="item.stock === 0"
            @click="openForm(item)"
          >
            Pagar con tarjeta
          </button>
        </article>
      </div>
      <div v-else class="alert" role="alert">No hay productos disponibles.</div>
    </section>

    <div
      v-if="isFormOpen"
      class="backdrop"
      role="presentation"
      @click.self="isFormOpen = false"
    >
      <form class="modal" aria-labelledby="details-title" @submit.prevent="submitDetails">
        <button
          class="close-button"
          type="button"
          aria-label="Cerrar"
          @click="isFormOpen = false"
        >
          ×
        </button>
        <p class="eyebrow">Paso 1 de 2</p>
        <h2 id="details-title">Datos de pago y entrega</h2>
        <fieldset>
          <legend>Datos personales</legend>
          <label>
            Nombre completo
            <input v-model.trim="form.fullName" autocomplete="name" required />
          </label>
          <label>
            Correo electrónico
            <input v-model.trim="form.email" type="email" autocomplete="email" required />
          </label>
          <label>
            Teléfono
            <input v-model.trim="form.phone" inputmode="tel" autocomplete="tel" required />
          </label>
        </fieldset>
        <fieldset>
          <legend>Entrega</legend>
          <label>Recibe<input v-model.trim="form.recipientName" required /></label>
          <label>
            Dirección
            <input v-model.trim="form.address" autocomplete="street-address" required />
          </label>
          <div class="two-columns">
            <label>Ciudad<input v-model.trim="form.city" required /></label>
            <label>Departamento<input v-model.trim="form.department" required /></label>
          </div>
          <label>
            Notas opcionales
            <textarea v-model.trim="form.notes" rows="2" />
          </label>
        </fieldset>
        <fieldset>
          <legend>Tarjeta</legend>
          <label>
            Número de tarjeta
            <input
              v-model="card.number"
              inputmode="numeric"
              autocomplete="cc-number"
              maxlength="23"
              placeholder="0000 0000 0000 0000"
              required
              @input="formatCardNumber"
            />
          </label>
          <p v-if="card.number" class="hint">{{ brand ?? 'Solo Visa o Mastercard' }}</p>
          <div class="two-columns">
            <label>
              Vencimiento
              <input
                v-model="card.expiry"
                inputmode="numeric"
                autocomplete="cc-exp"
                placeholder="MM/AA"
                maxlength="5"
                required
                @input="formatExpiry"
              />
            </label>
            <label>
              CVC
              <input
                v-model="card.cvc"
                inputmode="numeric"
                autocomplete="cc-csc"
                maxlength="4"
                required
              />
            </label>
          </div>
          <label>
            Cuotas
            <select v-model.number="form.installments">
              <option v-for="number in 12" :key="number" :value="number">
                {{ number }} cuota{{ number > 1 ? 's' : '' }}
              </option>
            </select>
          </label>
        </fieldset>
        <fieldset class="contracts">
          <legend>Autorizaciones</legend>
          <label class="checkbox-label">
            <input v-model="acceptedTerms" type="checkbox" />
            <span>
              Leí y acepto los
              <a
                :href="config.contracts?.termsUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                términos de uso
              </a>
            </span>
          </label>
          <label class="checkbox-label">
            <input v-model="acceptedPersonalData" type="checkbox" />
            <span>
              Acepto la
              <a
                :href="config.contracts?.personalDataUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                autorización de datos personales
              </a>
            </span>
          </label>
        </fieldset>
        <p v-if="attemptedSubmit && validationMessage" class="field-error" role="alert">
          {{ validationMessage }}
        </p>
        <p v-if="paymentError" class="field-error" role="alert">{{ paymentError }}</p>
        <button class="primary-button" type="submit" :disabled="isTokenizing">
          {{ isTokenizing ? 'Protegiendo datos…' : 'Continuar al resumen' }}
        </button>
        <p class="security-note">
          La tarjeta se cifra y tokeniza directamente; PAN, CVC y token nunca se guardan.
        </p>
      </form>
    </div>

    <div v-if="showSummary && product" class="backdrop" role="presentation">
      <section class="modal summary" aria-labelledby="summary-title">
        <p class="eyebrow">Paso 2 de 2</p>
        <h2 id="summary-title">Resumen de pago</h2>
        <dl>
          <div>
            <dt>{{ product.name }}</dt>
            <dd>{{ formatCop(product.price) }}</dd>
          </div>
          <div><dt>Tarifa base</dt><dd>{{ formatCop(config.baseFee) }}</dd></div>
          <div><dt>Envío</dt><dd>{{ formatCop(config.deliveryFee) }}</dd></div>
          <div class="total"><dt>Total</dt><dd>{{ formatCop(total) }}</dd></div>
        </dl>
        <p v-if="paymentError" class="field-error" role="alert">{{ paymentError }}</p>
        <button
          class="primary-button"
          type="button"
          :disabled="isPaying"
          @click="confirmPayment"
        >
          {{ isPaying ? 'Procesando…' : 'Confirmar pago' }}
        </button>
        <button
          class="text-button"
          type="button"
          :disabled="isPaying"
          @click="showSummary = false; openForm()"
        >
          Editar datos
        </button>
      </section>
    </div>

    <div v-if="transaction" class="backdrop" role="presentation">
      <section class="modal result" aria-labelledby="result-title" aria-live="polite">
        <div class="status-icon" :data-status="transaction.status" aria-hidden="true">
          {{ transaction.status === 'APPROVED' ? '✓' : transaction.status === 'PENDING' ? '…' : '!' }}
        </div>
        <p class="eyebrow">Resultado</p>
        <h2 id="result-title">{{ statusTitle(transaction.status) }}</h2>
        <p>Referencia: <strong>{{ transaction.reference }}</strong></p>
        <p>Total: <strong>{{ formatCop(transaction.total) }}</strong></p>
        <p v-if="transaction.status === 'PENDING'">Estamos verificando el estado final.</p>
        <p v-if="paymentError" class="field-error">{{ paymentError }}</p>
        <button
          v-if="transaction.status !== 'PENDING'"
          class="primary-button"
          type="button"
          @click="returnToProduct"
        >
          Volver a productos
        </button>
      </section>
    </div>
  </main>
</template>
