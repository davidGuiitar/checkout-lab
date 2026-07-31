<script setup lang="ts">
import { computed } from 'vue'
import { normalizeCardNumber, type CardBrand } from '../lib/payment-validators'

const props = defineProps<{
  number: string
  holder: string
  expiry: string
  cvc: string
  brand: CardBrand
  showBack: boolean
}>()

const brandClass = computed(() => props.brand?.toLowerCase() ?? 'generic')
const displayNumber = computed(() => {
  const digits = normalizeCardNumber(props.number).slice(0, 16)
  const padded = `${digits}${'•'.repeat(16 - digits.length)}`
  return padded.match(/.{1,4}/g)?.join(' ') ?? '•••• •••• •••• ••••'
})
const displayHolder = computed(
  () => props.holder.trim().toLocaleUpperCase('es-CO').slice(0, 26) || 'NOMBRE DEL TITULAR',
)
const displayExpiry = computed(() => props.expiry || 'MM/AA')
const displayCvc = computed(() => '•'.repeat(Math.max(3, props.cvc.length)))
const brandMessage = computed(() => {
  if (!normalizeCardNumber(props.number)) return 'Ingresa el número para detectar la franquicia'
  return props.brand ? `${props.brand} detectada` : 'Franquicia aún no reconocida'
})
</script>

<template>
  <div class="payment-card-wrap">
    <div
      class="payment-card"
      :class="{ 'is-flipped': showBack }"
      :data-brand="brandClass"
      aria-live="polite"
    >
      <div class="payment-card__inner">
        <section class="payment-card__face payment-card__front">
          <span class="card-orb card-orb--one" />
          <span class="card-orb card-orb--two" />
          <header class="card-topline">
            <span class="card-chip" aria-label="Chip de seguridad">
              <i /><i /><i /><i />
            </span>
            <svg class="contactless" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 7.2c2.8 2.5 2.8 7.1 0 9.6M11.5 4c4.7 4.4 4.7 11.6 0 16M5 10.1c1.1 1 1.1 2.8 0 3.8" />
            </svg>
            <div class="card-brand" :aria-label="brand ?? 'Franquicia sin detectar'">
              <span v-if="brand === 'Visa'" class="visa-logo">VISA</span>
              <span v-else-if="brand === 'Mastercard'" class="mastercard-logo">
                <i /><i /><b>mastercard</b>
              </span>
              <span v-else class="generic-logo">CHECKOUT</span>
            </div>
          </header>

          <p class="card-number">{{ displayNumber }}</p>

          <footer class="card-details">
            <span>
              <small>TITULAR</small>
              <strong>{{ displayHolder }}</strong>
            </span>
            <span>
              <small>VÁLIDA HASTA</small>
              <strong>{{ displayExpiry }}</strong>
            </span>
          </footer>
        </section>

        <section class="payment-card__face payment-card__back" aria-label="Reverso de tarjeta">
          <div class="magnetic-stripe" />
          <div class="signature-row">
            <span>FIRMA AUTORIZADA</span>
            <strong>{{ displayCvc }}</strong>
          </div>
          <div class="back-brand">
            <span v-if="brand === 'Visa'" class="visa-logo">VISA</span>
            <span v-else-if="brand === 'Mastercard'" class="mastercard-logo">
              <i /><i /><b>mastercard</b>
            </span>
            <span v-else class="generic-logo">CHECKOUT</span>
          </div>
          <p>Uso seguro · Datos cifrados</p>
        </section>
      </div>
    </div>

    <p class="brand-status" :class="{ detected: brand, unsupported: number && !brand }">
      <span aria-hidden="true">{{ brand ? '✓' : '◌' }}</span>
      {{ brandMessage }}
    </p>
  </div>
</template>

