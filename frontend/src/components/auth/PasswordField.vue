<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import Icon from '../Icon.vue'

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    modelValue: string
    autocomplete?: string
    hint?: string
    error?: string
    disabled?: boolean
  }>(),
  {
    autocomplete: 'current-password',
    hint: '',
    error: '',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  input: []
}>()

const revealed = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

const inputType = computed(() => (revealed.value ? 'text' : 'password'))
const toggleLabel = computed(() => (revealed.value ? 'Ocultar senha' : 'Mostrar senha'))
const hintId = computed(() => `${props.id}-hint`)
const errorId = computed(() => `${props.id}-error`)
const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})

async function toggleVisibility() {
  revealed.value = !revealed.value
  await nextTick()
  inputEl.value?.focus()
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
  emit('input')
}
</script>

<template>
  <div class="password-field" :class="{ 'password-field--error': Boolean(error) }">
    <label :for="id">{{ label }}</label>
    <div class="password-field__control">
      <input
        :id="id"
        ref="inputEl"
        :type="inputType"
        :value="modelValue"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        spellcheck="false"
        @input="onInput"
      />
      <button
        type="button"
        class="password-field__toggle"
        :aria-pressed="revealed"
        :aria-label="toggleLabel"
        :disabled="disabled"
        @click="toggleVisibility"
      >
        <Icon :name="revealed ? 'eye-off' : 'eye'" :size="18" />
      </button>
    </div>
    <p v-if="error" :id="errorId" class="password-field__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="password-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.password-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.password-field__control {
  position: relative;
  display: flex;
  align-items: center;
}

.password-field__control input {
  width: 100%;
  min-height: 44px;
  padding-right: 52px;
}

.password-field__toggle {
  position: absolute;
  right: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 44px;
  block-size: 44px;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

.password-field__toggle:hover {
  background: var(--raised);
  color: var(--text);
}

.password-field__hint,
.password-field__error {
  margin: var(--s-2) 0 0;
  font-size: var(--text-xs);
  line-height: 1.45;
}

.password-field__hint {
  color: var(--text-muted);
}

.password-field__error {
  color: var(--danger-ink);
}

.password-field--error .password-field__control input {
  border-color: var(--danger);
}
</style>
