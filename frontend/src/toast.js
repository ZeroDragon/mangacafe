import { reactive } from 'vue'

// Store de toasts: [{ id, type, message }]. type ∈ {info, success, error}
const state = reactive({ items: [] })
let seq = 0

const push = (type, message, timeout = 3500) => {
  const id = ++seq
  state.items.push({ id, type, message })
  if (timeout > 0) {
    setTimeout(() => { dismiss(id) }, timeout)
  }
  return id
}

const dismiss = (id) => {
  const i = state.items.findIndex(t => t.id === id)
  if (i >= 0) state.items.splice(i, 1)
}

// Instancia singleton (accesible desde componentes vía import directo).
const manager = {
  state,
  info: (m, t) => push('info', m, t),
  success: (m, t) => push('success', m, t),
  error: (m, t) => push('error', m, t),
  dismiss
}

// Plugin para this.$toast en Options API.
const toast = {
  install: (app) => {
    app.config.globalProperties.$toast = manager
  }
}

export { manager }
export default toast
