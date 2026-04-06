'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { withAuth } from '@/lib/withAuth'

interface RefundRecord {
  id: string
  product_name: string
  quantity: number
  refund_amount: number
  reason: string | null
  restock: boolean
  created_at: string
  transaction?: { transaction_number: string }
}

interface Transaction {
  id: string
  transaction_number: string
  total: number
  created_at: string
  items: { id: string; product_id: string; product_name: string; quantity: number; selling_price: number; subtotal: number }[]
}

function RefundsPage() {
  const user = getStoredUser()
  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [refunds, setRefunds] = useState<RefundRecord[]>([])
  const [search, setSearch] = useState('')
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null)
  const [selectedItem, setSelectedItem] = useState<Transaction['items'][0] | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  const [toast, setToast] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const today = new Date()
    today.setDate(today.getDate() - 7)
    const [{ data: txns }, { data: refs }] = await Promise.all([
      supabase.from('transactions')
        .select('id, transaction_number, total, created_at, items:transaction_items(id, product_id, product_name, quantity, selling_price, subtotal)')
        .eq('status', 'completed')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('refunds')
        .select('*, transaction:transactions(transaction_number)')
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    if (txns) setTransactions(txns)
    if (refs) setRefunds(refs)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function handleRefund() {
    if (!selectedTxn || !selectedItem) { showToast('⚠️ Select a transaction and item!'); return }
    const qty = parseInt(quantity)
    if (!qty || qty <= 0 || qty > selectedItem.quantity) {
      showToast(`⚠️ Quantity must be between 1 and ${selectedItem.quantity}`)
      return
    }
    setProcessing(true)
    const refundAmount = (selectedItem.selling_price * qty)
    try {
      const { error } = await supabase.from('refunds').insert({
        transaction_id: selectedTxn.id,
        product_id: selectedItem.product_id,
        product_name: selectedItem.product_name,
        quantity: qty,
        refund_amount: refundAmount,
        reason: reason || null,
        restock,
        performed_by: user?.id || null,
      })
      if (error) throw error

      if (restock) {
        await supabase.rpc('increment_stock', { p_product_id: selectedItem.product_id, p_quantity: qty })
      }

      showToast(`✅ Refund of ₱${refundAmount.toFixed(2)} processed!`)
      setSelectedTxn(null)
      setSelectedItem(null)
      setQuantity('1')
      setReason('')
      setRestock(true)
      loadData()
    } catch {
      showToast('❌ Error processing refund')
    }
    setProcessing(false)
  }

  const filteredTxns = transactions.filter(t =>
    t.transaction_number.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f5f0ee' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '8px 16px', borderRadius: '12px', backgroundColor: '#3d2c2c', color: 'white', fontSize: '13px', fontWeight: 500 }}>
          {toast}
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1 gap-3 md:gap-[10px] px-3 pt-3 pb-3 md:px-3 md:pb-3 overflow-y-auto md:overflow-hidden">

        {/* LEFT — Transactions */}
        <div className="w-full md:w-[260px] shrink-0 md:shrink" style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#3d2c2c', margin: '0 0 8px' }}>Recent Transactions</p>
            <input type="text" placeholder="🔍 Search TXN number..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '12px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            <p style={{ fontSize: '10px', color: '#9e8585', margin: '0 4px 6px', letterSpacing: '1px' }}>LAST 7 DAYS</p>
            {filteredTxns.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9e8585', textAlign: 'center', padding: '20px' }}>No transactions found</p>
            ) : filteredTxns.map(txn => (
              <button key={txn.id} onClick={() => { setSelectedTxn(txn); setSelectedItem(null) }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', marginBottom: '3px', textAlign: 'left', backgroundColor: selectedTxn?.id === txn.id ? '#f5e8e5' : 'transparent', borderLeft: selectedTxn?.id === txn.id ? '3px solid #b08a8a' : '3px solid transparent' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>{txn.transaction_number}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                  <p style={{ fontSize: '11px', color: '#9e8585', margin: 0 }}>
                    {new Date(txn.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </p>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#b08a8a', margin: 0 }}>₱{txn.total.toFixed(2)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — Refund form + History tabs */}
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e8ddd9', padding: '0 16px', flexShrink: 0 }}>
            {(['new', 'history'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '14px 16px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, backgroundColor: 'transparent', color: tab === t ? '#b08a8a' : '#9e8585', borderBottom: tab === t ? '2px solid #b08a8a' : '2px solid transparent', marginBottom: '-1px' }}>
                {t === 'new' ? '↩️ New Refund' : '📋 Refund History'}
              </button>
            ))}
          </div>

          {/* New Refund Tab */}
          {tab === 'new' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {!selectedTxn ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9e8585' }}>
                  <p style={{ fontSize: '36px', marginBottom: '8px' }}>←</p>
                  <p style={{ fontSize: '13px', margin: 0 }}>Select a transaction to refund</p>
                </div>
              ) : (
                <div>
                  <div style={{ padding: '12px', backgroundColor: '#f5e8e5', borderRadius: '12px', marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>{selectedTxn.transaction_number}</p>
                    <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>
                      {new Date(selectedTxn.created_at).toLocaleString('en-PH')} · ₱{selectedTxn.total.toFixed(2)}
                    </p>
                  </div>

                  {/* Select item */}
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#9e8585', letterSpacing: '1px', margin: '0 0 8px' }}>SELECT ITEM TO REFUND</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                    {selectedTxn.items.map(item => (
                      <button key={item.id} onClick={() => setSelectedItem(item)}
                        style={{ padding: '10px 14px', borderRadius: '10px', border: `2px solid ${selectedItem?.id === item.id ? '#b08a8a' : '#e8ddd9'}`, cursor: 'pointer', textAlign: 'left', backgroundColor: selectedItem?.id === item.id ? '#f5e8e5' : '#f9f6f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>{item.product_name}</p>
                          <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>
                            {item.quantity} pcs × ₱{item.selling_price.toFixed(2)}
                          </p>
                        </div>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#b08a8a', margin: 0 }}>₱{item.subtotal.toFixed(2)}</p>
                      </button>
                    ))}
                  </div>

                  {selectedItem && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>QUANTITY TO REFUND (max: {selectedItem.quantity})</label>
                        <input type="number" min="1" max={selectedItem.quantity} value={quantity} onChange={e => setQuantity(e.target.value)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '14px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
                        {quantity && (
                          <p style={{ fontSize: '12px', color: '#b08a8a', margin: '6px 0 0', fontWeight: 600 }}>
                            Refund amount: ₱{(selectedItem.selling_price * parseInt(quantity || '0')).toFixed(2)}
                          </p>
                        )}
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>REASON (optional)</label>
                        <input type="text" placeholder="e.g. Defective product, wrong item" value={reason} onChange={e => setReason(e.target.value)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: '#f9f6f5', borderRadius: '10px' }}>
                        <input type="checkbox" id="restock" checked={restock} onChange={e => setRestock(e.target.checked)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                        <label htmlFor="restock" style={{ fontSize: '13px', color: '#3d2c2c', cursor: 'pointer', fontWeight: 500 }}>
                          Return item to stock
                        </label>
                      </div>
                      <button onClick={handleRefund} disabled={processing}
                        style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: processing ? '#d4bfbb' : 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '14px', cursor: processing ? 'not-allowed' : 'pointer' }}>
                        {processing ? 'Processing...' : '↩️ Process Refund'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Refund History Tab */}
          {tab === 'history' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 80px 1fr', padding: '10px 16px', backgroundColor: '#f9f6f5', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
                {['PRODUCT', 'TRANSACTION', 'QTY', 'AMOUNT', 'DATE & REASON'].map(h => (
                  <p key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>{h}</p>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {refunds.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9e8585' }}>
                    <p style={{ fontSize: '36px', marginBottom: '8px' }}>↩️</p>
                    <p style={{ fontSize: '13px', margin: 0 }}>No refunds yet</p>
                  </div>
                ) : refunds.map((ref, i) => (
                  <div key={ref.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 80px 1fr', padding: '12px 16px', borderBottom: i < refunds.length - 1 ? '1px solid #f9f6f5' : 'none', alignItems: 'center' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>{ref.product_name}</p>
                    <p style={{ fontSize: '11px', color: '#9e8585', margin: 0 }}>
                      {(ref.transaction as { transaction_number: string } | undefined)?.transaction_number || '—'}
                    </p>
                    <p style={{ fontSize: '12px', color: '#3d2c2c', margin: 0 }}>{ref.quantity} pcs</p>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#c47a7a', margin: 0 }}>₱{ref.refund_amount.toFixed(2)}</p>
                    <div>
                      <p style={{ fontSize: '11px', color: '#3d2c2c', margin: 0 }}>
                        {new Date(ref.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        <span style={{ color: '#9e8585', marginLeft: '6px' }}>
                          {new Date(ref.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                      {ref.reason && <p style={{ fontSize: '11px', color: '#c4a09a', margin: '2px 0 0' }}>{ref.reason}</p>}
                      {ref.restock && <p style={{ fontSize: '10px', color: '#7aaa7a', margin: '2px 0 0' }}>✅ Restocked</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default withAuth(RefundsPage, ['admin'])
