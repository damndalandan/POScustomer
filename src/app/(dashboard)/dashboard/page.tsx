'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { User } from '@/types'

interface Metrics {
  todaySales: number
  todayTransactions: number
  todayCash: number
  todayGcash: number
  totalUtang: number
  lowStockCount: number
  weekSales: number
  monthSales: number
  topProduct: string
  totalExpenses: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [mounted, setMounted] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
    const storedUser = getStoredUser()
    if (!storedUser) { router.push('/login'); return }
    if (storedUser.role === 'cashier') { router.push('/pos'); return }
    setUser(storedUser)
    loadMetrics()
  }, [router])

  async function loadMetrics() {
    setLoading(true)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [
      { data: todayTxns },
      { data: weekTxns },
      { data: monthTxns },
      { data: utangs },
      { data: products },
      { data: todayExpenses },
    ] = await Promise.all([
      supabase.from('transactions').select('total, payment_method, items:transaction_items(product_name, quantity)').eq('status', 'completed').gte('created_at', todayStart),
      supabase.from('transactions').select('total').eq('status', 'completed').gte('created_at', weekStart),
      supabase.from('transactions').select('total').eq('status', 'completed').gte('created_at', monthStart),
      supabase.from('utang').select('balance').neq('status', 'paid'),
      supabase.from('products').select('stock, low_stock_threshold').eq('is_active', true),
      supabase.from('expenses').select('amount').gte('created_at', todayStart),
    ])

    const todaySales = todayTxns?.reduce((s, t) => s + t.total, 0) || 0
    const todayCash = todayTxns?.filter(t => t.payment_method === 'cash').reduce((s, t) => s + t.total, 0) || 0
    const todayGcash = todayTxns?.filter(t => t.payment_method === 'gcash').reduce((s, t) => s + t.total, 0) || 0

    const productSales: Record<string, number> = {}
    todayTxns?.forEach(t => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t.items?.forEach((item: any) => {
        productSales[item.product_name] = (productSales[item.product_name] || 0) + item.quantity
      })
    })
    const topProduct = Object.entries(productSales).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

    setMetrics({
      todaySales,
      todayTransactions: todayTxns?.length || 0,
      todayCash,
      todayGcash,
      totalUtang: utangs?.reduce((s, u) => s + u.balance, 0) || 0,
      lowStockCount: products?.filter(p => p.stock <= p.low_stock_threshold).length || 0,
      weekSales: weekTxns?.reduce((s, t) => s + t.total, 0) || 0,
      monthSales: monthTxns?.reduce((s, t) => s + t.total, 0) || 0,
      topProduct,
      totalExpenses: todayExpenses?.reduce((s, e) => s + e.amount, 0) || 0,
    })
    setLoading(false)
  }

  if (!mounted || !user) return null

  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div style={{ height: '100%', overflowY: 'auto', backgroundColor: '#f5f0ee' }}>

      {/* Welcome header */}
      <div style={{ padding: '16px 20px 12px', background: 'linear-gradient(135deg, #e8d5d0, #f5f0ee)' }}>
        <p style={{ fontSize: '10px', letterSpacing: '2px', color: '#9e8585', textTransform: 'uppercase', margin: 0 }}>Welcome back</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#3d2c2c', margin: '4px 0 2px' }}>
          {user.full_name || user.username} 👋
        </h2>
        <p style={{ fontSize: '12px', color: '#9e8585', margin: 0 }}>{today}</p>
      </div>

      {/* Quick POS button */}
      <div style={{ padding: '12px 16px 4px' }}>
        <button
          onClick={() => router.push('/pos')}
          style={{ width: '100%', padding: '14px', borderRadius: '14px', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          🛒 Open POS / Start Selling
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: '#9e8585' }}>
          <p style={{ fontSize: '13px' }}>Loading metrics...</p>
        </div>
      ) : metrics && (
        <div style={{ padding: '12px 16px 80px' }}>

          {/* TODAY */}
          <p style={{ fontSize: '10px', letterSpacing: '2px', color: '#9e8585', textTransform: 'uppercase', margin: '0 0 10px' }}>TODAY</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            {[
              { label: "Today's Sales", value: `₱${metrics.todaySales.toFixed(2)}`, sub: `${metrics.todayTransactions} transactions`, color: '#b08a8a', bg: '#fdf5f3', icon: '💰' },
              { label: 'Cash Sales', value: `₱${metrics.todayCash.toFixed(2)}`, sub: 'Cash payments', color: '#7aaa7a', bg: '#f3faf3', icon: '💵' },
              { label: 'GCash Sales', value: `₱${metrics.todayGcash.toFixed(2)}`, sub: 'GCash payments', color: '#7a7aaa', bg: '#f3f5fd', icon: '📱' },
              { label: "Today's Expenses", value: `₱${metrics.totalExpenses.toFixed(2)}`, sub: 'Total expenses', color: '#c47a7a', bg: '#fdf0f0', icon: '🧾' },
            ].map(card => (
              <div key={card.label} onClick={() => router.push('/reports')}
                style={{ backgroundColor: card.bg, borderRadius: '14px', padding: '14px', border: '1px solid #e8ddd9', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <p style={{ fontSize: '10px', color: '#9e8585', margin: 0, letterSpacing: '0.5px' }}>{card.label.toUpperCase()}</p>
                  <span style={{ fontSize: '18px' }}>{card.icon}</span>
                </div>
                <p style={{ fontSize: '20px', fontWeight: 700, color: card.color, margin: 0 }}>{card.value}</p>
                <p style={{ fontSize: '11px', color: '#9e8585', margin: '4px 0 0' }}>{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Net income */}
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px', border: '1px solid #e8ddd9', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '10px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>TODAY&apos;S NET INCOME</p>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#b08a8a', margin: '4px 0 0' }}>
                ₱{(metrics.todaySales - metrics.totalExpenses).toFixed(2)}
              </p>
              <p style={{ fontSize: '11px', color: '#9e8585', margin: '4px 0 0' }}>
                Sales ₱{metrics.todaySales.toFixed(2)} − Expenses ₱{metrics.totalExpenses.toFixed(2)}
              </p>
            </div>
            <span style={{ fontSize: '36px' }}>📈</span>
          </div>

          {/* PERIOD */}
          <p style={{ fontSize: '10px', letterSpacing: '2px', color: '#9e8585', textTransform: 'uppercase', margin: '0 0 10px' }}>PERIOD</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px', border: '1px solid #e8ddd9' }}>
              <p style={{ fontSize: '10px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>THIS WEEK</p>
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#b08a8a', margin: '4px 0 0' }}>₱{metrics.weekSales.toFixed(2)}</p>
              <p style={{ fontSize: '11px', color: '#9e8585', margin: '4px 0 0' }}>Last 7 days</p>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px', border: '1px solid #e8ddd9' }}>
              <p style={{ fontSize: '10px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>THIS MONTH</p>
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#b08a8a', margin: '4px 0 0' }}>₱{metrics.monthSales.toFixed(2)}</p>
              <p style={{ fontSize: '11px', color: '#9e8585', margin: '4px 0 0' }}>
                {new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* STORE STATUS */}
          <p style={{ fontSize: '10px', letterSpacing: '2px', color: '#9e8585', textTransform: 'uppercase', margin: '0 0 10px' }}>STORE STATUS</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            <div onClick={() => router.push('/utang')}
              style={{ backgroundColor: metrics.totalUtang > 0 ? '#fdf0f0' : '#f3faf3', borderRadius: '14px', padding: '14px', border: '1px solid #e8ddd9', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <p style={{ fontSize: '10px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>TOTAL UTANG</p>
                <span style={{ fontSize: '18px' }}>😬</span>
              </div>
              <p style={{ fontSize: '18px', fontWeight: 700, color: metrics.totalUtang > 0 ? '#c47a7a' : '#7aaa7a', margin: 0 }}>
                ₱{metrics.totalUtang.toFixed(2)}
              </p>
              <p style={{ fontSize: '11px', color: '#9e8585', margin: '4px 0 0' }}>Outstanding balance</p>
            </div>
            <div onClick={() => router.push('/inventory')}
              style={{ backgroundColor: metrics.lowStockCount > 0 ? '#fdf5f0' : '#f3faf3', borderRadius: '14px', padding: '14px', border: '1px solid #e8ddd9', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <p style={{ fontSize: '10px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>LOW STOCK</p>
                <span style={{ fontSize: '18px' }}>📦</span>
              </div>
              <p style={{ fontSize: '18px', fontWeight: 700, color: metrics.lowStockCount > 0 ? '#c4aa7a' : '#7aaa7a', margin: 0 }}>
                {metrics.lowStockCount} {metrics.lowStockCount === 1 ? 'item' : 'items'}
              </p>
              <p style={{ fontSize: '11px', color: '#9e8585', margin: '4px 0 0' }}>
                {metrics.lowStockCount === 0 ? 'All stocks are good!' : 'Need restocking'}
              </p>
            </div>
          </div>

          {/* Top product */}
          {metrics.topProduct !== '—' && (
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px', border: '1px solid #e8ddd9', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#f5e8e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                🏆
              </div>
              <div>
                <p style={{ fontSize: '10px', color: '#9e8585', margin: 0, letterSpacing: '1px' }}>TOP PRODUCT TODAY</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#3d2c2c', margin: '2px 0 0' }}>{metrics.topProduct}</p>
                <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>Best seller of the day</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
