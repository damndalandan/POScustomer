'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Utang } from '@/types'
import { getStoredUser } from '@/lib/auth'

interface UtangItem {
  id: string
  utang_id: string
  amount: number
  notes: string | null
  created_at: string
}

interface UtangPayment {
  id: string
  utang_id: string
  amount: number
  payment_method: string
  gcash_reference: string | null
  created_at: string
}

export default function UtangPage() {
  const user = getStoredUser()
  const [utangs, setUtangs] = useState<Utang[]>([])
  const [selectedUtang, setSelectedUtang] = useState<Utang | null>(null)
  const [utangItems, setUtangItems] = useState<UtangItem[]>([])
  const [utangPayments, setUtangPayments] = useState<UtangPayment[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('unpaid')
  const [activeTab, setActiveTab] = useState<'items' | 'payments'>('items')
  const [showAddUtang, setShowAddUtang] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [toast, setToast] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [itemForm, setItemForm] = useState({ amount: '', notes: '' })
  const [payment, setPayment] = useState({ amount: '', tendered: '', method: 'cash', gcash_ref: '' })

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (selectedUtang) loadUtangDetails(selectedUtang.id)
  }, [selectedUtang])

  async function loadData() {
    const { data } = await supabase.from('utang').select('*').order('customer_name')
    if (data) {
      setUtangs(data)
      // Re-select to refresh
      if (selectedUtang) {
        const updated = data.find(u => u.id === selectedUtang.id)
        if (updated) setSelectedUtang(updated)
      }
    }
  }

  async function loadUtangDetails(utangId: string) {
    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from('utang_items').select('*').eq('utang_id', utangId).order('created_at', { ascending: false }),
      supabase.from('utang_payments').select('*').eq('utang_id', utangId).order('created_at', { ascending: false }),
    ])
    if (items) setUtangItems(items)
    if (payments) setUtangPayments(payments)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function handleAddCustomer() {
    if (!customerName.trim()) { showToast('⚠️ Customer name required!'); return }
    // Check if exists
    const existing = utangs.find(u => u.customer_name.toLowerCase() === customerName.trim().toLowerCase())
    if (existing) { showToast('⚠️ Customer already exists!'); setSelectedUtang(existing); setShowAddCustomer(false); return }
    const { data, error } = await supabase.from('utang').insert({
      customer_name: customerName.trim(),
      total_amount: 0, paid_amount: 0, status: 'unpaid',
      created_by: user?.id || null,
    }).select().single()
    if (error) { showToast('❌ Error adding customer'); return }
    showToast('✅ Customer added!')
    setCustomerName('')
    setShowAddCustomer(false)
    await loadData()
    if (data) setSelectedUtang(data)
  }

  async function handleAddItem() {
    if (!selectedUtang || !itemForm.amount) { showToast('⚠️ Amount required!'); return }
    const amt = parseFloat(itemForm.amount)
    const { error: itemError } = await supabase.from('utang_items').insert({
      utang_id: selectedUtang.id, amount: amt, notes: itemForm.notes || null,
    })
    if (itemError) { showToast('❌ Error adding utang'); return }
    // Update total
    const newTotal = selectedUtang.total_amount + amt
    const newStatus = selectedUtang.paid_amount >= newTotal ? 'paid' : selectedUtang.paid_amount > 0 ? 'partial' : 'unpaid'
    await supabase.from('utang').update({ total_amount: newTotal, status: newStatus }).eq('id', selectedUtang.id)
    showToast('✅ Utang added!')
    setItemForm({ amount: '', notes: '' })
    setShowAddItem(false)
    loadData()
  }

  async function handlePayment() {
    if (!selectedUtang || !payment.amount) { showToast('⚠️ Enter payment amount!'); return }
    const amt = parseFloat(payment.amount)
    const tendered = parseFloat(payment.tendered) || amt
    if (amt > selectedUtang.balance) { showToast('⚠️ Payment exceeds balance!'); return }
    if (tendered < amt) { showToast('⚠️ Amount tendered is less than payment!'); return }
    const newPaid = selectedUtang.paid_amount + amt
    const status = newPaid >= selectedUtang.total_amount ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'
    const { error } = await supabase.from('utang_payments').insert({
      utang_id: selectedUtang.id, amount: amt,
      payment_method: payment.method,
      gcash_reference: payment.method === 'gcash' ? payment.gcash_ref : null,
      received_by: user?.id || null,
    })
    if (error) { showToast('❌ Error recording payment'); return }
    await supabase.from('utang').update({ paid_amount: newPaid, status }).eq('id', selectedUtang.id)
    showToast('✅ Payment recorded!')
    setPayment({ amount: '', tendered: '', method: 'cash', gcash_ref: '' })
    setShowPayment(false)
    loadData()
  }

  const filtered = utangs.filter(u => {
    const matchSearch = u.customer_name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || u.status === filter
    return matchSearch && matchFilter
  })

  const totalOutstanding = utangs.filter(u => u.status !== 'paid').reduce((s, u) => s + u.balance, 0)

  const statusColor = (status: string) => {
    if (status === 'paid') return { bg: '#f0f9f0', color: '#7aaa7a' }
    if (status === 'partial') return { bg: '#fdf5f0', color: '#c4aa7a' }
    return { bg: '#fdf0f0', color: '#c47a7a' }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f5f0ee' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '8px 16px', borderRadius: '12px', backgroundColor: '#3d2c2c', color: 'white', fontSize: '13px', fontWeight: 500 }}>
          {toast}
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-col md:flex-row flex-1 gap-3 md:gap-[10px] px-3 pb-3 md:px-3 md:pb-3 overflow-y-auto md:overflow-hidden mt-3 md:mt-0">

        {/* LEFT — Customers */}
        <div className="w-full md:w-[260px] shrink-0 md:shrink" style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>Customers</p>
                <p style={{ fontSize: '10px', color: '#c47a7a', margin: '1px 0 0', fontWeight: 600 }}>
                  Outstanding: ₱{totalOutstanding.toFixed(2)}
                </p>
              </div>
              <button onClick={() => setShowAddCustomer(true)}
                style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#e8d5d0', color: '#b08a8a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                + Add
              </button>
            </div>
            <input type="text" placeholder="🔍 Search customer..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '12px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box', marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['unpaid', 'partial', 'paid', 'all'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ flex: 1, padding: '4px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '9px', fontWeight: 600, backgroundColor: filter === f ? '#b08a8a' : '#f5f0ee', color: filter === f ? 'white' : '#9e8585' }}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Customer list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {filtered.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '150px', color: '#9e8585' }}>
                <p style={{ fontSize: '28px', marginBottom: '6px' }}>😊</p>
                <p style={{ fontSize: '12px', margin: 0 }}>No customers yet</p>
              </div>
            ) : filtered.map(u => {
              const isSelected = selectedUtang?.id === u.id
              const sc = statusColor(u.status)
              return (
                <button key={u.id} onClick={() => { setSelectedUtang(u); setActiveTab('items') }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', marginBottom: '3px', textAlign: 'left', backgroundColor: isSelected ? '#f5e8e5' : 'transparent', borderLeft: isSelected ? '3px solid #b08a8a' : '3px solid transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: sc.color, flexShrink: 0 }}>
                    {u.customer_name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.customer_name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>
                        {u.status}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: u.balance > 0 ? '#c47a7a' : '#7aaa7a' }}>
                        ₱{u.balance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Customer detail */}
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedUtang ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9e8585' }}>
              <p style={{ fontSize: '40px', marginBottom: '8px' }}>👈</p>
              <p style={{ fontSize: '14px', margin: 0 }}>Select a customer</p>
              <p style={{ fontSize: '12px', marginTop: '4px', color: '#c4a09a' }}>to view their utang details</p>
            </div>
          ) : (
            <>
              {/* Customer header */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: 'white' }}>
                      {selectedUtang.customer_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: '16px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>{selectedUtang.customer_name}</p>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, ...statusColor(selectedUtang.status) }}>
                        {selectedUtang.status}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setShowAddItem(true)}
                      style={{ padding: '7px 14px', borderRadius: '10px', border: 'none', backgroundColor: '#f9e8e8', color: '#c47a7a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      + Add Utang
                    </button>
                    {selectedUtang.balance > 0 && (
                      <button onClick={() => setShowPayment(true)}
                        style={{ padding: '7px 14px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        💵 Pay
                      </button>
                    )}
                  </div>
                </div>

                {/* Balance summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { label: 'Total Utang', value: selectedUtang.total_amount, color: '#3d2c2c', bg: '#f9f6f5' },
                    { label: 'Total Paid', value: selectedUtang.paid_amount, color: '#7aaa7a', bg: '#f3faf3' },
                    { label: 'Balance', value: selectedUtang.balance, color: '#c47a7a', bg: '#fdf0f0' },
                  ].map(item => (
                    <div key={item.label} style={{ backgroundColor: item.bg, borderRadius: '10px', padding: '10px', textAlign: 'center', border: '1px solid #e8ddd9' }}>
                      <p style={{ fontSize: '10px', color: '#9e8585', margin: 0 }}>{item.label}</p>
                      <p style={{ fontSize: '15px', fontWeight: 700, color: item.color, margin: '2px 0 0' }}>₱{item.value.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e8ddd9', padding: '0 16px', flexShrink: 0 }}>
                {([
                  { key: 'items', label: '😬 Utang Items' },
                  { key: 'payments', label: '💵 Payments' },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    style={{ padding: '12px 16px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, backgroundColor: 'transparent', color: activeTab === tab.key ? '#b08a8a' : '#9e8585', borderBottom: activeTab === tab.key ? '2px solid #b08a8a' : '2px solid transparent', marginBottom: '-1px' }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'items' && (
                  utangItems.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '150px', color: '#9e8585' }}>
                      <p style={{ fontSize: '28px', marginBottom: '6px' }}>📋</p>
                      <p style={{ fontSize: '12px', margin: 0 }}>No utang items yet</p>
                    </div>
                  ) : utangItems.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < utangItems.length - 1 ? '1px solid #f9f6f5' : 'none' }}>
                      <div>
                        <p style={{ fontSize: '13px', color: '#3d2c2c', margin: 0, fontWeight: 500 }}>
                          {item.notes || 'Utang'}
                        </p>
                        <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>
                          {new Date(item.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          <span style={{ marginLeft: '6px' }}>
                            {new Date(item.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </p>
                      </div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#c47a7a', margin: 0 }}>₱{item.amount.toFixed(2)}</p>
                    </div>
                  ))
                )}

                {activeTab === 'payments' && (
                  utangPayments.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '150px', color: '#9e8585' }}>
                      <p style={{ fontSize: '28px', marginBottom: '6px' }}>💵</p>
                      <p style={{ fontSize: '12px', margin: 0 }}>No payments yet</p>
                    </div>
                  ) : utangPayments.map((p, i) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < utangPayments.length - 1 ? '1px solid #f9f6f5' : 'none' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px' }}>{p.payment_method === 'cash' ? '💵' : '📱'}</span>
                          <p style={{ fontSize: '13px', color: '#3d2c2c', margin: 0, fontWeight: 500 }}>
                            {p.payment_method === 'cash' ? 'Cash' : 'GCash'}
                            {p.gcash_reference && <span style={{ fontSize: '11px', color: '#9e8585', marginLeft: '6px' }}>#{p.gcash_reference}</span>}
                          </p>
                        </div>
                        <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>
                          {new Date(p.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#7aaa7a', margin: 0 }}>₱{p.amount.toFixed(2)}</p>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', maxWidth: '340px', borderRadius: '24px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight: 700, fontSize: '16px', color: '#3d2c2c', margin: '0 0 16px' }}>👤 New Customer</p>
            <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>CUSTOMER NAME *</label>
            <input type="text" placeholder="e.g. Maria Santos" value={customerName} onChange={e => setCustomerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCustomer()} autoFocus
              style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '14px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowAddCustomer(false); setCustomerName('') }}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#f5f0ee', color: '#9e8585', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddCustomer}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Add Customer</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Utang Item Modal */}
      {showAddItem && selectedUtang && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', maxWidth: '340px', borderRadius: '24px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight: 700, fontSize: '16px', color: '#3d2c2c', margin: '0 0 4px' }}>😬 Add Utang</p>
            <p style={{ fontSize: '13px', color: '#9e8585', margin: '0 0 16px' }}>{selectedUtang.customer_name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>AMOUNT (₱) *</label>
                <input type="number" placeholder="0.00" value={itemForm.amount} onChange={e => setItemForm(f => ({ ...f, amount: e.target.value }))} autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '16px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>NOTES (optional)</label>
                <input type="text" placeholder="e.g. Rice, sardines, noodles" value={itemForm.notes} onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => { setShowAddItem(false); setItemForm({ amount: '', notes: '' }) }}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#f5f0ee', color: '#9e8585', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddItem}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Save Utang</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && selectedUtang && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', maxWidth: '340px', borderRadius: '24px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight: 700, fontSize: '16px', color: '#3d2c2c', margin: '0 0 4px' }}>💵 Record Payment</p>
            <p style={{ fontSize: '13px', color: '#9e8585', margin: '0 0 12px' }}>{selectedUtang.customer_name}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#fdf0f0', borderRadius: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', color: '#9e8585' }}>Balance due</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#c47a7a' }}>₱{selectedUtang.balance.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>PAYMENT AMOUNT *</label>
                <input type="number" placeholder="0.00" value={payment.amount} onChange={e => setPayment(p => ({ ...p, amount: e.target.value }))} autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '16px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
                {payment.amount && parseFloat(payment.amount) > 0 && (
                  <p style={{ fontSize: '12px', color: '#7aaa7a', margin: '6px 0 0', fontWeight: 600 }}>
                    Remaining after: ₱{Math.max(0, selectedUtang.balance - parseFloat(payment.amount)).toFixed(2)}
                  </p>
                )}
              <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px', marginTop: '10px' }}>AMOUNT TENDERED</label>
                <input type="number" placeholder="Leave blank if exact" value={payment.tendered} onChange={e => setPayment(p => ({ ...p, tendered: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '16px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
                {payment.tendered && payment.amount && parseFloat(payment.tendered) >= parseFloat(payment.amount) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', padding: '8px 12px', backgroundColor: '#f0f9f0', borderRadius: '10px' }}>
                    <span style={{ fontSize: '13px', color: '#7aaa7a', fontWeight: 600 }}>Change</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#7aaa7a' }}>₱{(parseFloat(payment.tendered) - parseFloat(payment.amount)).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['cash', 'gcash'] as const).map(m => (
                  <button key={m} onClick={() => setPayment(p => ({ ...p, method: m }))}
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `2px solid ${payment.method === m ? '#b08a8a' : '#e8ddd9'}`, cursor: 'pointer', fontWeight: 600, fontSize: '13px', backgroundColor: payment.method === m ? '#b08a8a' : '#f5f0ee', color: payment.method === m ? 'white' : '#9e8585' }}>
                    {m === 'cash' ? '💵 Cash' : '📱 GCash'}
                  </button>
                ))}
              </div>
              {payment.method === 'gcash' && (
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>GCASH REF NO. (optional)</label>
                  <input type="text" placeholder="Reference number" value={payment.gcash_ref} onChange={e => setPayment(p => ({ ...p, gcash_ref: e.target.value }))}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => { setShowPayment(false); setPayment({ amount: '', tendered: '', method: 'cash', gcash_ref: '' }) }}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#f5f0ee', color: '#9e8585', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handlePayment}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>✅ Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
