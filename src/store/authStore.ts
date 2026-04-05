'use client'

import { create } from 'zustand'
import { User } from '@/types'
import { getStoredUser, logout as authLogout } from '@/lib/auth'

interface AuthStore {
  user: User | null
  setUser: (user: User | null) => void
  logout: () => void
  initialize: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => {
    authLogout()
    set({ user: null })
  },
  initialize: () => {
    const user = getStoredUser()
    set({ user })
  },
}))
