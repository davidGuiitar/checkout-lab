declare module 'vuex' {
  import type { App } from 'vue'

  export interface Store<T> {
    state: T
    install(app: App): void
  }

  export function createStore<T>(options: { state: T }): Store<T>
}
