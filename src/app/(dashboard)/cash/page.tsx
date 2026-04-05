'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CashSession } from '@/types'
import { getStoredUser } from '@/lib/auth'

export default function CashPage() {
  const [session, setSession] = useState<CashSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [startingCash, setStartingCash] = useState('')
  const [endingCash, setEndingCash] = useState('')
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState('')
  const user = getStoredUser()

  useEffect(() => { loadSession() }, [])

  async function loadSession() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    setSession(data || null)
    setLoading(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function handleOpenSession() {
    if (!startingCash) { showToast('⚠️ Enter starting cash!'); return }
    const { error } = await supabase.from('cash_sessions').insert({
      date: new Date().toISOString().split('T')[0],
      starting_cash: parseFloat(startingCash),
      status: 'open',
      opened_by: user?.id || null,
    })
    if (error) { showToast('❌ Error opening session'); return }
    showToast('✅ Cash session opened!')
    setShowOpen(false)
    setStartingCash('')
    loadSession()
  }

  async function handleCloseSession() {
    if (!session) return
    if (!endingCash) { showToast('⚠️ Enter ending cash count!'); return }
    const { error } = await supabase.from('cash_sessions').update({
      ending_cash: parseFloat(endingCash),
      notes: notes || null,
      status: 'closed',
      closed_by: user?.id || null,
    }).eq('id', session.id)
    if (error) { showToast('❌ Error closing session'); return }
    showToast('✅ Cash session closed!')
    setShowClose(false)
    setEndingCash('')
    setNotes('')
    loadSession()
  }

  const expectedCash = session
    ? session.starting_cash + session.total_cash_sales - session.total_expenses
    : 0

  const variance = session?.ending_cash != null
    ? session.ending_cash - expectedCash
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: '#9e8585' }}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-white text-sm shadow-lg" style={{ backgroundColor: '#3d2c2c' }}>
          {toast}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Today's date */}
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #c4a09a, #b08a8a)' }}>
          <p className="text-white/80 text-xs">Today</p>
          <p className="text-white font-bold text-lg">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <div className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}>
            {session ? (session.status === 'open' ? '🟢 Session Open' : '🔴 Session Closed') : '⭕ No Session'}
          </div>
        </div>

        {/* No session */}
        {!session && (
          <div className="bg-white rounded-2xl p-6 text-center" style={{ border: '1px solid #e8ddd9' }}>
            <p className="text-4xl mb-3">💵</p>
            <p className="font-semibold" style={{ color: '#3d2c2c' }}>No cash session today</p>
            <p className="text-sm mt-1 mb-4" style={{ color: '#9e8585' }}>Open a session to start tracking cash</p>
            <button
              onClick={() => setShowOpen(true)}
              className="px-6 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #c4a09a, #b08a8a)' }}
            >
              Open Cash Session
            </button>
          </div>
        )}

        {/* Session details */}
        {session && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Starting Cash', value: session.starting_cash, color: '#3d2c2c' },
                { label: 'Cash Sales', value: session.total_cash_sales, color: '#8faa8f' },
                { label: 'GCash Sales', value: session.total_gcash_sales, color: '#8aaac4' },
                { label: 'Expenses', value: session.total_expenses, color: '#c47a7a' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #e8ddd9' }}>
                  <p className="text-xs" style={{ color: '#9e8585' }}>{item.label}</p>
                  <p className="text-lg font-bold mt-1" style={{ color: item.color }}>
                    ₱{item.value.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* Expected cash */}
            <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #e8ddd9' }}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs" style={{ color: '#9e8585' }}>Expected Cash in Drawer</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: '#3d2c2c' }}>
                    ₱{expectedCash.toFixed(2)}
                  </p>
                </div>
                <div className="text-4xl">💰</div>
              </div>
              <p className="text-xs mt-2" style={{ color: '#9e8585' }}>
                Starting ₱{session.starting_cash.toFixed(2)} + Cash Sales ₱{session.total_cash_sales.toFixed(2)} - Expenses ₱{session.total_expenses.toFixed(2)}
              </p>
            </div>

            {/* Variance (if closed) */}
            {session.ending_cash != null && variance !== null && (
              <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #e8ddd9' }}>
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs" style={{ color: '#9e8585' }}>Actual Count</p>
                    <p className="text-lg font-bold" style={{ color: '#3d2c2c' }}>₱{session.ending_cash.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: '#9e8585' }}>Variance</p>
                    <p className="text-lg font-bold" style={{ color: variance >= 0 ? '#8faa8f' : '#c47a7a' }}>
                      {variance >= 0 ? '+' : ''}₱{variance.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Total sales */}
            <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #e8ddd9' }}>
              <p className="text-xs" style={{ color: '#9e8585' }}>Total Sales Today</p>
              <p className="text-2xl font-bold" style={{ color: '#b08a8a' }}>
                ₱{(session.total_cash_sales + session.total_gcash_sales).toFixed(2)}
              </p>
            </div>

            {/* Close session button */}
            {session.status === 'open' && (
              <button
                onClick={() => setShowClose(true)}
                className="w-full py-4 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #c4a09a, #b08a8a)' }}
              >
                🔒 Close Cash Session
              </button>
            )}
          </>
        )}
      </div>

      {/* Open Session Modal */}
      {showOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-3xl p-5 shadow-xl" style={{ backgroundColor: '#fff' }}>
            <h3 className="font-bold text-base mb-4" style={{ color: '#3d2c2c' }}>💵 Open Cash Session</h3>
            <div>
              <label className="text-xs font-medium tracking-wide block mb-1" style={{ color: '#9e8585' }}>STARTING CASH / CHANGE FUND (₱)</label>
              <input
                type="number"
                placeholder="e.g. 500.00"
                value={startingCash}
                onChange={e => setStartingCash(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ backgroundColor: '#f5f0ee', border: '1.5px solid #e8ddd9', color: '#3d2c2c' }}
              />
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowOpen(false)} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ backgroundColor: '#f5f0ee', color: '#9e8585' }}>Cancel</button>
              <button onClick={handleOpenSession} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #c4a09a, #b08a8a)' }}>Open Session</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Session Modal */}
      {showClose && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-3xl p-5 shadow-xl" style={{ backgroundColor: '#fff' }}>
            <h3 className="font-bold text-base mb-1" style={{ color: '#3d2c2c' }}>🔒 Close Cash Session</h3>
            <p className="text-sm mb-4" style={{ color: '#9e8585' }}>Count your cash drawer and enter the total</p>
            <div className="rounded-xl p-3 mb-4 flex justify-between" style={{ backgroundColor: '#f5f0ee' }}>
              <span className="text-sm" style={{ color: '#9e8585' }}>Expected</span>
              <span className="text-sm font-bold" style={{ color: '#3d2c2c' }}>₱{expectedCash.toFixed(2)}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium tracking-wide block mb-1" style={{ color: '#9e8585' }}>ACTUAL CASH COUNT (₱)</label>
                <input
                  type="number"
                  placeholder="Count your drawer..."
                  value={endingCash}
                  onChange={e => setEndingCash(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: '#f5f0ee', border: '1.5px solid #e8ddd9', color: '#3d2c2c' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium tracking-wide block mb-1" style={{ color: '#9e8585' }}>NOTES (optional)</label>
                <input
                  type="text"
                  placeholder="Any notes..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: '#f5f0ee', border: '1.5px solid #e8ddd9', color: '#3d2c2c' }}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowClose(false)} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ backgroundColor: '#f5f0ee', color: '#9e8585' }}>Cancel</button>
              <button onClick={handleCloseSession} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #c4a09a, #b08a8a)' }}>Close Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
