declare module 'vuex' {
  import type { App } from 'vue'

  export interface Store<T> {
    state: T
    getters: Record<string, unknown>
    install(app: App): void
    commit(type: string, payload?: unknown): void
    dispatch(type: string, payload?: unknown): Promise<unknown>
  }

  export interface StoreOptions<T> {
    state: T
    getters?: Record<string, (state: T) => unknown>
    mutations?: Record<string, (state: T, payload?: unknown) => void>
    actions?: Record<
      string,
      (context: { commit: Store<T>['commit']; state: T }) => Promise<unknown>
    >
  }

  export function createStore<T>(options: StoreOptions<T>): Store<T>
  export function useStore<T>(): Store<T>
}
