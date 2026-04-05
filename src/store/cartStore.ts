'use client'

import { create } from 'zustand'
import { CartItem } from '@/types'

interface CartStore {
  items: CartItem[]
  payment_method: 'cash' | 'gcash'
  amount_tendered: number
  gcash_reference: string
  addItem: (item: CartItem) => void
  removeItem: (product_id: string) => void
  updateQuantity: (product_id: string, quantity: number) => void
  setPaymentMethod: (method: 'cash' | 'gcash') => void
  setAmountTendered: (amount: number) => void
  setGcashReference: (ref: string) => void
  clearCart: () => void
  getSubtotal: () => number
  getChange: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  payment_method: 'cash',
  amount_tendered: 0,
  gcash_reference: '',

  addItem: (newItem) => {
    const items = get().items
    const existing = items.find((i) => i.product_id === newItem.product_id)
    if (existing) {
      set({
        items: items.map((i) =>
          i.product_id === newItem.product_id
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.selling_price }
            : i
        ),
      })
    } else {
      set({ items: [...items, newItem] })
    }
  },

  removeItem: (product_id) => {
    set({ items: get().items.filter((i) => i.product_id !== product_id) })
  },

  updateQuantity: (product_id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(product_id)
      return
    }
    set({
      items: get().items.map((i) =>
        i.product_id === product_id
          ? { ...i, quantity, subtotal: quantity * i.selling_price }
          : i
      ),
    })
  },

  setPaymentMethod: (method) => set({ payment_method: method }),
  setAmountTendered: (amount) => set({ amount_tendered: amount }),
  setGcashReference: (ref) => set({ gcash_reference: ref }),

  clearCart: () =>
    set({ items: [], payment_method: 'cash', amount_tendered: 0, gcash_reference: '' }),

  getSubtotal: () => get().items.reduce((sum, i) => sum + i.subtotal, 0),

  getChange: () => {
    const subtotal = get().getSubtotal()
    const tendered = get().amount_tendered
    return Math.max(0, tendered - subtotal)
  },
}))
