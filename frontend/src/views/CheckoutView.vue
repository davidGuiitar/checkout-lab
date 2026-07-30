<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useStore } from 'vuex'
import { detectCardBrand, isValidCvc, isValidExpiry, isValidLuhn, normalizeCardNumber } from '../lib/payment-validators'
import type { CheckoutDraft, CheckoutState } from '../store'

const store = useStore<CheckoutState>()
const isFormOpen = ref(false)
const showSummary = ref(false)
const attemptedSubmit = ref(false)
const card = reactive({ number: '', expiry: '', cvc: '' })
const form = reactive<CheckoutDraft>({ ...store.state.draft })

const product = computed(() => store.state.product)
const config = computed(() => store.state.config)
const brand = computed(() => detectCardBrand(card.number))
const total = computed(() => (product.value?.price ?? 0) + config.value.baseFee + config.value.deliveryFee)
const cardValid = computed(() => Boolean(brand.value) && isValidLuhn(card.number) && isValidExpiry(card.expiry) && isValidCvc(card.cvc, brand.value))
const personalValid = computed(() => Boolean(form.fullName && form.email.includes('@') && form.phone && form.recipientName && form.address && form.city && form.department && form.installments > 0))
const formValid = computed(() => personalValid.value && cardValid.value)

function formatCop(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
}

function formatCardNumber(): void {
  card.number = normalizeCardNumber(card.number).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

function submitDetails(): void {
  attemptedSubmit.value = true
  if (!formValid.value) return
  store.commit('saveDraft', { ...form })
  card.number = ''
  card.expiry = ''
  card.cvc = ''
  isFormOpen.value = false
  showSummary.value = true
}

function openForm(): void {
  Object.assign(form, store.state.draft)
  attemptedSubmit.value = false
  isFormOpen.value = true
}

onMounted(() => void store.dispatch('fetchCheckoutData'))
</script>

<template>
  <main class="checkout-shell">
    <section class="checkout-card" aria-labelledby="checkout-title">
      <p class="eyebrow">Compra segura</p>
      <div v-if="store.state.isLoading" class="loading" aria-live="polite">Cargando producto…</div>
      <div v-else-if="store.state.error" class="alert" role="alert">
        {{ store.state.error }}
        <button type="button" class="text-button" @click="store.dispatch('fetchCheckoutData')">Reintentar</button>
      </div>
      <template v-else-if="product">
        <div class="product-icon" aria-hidden="true">♫</div>
        <h1 id="checkout-title">{{ product.name }}</h1>
        <p class="description">{{ product.description }}</p>
        <div class="product-meta">
          <strong>{{ formatCop(product.price) }}</strong>
          <span :class="{ soldout: product.stock === 0 }">{{ product.stock }} unidades disponibles</span>
        </div>
        <button class="primary-button" type="button" :disabled="product.stock === 0" @click="openForm">
          Pagar con tarjeta
        </button>
      </template>
    </section>

    <div v-if="isFormOpen" class="backdrop" role="presentation" @click.self="isFormOpen = false">
      <form class="modal" aria-labelledby="details-title" @submit.prevent="submitDetails">
        <button class="close-button" type="button" aria-label="Cerrar" @click="isFormOpen = false">×</button>
        <p class="eyebrow">Paso 1 de 2</p>
        <h2 id="details-title">Datos de pago y entrega</h2>
        <fieldset>
          <legend>Datos personales</legend>
          <label>Nombre completo<input v-model.trim="form.fullName" autocomplete="name" required /></label>
          <label>Correo electrónico<input v-model.trim="form.email" type="email" autocomplete="email" required /></label>
          <label>Teléfono<input v-model.trim="form.phone" inputmode="tel" autocomplete="tel" required /></label>
        </fieldset>
        <fieldset>
          <legend>Entrega</legend>
          <label>Recibe<input v-model.trim="form.recipientName" required /></label>
          <label>Dirección<input v-model.trim="form.address" autocomplete="street-address" required /></label>
          <div class="two-columns"><label>Ciudad<input v-model.trim="form.city" required /></label><label>Departamento<input v-model.trim="form.department" required /></label></div>
          <label>Notas opcionales<textarea v-model.trim="form.notes" rows="2" /></label>
        </fieldset>
        <fieldset>
          <legend>Tarjeta</legend>
          <label>Número de tarjeta<input v-model="card.number" inputmode="numeric" autocomplete="cc-number" maxlength="23" placeholder="0000 0000 0000 0000" @input="formatCardNumber" required /></label>
          <p v-if="card.number" class="hint">{{ brand ?? 'Solo Visa o Mastercard' }}</p>
          <div class="two-columns"><label>Vencimiento<input v-model="card.expiry" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5" required /></label><label>CVC<input v-model="card.cvc" inputmode="numeric" autocomplete="cc-csc" maxlength="4" required /></label></div>
          <label>Cuotas<select v-model.number="form.installments"><option v-for="number in 12" :key="number" :value="number">{{ number }} cuota{{ number > 1 ? 's' : '' }}</option></select></label>
        </fieldset>
        <p v-if="attemptedSubmit && !formValid" class="field-error" role="alert">Revisa los datos de entrega y de tarjeta.</p>
        <button class="primary-button" type="submit">Continuar al resumen</button>
        <p class="security-note">Los datos de tarjeta se usan solo para tokenizar el pago y no se guardan.</p>
      </form>
    </div>

    <div v-if="showSummary && product" class="backdrop" role="presentation">
      <section class="modal summary" aria-labelledby="summary-title">
        <p class="eyebrow">Paso 2 de 2</p>
        <h2 id="summary-title">Resumen de pago</h2>
        <dl>
          <div><dt>{{ product.name }}</dt><dd>{{ formatCop(product.price) }}</dd></div>
          <div><dt>Tarifa base</dt><dd>{{ formatCop(config.baseFee) }}</dd></div>
          <div><dt>Envío</dt><dd>{{ formatCop(config.deliveryFee) }}</dd></div>
          <div class="total"><dt>Total</dt><dd>{{ formatCop(total) }}</dd></div>
        </dl>
        <button class="primary-button" type="button" disabled title="Disponible al integrar la pasarela">Confirmar pago</button>
        <button class="text-button" type="button" @click="showSummary = false; openForm()">Editar datos</button>
      </section>
    </div>
  </main>
</template>
