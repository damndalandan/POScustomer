'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { withAuth } from '@/lib/withAuth'

interface TransactionItem {
  product_name: string
  quantity: number
  buying_price: number
  selling_price: number
  subtotal: number
}

interface Transaction {
  id: string
  transaction_number: string
  payment_method: string
  total: number
  amount_tendered: number
  change_amount: number
  status: string
  created_at: string
  items?: TransactionItem[]
}

interface DaySummary {
  date: string
  transactions: Transaction[]
  total: number
  cash: number
  gcash: number
  count: number
}

function ReportsPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedDayData, setSelectedDayData] = useState<DaySummary | null>(null)
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => { loadMonthData() }, [selectedMonth, selectedYear])

  useEffect(() => {
    const day = daySummaries.find(d => d.date === selectedDate)
    setSelectedDayData(day || null)
    setExpandedTxn(null)
  }, [selectedDate, daySummaries])

  async function loadMonthData() {
    setLoading(true)
    const from = new Date(selectedYear, selectedMonth, 1).toISOString()
    const to = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).toISOString()

    const { data: txns } = await supabase
      .from('transactions')
      .select('*, items:transaction_items(product_name, quantity, buying_price, selling_price, subtotal)')
      .eq('status', 'completed')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })

    if (txns) {
      const grouped: Record<string, Transaction[]> = {}
      txns.forEach(t => {
        const date = t.created_at.split('T')[0]
        if (!grouped[date]) grouped[date] = []
        grouped[date].push(t)
      })

      const summaries: DaySummary[] = Object.entries(grouped).map(([date, transactions]) => ({
        date,
        transactions,
        total: transactions.reduce((s, t) => s + t.total, 0),
        cash: transactions.filter(t => t.payment_method === 'cash').reduce((s, t) => s + t.total, 0),
        gcash: transactions.filter(t => t.payment_method === 'gcash').reduce((s, t) => s + t.total, 0),
        count: transactions.length,
      })).sort((a, b) => b.date.localeCompare(a.date))

      setDaySummaries(summaries)

      const today = new Date().toISOString().split('T')[0]
      const todayData = summaries.find(d => d.date === today)
      if (todayData) setSelectedDate(today)
      else if (summaries.length > 0) setSelectedDate(summaries[0].date)
    }
    setLoading(false)
  }

  async function downloadBackup() {
    const tables = ['products', 'transactions', 'transaction_items', 'utang', 'utang_payments', 'expenses', 'inventory_logs', 'cash_sessions']
    const backup: Record<string, unknown[]> = {}
    for (const table of tables) {
      const { data } = await supabase.from(table).select('*')
      backup[table] = data || []
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chiara-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const monthTotal = daySummaries.reduce((s, d) => s + d.total, 0)
  const monthTxns = daySummaries.reduce((s, d) => s + d.count, 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f5f0ee' }}>

      {/* Two containers side by side */}
      <div className="flex flex-col md:flex-row flex-1 gap-2.5 md:gap-[10px] md:px-3 md:pb-3 overflow-y-auto md:overflow-hidden">

        {/* LEFT Container — History */}
        <div className="w-full md:w-[280px] shrink-0 md:shrink" style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>Audit History</p>
              <button onClick={loadMonthData}
                style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', backgroundColor: '#e8d5d0', color: '#b08a8a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                ↻ Refresh
              </button>
            </div>

            {/* Month/Year selector */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
                style={{ flex: 1, padding: '6px 8px', borderRadius: '8px', border: '1px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '12px', color: '#3d2c2c', outline: 'none' }}>
                {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
                style={{ width: '72px', padding: '6px 8px', borderRadius: '8px', border: '1px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '12px', color: '#3d2c2c', outline: 'none' }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Month summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div style={{ backgroundColor: '#f5f0ee', borderRadius: '8px', padding: '8px' }}>
                <p style={{ fontSize: '9px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>TOTAL SALES</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#b08a8a', margin: '2px 0 0' }}>₱{monthTotal.toFixed(2)}</p>
              </div>
              <div style={{ backgroundColor: '#f5f0ee', borderRadius: '8px', padding: '8px' }}>
                <p style={{ fontSize: '9px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>TRANSACTIONS</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#8aaac4', margin: '2px 0 0' }}>{monthTxns}</p>
              </div>
            </div>
          </div>

          {/* Day list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: '#9e8585', fontSize: '13px' }}>
                Loading...
              </div>
            ) : daySummaries.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100px', color: '#9e8585' }}>
                <p style={{ fontSize: '13px', margin: 0 }}>No transactions this month</p>
              </div>
            ) : daySummaries.map(day => {
              const date = new Date(day.date + 'T00:00:00')
              const isSelected = day.date === selectedDate
              const isToday = day.date === new Date().toISOString().split('T')[0]
              return (
                <button key={day.date} onClick={() => setSelectedDate(day.date)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '10px', border: 'none',
                    cursor: 'pointer', textAlign: 'left', marginBottom: '2px',
                    backgroundColor: isSelected ? '#f5e8e5' : 'transparent',
                    borderLeft: isSelected ? '3px solid #b08a8a' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>
                        {date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                      {isToday && (
                        <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '10px', backgroundColor: '#b08a8a', color: 'white', fontWeight: 700 }}>TODAY</span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>
                      {day.count} transaction{day.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#b08a8a', margin: 0 }}>
                    ₱{day.total.toFixed(2)}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Backup button */}
          <div style={{ padding: '10px', borderTop: '1px solid #e8ddd9', flexShrink: 0 }}>
            <button onClick={downloadBackup}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1.5px dashed #c4a09a', backgroundColor: '#e8d5d0', color: '#b08a8a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              ⬇️ Download Backup
            </button>
          </div>
        </div>

        {/* RIGHT Container — Day Detail */}
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!selectedDayData ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9e8585' }}>
              <p style={{ fontSize: '40px', marginBottom: '8px' }}>📊</p>
              <p style={{ fontSize: '14px', margin: 0 }}>No transactions on this day</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          ) : (
            <>
              {/* Day header */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', backgroundColor: '#f0f9f0', color: '#7aaa7a', fontWeight: 600, flexShrink: 0 }}>
                    {selectedDayData.count} transactions
                  </span>
                </div>

                {/* Summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                  <div style={{ backgroundColor: '#fdf5f3', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e8ddd9' }}>
                    <p style={{ fontSize: '9px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>TOTAL COLLECTED</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, color: '#b08a8a', margin: '4px 0 0' }}>₱{selectedDayData.total.toFixed(2)}</p>
                  </div>
                  <div style={{ backgroundColor: '#f3faf3', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e8ddd9' }}>
                    <p style={{ fontSize: '9px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>CASH</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, color: '#7aaa7a', margin: '4px 0 0' }}>₱{selectedDayData.cash.toFixed(2)}</p>
                  </div>
                  <div style={{ backgroundColor: '#f3f5fd', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e8ddd9' }}>
                    <p style={{ fontSize: '9px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>GCASH</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, color: '#7a7aaa', margin: '4px 0 0' }}>₱{selectedDayData.gcash.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 110px 100px 80px', padding: '8px 16px', backgroundColor: '#f9f6f5', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
                {['DOC NO.', 'ITEMS', 'METHOD', 'TOTAL', 'STATUS'].map(h => (
                  <p key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>{h}</p>
                ))}
              </div>

              {/* Transaction rows */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {selectedDayData.transactions.map((txn, i) => (
                  <div key={txn.id}>
                    <button
                      onClick={() => setExpandedTxn(expandedTxn === txn.id ? null : txn.id)}
                      style={{
                        width: '100%', display: 'grid',
                        gridTemplateColumns: '160px 1fr 110px 100px 80px',
                        padding: '12px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                        backgroundColor: expandedTxn === txn.id ? '#fdf5f3' : i % 2 === 0 ? 'white' : '#fdfcfb',
                        borderBottom: '1px solid #f5f0ee',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>
                          {txn.transaction_number}
                        </p>
                        <p style={{ fontSize: '10px', color: '#9e8585', margin: '2px 0 0' }}>
                          {new Date(txn.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <p style={{ fontSize: '12px', color: '#9e8585', margin: 0 }}>
                        {txn.items?.length || 0} item{(txn.items?.length || 0) !== 1 ? 's' : ''}
                        <span style={{ fontSize: '11px', color: '#c4a09a', marginLeft: '4px' }}>
                          {expandedTxn === txn.id ? '▲' : '▼'}
                        </span>
                      </p>
                      <span style={{
                        fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 600, display: 'inline-block',
                        backgroundColor: txn.payment_method === 'cash' ? '#f0f9f0' : '#f3f5fd',
                        color: txn.payment_method === 'cash' ? '#7aaa7a' : '#7a7aaa',
                      }}>
                        {txn.payment_method === 'cash' ? '💵 Cash' : '📱 GCash'}
                      </span>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#b08a8a', margin: 0 }}>
                        ₱{txn.total.toFixed(2)}
                      </p>
                      <span style={{
                        fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 600, display: 'inline-block',
                        backgroundColor: '#f0f9f0', color: '#7aaa7a',
                      }}>
                        Paid
                      </span>
                    </button>

                    {/* Expanded items */}
                    {expandedTxn === txn.id && (
                      <div style={{ backgroundColor: '#fdf8f7', borderBottom: '1px solid #e8ddd9', padding: '0 16px 12px 32px' }}>
                        {/* Items table header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 80px 80px', padding: '8px 0 4px', borderBottom: '1px solid #e8ddd9', marginBottom: '4px' }}>
                          {['PRODUCT', 'QTY', 'BUY', 'SELL', 'SUBTOTAL'].map(h => (
                            <p key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>{h}</p>
                          ))}
                        </div>

                        {/* Item rows */}
                        {txn.items?.map((item, idx) => (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 80px 80px', padding: '5px 0', borderBottom: idx < (txn.items?.length ?? 0) - 1 ? '1px solid #f5f0ee' : 'none', alignItems: 'center' }}>
                            <p style={{ fontSize: '12px', color: '#3d2c2c', margin: 0, fontWeight: 500 }}>{item.product_name}</p>
                            <p style={{ fontSize: '12px', color: '#9e8585', margin: 0 }}>×{item.quantity}</p>
                            <p style={{ fontSize: '11px', color: '#9e8585', margin: 0 }}>₱{item.buying_price.toFixed(2)}</p>
                            <p style={{ fontSize: '11px', color: '#9e8585', margin: 0 }}>₱{item.selling_price.toFixed(2)}</p>
                            <p style={{ fontSize: '12px', fontWeight: 600, color: '#b08a8a', margin: 0 }}>₱{item.subtotal.toFixed(2)}</p>
                          </div>
                        ))}

                        {/* Transaction totals */}
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e8ddd9', display: 'flex', justifyContent: 'flex-end', gap: '24px' }}>
                          {txn.payment_method === 'cash' && (
                            <>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '10px', color: '#9e8585', margin: 0 }}>TENDERED</p>
                                <p style={{ fontSize: '12px', fontWeight: 600, color: '#3d2c2c', margin: '2px 0 0' }}>₱{txn.amount_tendered?.toFixed(2) || '0.00'}</p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '10px', color: '#9e8585', margin: 0 }}>CHANGE</p>
                                <p style={{ fontSize: '12px', fontWeight: 600, color: '#7aaa7a', margin: '2px 0 0' }}>₱{txn.change_amount?.toFixed(2) || '0.00'}</p>
                              </div>
                            </>
                          )}
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '10px', color: '#9e8585', margin: 0 }}>TOTAL</p>
                            <p style={{ fontSize: '14px', fontWeight: 700, color: '#b08a8a', margin: '2px 0 0' }}>₱{txn.total.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    )}
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

export default withAuth(ReportsPage, ['admin'])
