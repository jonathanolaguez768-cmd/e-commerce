import { create } from 'zustand'
import { useCartStore } from './cartStore'
export type AuthUser = {
  id: number
  nombre: string
  email: string
  rol: string
}

type AuthStore = {
  user: AuthUser | null
  setUser: (user: AuthUser) => void
  clearUser: () => void
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
 clearUser: () => {
    useCartStore.getState().clearCart()
    set({ user: null })
  },
}))
