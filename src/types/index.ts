export type UserRole = 'admin' | 'cashier'

export interface User {
  id: string
  username: string
  role: UserRole
  full_name: string | null
  is_active: boolean
  created_at: string
}

export interface Category {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface Product {
  id: string
  barcode: string | null
  name: string
  category_id: string | null
  category?: Category
  buying_price: number
  selling_price: number
  stock: number
  low_stock_threshold: number
  expiry_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface InventoryLog {
  id: string
  product_id: string
  product?: Product
  type: 'restock' | 'adjustment' | 'return'
  quantity: number
  buying_price: number | null
  notes: string | null
  performed_by: string | null
  created_at: string
}

export interface CashSession {
  id: string
  date: string
  starting_cash: number
  ending_cash: number | null
  total_cash_sales: number
  total_gcash_sales: number
  total_expenses: number
  notes: string | null
  status: 'open' | 'closed'
  opened_by: string | null
  closed_by: string | null
  created_at: string
}

export interface Transaction {
  id: string
  transaction_number: string
  cash_session_id: string | null
  payment_method: 'cash' | 'gcash'
  subtotal: number
  total: number
  amount_tendered: number | null
  change_amount: number
  status: 'completed' | 'voided' | 'held'
  notes: string | null
  served_by: string | null
  items?: TransactionItem[]
  created_at: string
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_id: string | null
  product_name: string
  quantity: number
  buying_price: number
  selling_price: number
  subtotal: number
  created_at: string
}

export interface GcashReference {
  id: string
  transaction_id: string
  reference_number: string
  amount: number
  created_at: string
}

export interface Refund {
  id: string
  transaction_id: string | null
  product_id: string | null
  product_name: string
  quantity: number
  refund_amount: number
  reason: string | null
  restock: boolean
  performed_by: string | null
  created_at: string
}

export interface Utang {
  id: string
  customer_name: string
  total_amount: number
  paid_amount: number
  balance: number
  status: 'unpaid' | 'partial' | 'paid'
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UtangPayment {
  id: string
  utang_id: string
  amount: number
  payment_method: 'cash' | 'gcash'
  gcash_reference: string | null
  notes: string | null
  received_by: string | null
  created_at: string
}

export interface Expense {
  id: string
  cash_session_id: string | null
  category: string
  description: string
  amount: number
  recorded_by: string | null
  created_at: string
}

export interface StoreSettings {
  id: string
  store_name: string
  address: string | null
  phone: string | null
  receipt_footer: string | null
  low_stock_default: number
}

export interface CartItem {
  product_id: string
  product_name: string
  barcode: string | null
  quantity: number
  buying_price: number
  selling_price: number
  subtotal: number
}

export interface Cart {
  items: CartItem[]
  subtotal: number
  total: number
  payment_method: 'cash' | 'gcash'
  amount_tendered: number
  change_amount: number
  gcash_reference: string
}

export interface OfflineQueueItem {
  id: string
  type: 'transaction' | 'restock' | 'utang' | 'expense' | 'utang_payment'
  data: unknown
  created_at: string
  synced: boolean
}
