import { supabase } from '@/lib/supabase'
import { getUnsyncedItems, markAsSynced, clearSyncedItems } from './db'

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const items = await getUnsyncedItems()
  if (items.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const item of items) {
    try {
      switch (item.type) {
        case 'transaction': await syncTransaction(item.data); break
        case 'restock': await syncRestock(item.data); break
        case 'utang': await syncUtang(item.data); break
        case 'expense': await syncExpense(item.data); break
        case 'utang_payment': await syncUtangPayment(item.data); break
      }
      await markAsSynced(item.id)
      synced++
    } catch (error) {
      console.error(`Failed to sync item ${item.id}:`, error)
      failed++
    }
  }

  await clearSyncedItems()
  return { synced, failed }
}

async function syncTransaction(data: unknown) {
  const { transaction, items, gcash_reference } = data as {
    transaction: Record<string, unknown>
    items: Record<string, unknown>[]
    gcash_reference?: string
  }

  const { data: txn, error } = await supabase.from('transactions').insert(transaction).select().single()
  if (error) throw error

  const itemsWithTxnId = items.map((item) => ({ ...item, transaction_id: txn.id }))
  const { error: itemsError } = await supabase.from('transaction_items').insert(itemsWithTxnId)
  if (itemsError) throw itemsError

  if (gcash_reference) {
    await supabase.from('gcash_references').insert({
      transaction_id: txn.id,
      reference_number: gcash_reference,
      amount: transaction.total,
    })
  }

  for (const item of items) {
    await supabase.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_quantity: item.quantity,
    })
  }

  // Handle Offline Utang Checkout
  if (transaction.status === 'held' && typeof transaction.notes === 'string' && transaction.notes.startsWith('Customer: ')) {
    const customerName = transaction.notes.replace('Customer: ', '').trim()
    const subtotal = transaction.total as number

    const { data: existingUtang } = await supabase
      .from('utang').select('*').ilike('customer_name', customerName).single()
    
    if (existingUtang) {
      const newTotal = existingUtang.total_amount + subtotal
      const newStatus = existingUtang.paid_amount >= newTotal ? 'paid' : existingUtang.paid_amount > 0 ? 'partial' : 'unpaid'
      await supabase.from('utang').update({ total_amount: newTotal, status: newStatus }).eq('id', existingUtang.id)
      await supabase.from('utang_items').insert({ utang_id: existingUtang.id, amount: subtotal, notes: `POS - ${transaction.transaction_number}` })
    } else {
      const { data: newUtang } = await supabase.from('utang').insert({
        customer_name: customerName, total_amount: subtotal,
        paid_amount: 0, balance: subtotal, status: 'unpaid', created_by: transaction.served_by,
      }).select().single()
      if (newUtang) {
        await supabase.from('utang_items').insert({ utang_id: newUtang.id, amount: subtotal, notes: `POS - ${transaction.transaction_number}` })
      }
    }
  }
}

async function syncRestock(data: unknown) {
  const { inventory_log, product_id, quantity } = data as {
    inventory_log: Record<string, unknown>
    product_id: string
    quantity: number
  }
  const { error } = await supabase.from('inventory_logs').insert(inventory_log)
  if (error) throw error
  await supabase.rpc('increment_stock', { p_product_id: product_id, p_quantity: quantity })
}

async function syncUtang(data: unknown) {
  const { error } = await supabase.from('utang').insert(data as Record<string, unknown>)
  if (error) throw error
}

async function syncExpense(data: unknown) {
  const { error } = await supabase.from('expenses').insert(data as Record<string, unknown>)
  if (error) throw error
}

async function syncUtangPayment(data: unknown) {
  const { payment, utang_id, amount } = data as {
    payment: Record<string, unknown>
    utang_id: string
    amount: number
  }
  const { error } = await supabase.from('utang_payments').insert(payment)
  if (error) throw error

  const { data: utang } = await supabase
    .from('utang')
    .select('paid_amount, total_amount')
    .eq('id', utang_id)
    .single()

  if (utang) {
    const new_paid = utang.paid_amount + amount
    const status = new_paid >= utang.total_amount ? 'paid' : new_paid > 0 ? 'partial' : 'unpaid'
    await supabase.from('utang').update({ paid_amount: new_paid, status }).eq('id', utang_id)
  }
}
