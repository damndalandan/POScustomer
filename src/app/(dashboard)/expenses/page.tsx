'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Expense } from '@/types'
import { getStoredUser } from '@/lib/auth'
import { addToQueue } from '@/lib/db'

const EXPENSE_CATEGORIES = ['Supplies', 'Utilities', 'Transport', 'Food', 'Maintenance', 'Salary', 'Others']

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState<'today' | 'week' | 'month'>('today')
  const [form, setForm] = useState({ category: '', description: '', amount: '' })
  const user = getStoredUser()

  useEffect(() => { loadExpenses() }, [filter])

  async function loadExpenses() {
    const now = new Date()
    let from = new Date()

    if (filter === 'today') from.setHours(0, 0, 0, 0)
    else if (filter === 'week') from.setDate(now.getDate() - 7)
    else from.setDate(1)

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: false })

    if (data) setExpenses(data)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function handleSave() {
    if (!form.category || !form.description || !form.amount) {
      showToast('⚠️ All fields required!')
      return
    }

    const expense = {
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount),
      recorded_by: user?.id || null,
    }

    try {
      if (navigator.onLine) {
        const { error } = await supabase.from('expenses').insert(expense)
        if (error) throw error
      } else {
        await addToQueue('expense', expense)
      }
      showToast('✅ Expense recorded!')
      setShowForm(false)
      setForm({ category: '', description: '', amount: '' })
      loadExpenses()
    } catch {
      showToast('❌ Error saving expense')
    }
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  const byCategory = EXPENSE_CATEGORIES.map(cat => ({
    category: cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.total > 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-white text-sm shadow-lg" style={{ backgroundColor: '#3d2c2c' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="p-4" style={{ backgroundColor: '#f5f0ee' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs" style={{ color: '#9e8585' }}>Total Expenses</p>
            <p className="text-2xl font-bold" style={{ color: '#c47a7a' }}>₱{total.toFixed(2)}</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #c4a09a, #b08a8a)' }}
          >
            + Add Expense
          </button>
        </div>

        <div className="flex gap-2">
          {(['today', 'week', 'month'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex-1 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                backgroundColor: filter === f ? '#b08a8a' : '#e8ddd9',
                color: filter === f ? 'white' : '#9e8585',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {/* Category breakdown */}
        {byCategory.length > 0 && (
          <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #e8ddd9' }}>
            <p className="text-xs font-medium mb-3" style={{ color: '#9e8585' }}>BY CATEGORY</p>
            <div className="space-y-2">
              {byCategory.map(c => (
                <div key={c.category} className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: '#3d2c2c' }}>{c.category}</span>
                  <span className="text-sm font-semibold" style={{ color: '#c47a7a' }}>₱{c.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expense list */}
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: '#9e8585' }}>
            <p className="text-4xl mb-2">🧾</p>
            <p className="text-sm">No expenses recorded</p>
          </div>
        ) : (
          expenses.map(expense => (
            <div key={expense.id} className="bg-white rounded-2xl p-4 flex items-center gap-3" style={{ border: '1px solid #e8ddd9' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: '#f9e8e8' }}>
                🧾
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: '#3d2c2c' }}>{expense.description}</p>
                <p className="text-xs" style={{ color: '#9e8585' }}>
                  {expense.category} · {new Date(expense.created_at).toLocaleDateString('en-PH')}
                </p>
              </div>
              <p className="font-bold text-sm flex-shrink-0" style={{ color: '#c47a7a' }}>
                ₱{expense.amount.toFixed(2)}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Add Expense Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-3xl p-5 shadow-xl" style={{ backgroundColor: '#fff' }}>
            <h3 className="font-bold text-base mb-4" style={{ color: '#3d2c2c' }}>🧾 New Expense</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium tracking-wide block mb-1" style={{ color: '#9e8585' }}>CATEGORY *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: '#f5f0ee', border: '1.5px solid #e8ddd9', color: '#3d2c2c' }}
                >
                  <option value="">Select category</option>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium tracking-wide block mb-1" style={{ color: '#9e8585' }}>DESCRIPTION *</label>
                <input
                  type="text"
                  placeholder="e.g. Electricity bill"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: '#f5f0ee', border: '1.5px solid #e8ddd9', color: '#3d2c2c' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium tracking-wide block mb-1" style={{ color: '#9e8585' }}>AMOUNT (₱) *</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: '#f5f0ee', border: '1.5px solid #e8ddd9', color: '#3d2c2c' }}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ backgroundColor: '#f5f0ee', color: '#9e8585' }}>Cancel</button>
              <button onClick={handleSave} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #c4a09a, #b08a8a)' }}>Save Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