<style scoped>
.payment-card-wrap { margin: .5rem auto 1.5rem; max-width: 24rem; width: 100%; }
.payment-card { aspect-ratio: 1.586; perspective: 70rem; width: 100%; }
.payment-card__inner { height: 100%; position: relative; transform-style: preserve-3d; transition: transform .55s cubic-bezier(.2, .7, .2, 1); width: 100%; }
.payment-card.is-flipped .payment-card__inner { transform: rotateY(180deg); }
.payment-card__face { backface-visibility: hidden; border: 1px solid rgb(255 255 255 / 22%); border-radius: 1.15rem; box-shadow: 0 18px 38px rgb(16 31 61 / 28%); color: #fff; height: 100%; inset: 0; overflow: hidden; padding: 1.35rem; position: absolute; }
.payment-card__front { background: linear-gradient(135deg, #17233f, #283d68 62%, #385984); display: flex; flex-direction: column; justify-content: space-between; }
.payment-card[data-brand="visa"] .payment-card__face { background: linear-gradient(135deg, #172b85, #174ba7 52%, #3f7fe3); }
.payment-card[data-brand="mastercard"] .payment-card__face { background: linear-gradient(135deg, #1a1c27, #342834 55%, #713321); }
.card-orb { border: 1px solid rgb(255 255 255 / 14%); border-radius: 50%; position: absolute; }
.card-orb--one { height: 12rem; right: -5rem; top: -6rem; width: 12rem; }
.card-orb--two { bottom: -7rem; height: 14rem; left: -5rem; width: 14rem; }
.card-topline { align-items: center; display: flex; position: relative; z-index: 1; }
.card-chip { background: linear-gradient(135deg, #f8e8a8, #c9a74d); border-radius: .4rem; display: grid; grid-template-columns: repeat(2, 1fr); height: 2.2rem; overflow: hidden; width: 2.8rem; }
.card-chip i { border: 1px solid rgb(80 62 16 / 30%); }
.contactless { fill: none; height: 2rem; margin-left: .65rem; stroke: rgb(255 255 255 / 75%); stroke-linecap: round; stroke-width: 1.5; width: 2rem; }
.card-brand { margin-left: auto; min-width: 5.8rem; text-align: right; }
.visa-logo { font-size: 1.65rem; font-style: italic; font-weight: 900; letter-spacing: -.08em; }
.generic-logo { font-size: .72rem; font-weight: 800; letter-spacing: .14em; }
.mastercard-logo { display: inline-block; height: 2.4rem; position: relative; width: 5.5rem; }
.mastercard-logo i { background: #eb001b; border-radius: 50%; height: 1.85rem; position: absolute; right: 1.55rem; top: 0; width: 1.85rem; }
.mastercard-logo i:nth-child(2) { background: #f79e1b; right: .4rem; }
.mastercard-logo b { bottom: 0; font-size: .58rem; font-weight: 600; position: absolute; right: 0; }
.card-number { color: #fff !important; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.18rem, 5.5vw, 1.55rem); letter-spacing: .06em; position: relative; text-shadow: 0 1px 3px rgb(0 0 0 / 35%); white-space: nowrap; z-index: 1; }
.card-details { display: flex; gap: 1rem; justify-content: space-between; position: relative; z-index: 1; }
.card-details span { display: grid; min-width: 0; }
.card-details span:first-child { flex: 1; }
.card-details small { color: rgb(255 255 255 / 65%); font-size: .55rem; letter-spacing: .12em; }
.card-details strong { font-size: .72rem; letter-spacing: .08em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.payment-card__back { background: linear-gradient(135deg, #17233f, #385984); padding: 1.5rem 0; transform: rotateY(180deg); }
.magnetic-stripe { background: #11131a; height: 3.2rem; margin-top: .6rem; width: 100%; }
.signature-row { align-items: center; background: repeating-linear-gradient(0deg, #f8f8f5 0 4px, #e8e9e4 4px 6px); color: #172033; display: flex; justify-content: space-between; margin: 1rem 1.35rem 0; min-height: 2.5rem; padding: .4rem .65rem; }
.signature-row span { font-size: .5rem; letter-spacing: .08em; }
.signature-row strong { background: #fff; font-family: ui-monospace, monospace; padding: .35rem .5rem; }
.back-brand { margin: 1rem 1.35rem 0; text-align: right; }
.payment-card__back > p { bottom: .8rem; color: rgb(255 255 255 / 68%) !important; font-size: .58rem; left: 1.35rem; letter-spacing: .08em; position: absolute; text-transform: uppercase; }
.brand-status { align-items: center; display: flex; font-size: .78rem; gap: .4rem; justify-content: center; margin-top: .85rem !important; }
.brand-status span { align-items: center; background: #e8edf5; border-radius: 50%; display: inline-flex; height: 1.25rem; justify-content: center; width: 1.25rem; }
.brand-status.detected { color: #236b44 !important; font-weight: 700; }
.brand-status.detected span { background: #dff4e8; }
.brand-status.unsupported { color: #9a5515 !important; }
@media (prefers-reduced-motion: reduce) { .payment-card__inner { transition: none; } }
</style>
