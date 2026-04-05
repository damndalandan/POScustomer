'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCartStore } from '@/store/cartStore'
import { getStoredUser } from '@/lib/auth'
import { addToQueue } from '@/lib/db'
import { syncOfflineQueue } from '@/lib/sync'
import { Product } from '@/types'
import BarcodeScanner from '@/components/BarcodeScanner'

const categoryColors: Record<string, string> = {
  'Beverages': '#8aaac4', 'Canned Goods': '#c4a09a', 'Condiments': '#c4aa7a',
  'Dairy': '#b0c4b0', 'Frozen Goods': '#a0c4c4', 'Instant Noodles': '#c4b48a',
  'Personal Care': '#c48ab4', 'Rice & Grains': '#8faa8f', 'Snacks': '#c48a8a', 'Others': '#aaaaaa',
}
function getColor(name: string) { return categoryColors[name] || '#b08a8a' }
function getInitials(name: string) { return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() }

interface Receipt {
  transaction_number: string
  customer_name?: string
  items: { product_name: string; quantity: number; selling_price: number; subtotal: number }[]
  subtotal: number
  payment_method: string
  amount_tendered: number
  change_amount: number
  gcash_reference?: string
  served_by: string
  date: string
}

export default function POSPage() {
  const router = useRouter()
  const user = getStoredUser()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [scanning, setScanning] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [posPaymentMethod, setPosPaymentMethod] = useState<'cash' | 'gcash' | 'utang'>('cash')
  const [storeSettings, setStoreSettings] = useState({ store_name: 'Chiara Store', receipt_footer: 'Thank you for shopping!' })

  const { items, payment_method, amount_tendered, gcash_reference, addItem, removeItem, updateQuantity, setPaymentMethod, setAmountTendered, setGcashReference, clearCart, getSubtotal, getChange } = useCartStore()
  const subtotal = getSubtotal()
  const change = getChange()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: prods }, { data: cats }, { data: settings }] = await Promise.all([
      supabase.from('products').select('*, category:categories(name)').eq('is_active', true).order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('store_settings').select('store_name, receipt_footer').single(),
    ])
    if (prods) setProducts(prods)
    if (cats) setCategories(cats)
    if (settings) setStoreSettings({ store_name: settings.store_name || 'Chiara Store', receipt_footer: settings.receipt_footer || 'Thank you!' })
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const addingRef = useRef<string | null>(null)

  function addToCart(product: Product) {
    if (product.stock <= 0) { showToast('⚠️ Out of stock!'); return }
    if (addingRef.current === product.id) return
    addingRef.current = product.id
    setTimeout(() => { addingRef.current = null }, 500)
    addItem({ product_id: product.id, product_name: product.name, barcode: product.barcode, quantity: 1, buying_price: product.buying_price, selling_price: product.selling_price, subtotal: product.selling_price })
    showToast(`✅ ${product.name} added!`)
  }

  function handleBarcodeScan(decoded: string) {
    setScanning(false)
    const product = products.find(p => p.barcode === decoded)
    if (product) addToCart(product)
    else showToast('❌ Product not found. Register it in Products.')
  }

  function handleVoidCart() {
    if (items.length === 0) return
    setShowVoidConfirm(true)
  }

  async function handleCheckout() {
    if (items.length === 0) return
    if (payment_method === 'cash' && amount_tendered < subtotal) { showToast('⚠️ Amount tendered is less than total!'); return }
    if (posPaymentMethod === 'utang' && !customerName.trim()) { showToast('⚠️ Customer name required for utang!'); return }
    setProcessing(true)
    const txnNumber = `TXN-${Date.now()}`
    const transaction = {
      transaction_number: txnNumber, payment_method: posPaymentMethod === 'utang' ? 'cash' : payment_method, subtotal, total: subtotal,
      amount_tendered: payment_method === 'cash' ? amount_tendered : subtotal,
      change_amount: payment_method === 'cash' ? change : 0,
      status: posPaymentMethod === 'utang' ? 'held' : 'completed',
      notes: customerName ? `Customer: ${customerName}` : null,
      served_by: user?.id || null,
    }
    const txnItems = items.map(item => ({
      product_name: item.product_name, product_id: item.product_id,
      quantity: item.quantity, buying_price: item.buying_price,
      selling_price: item.selling_price, subtotal: item.subtotal,
    }))
    try {
      if (navigator.onLine) {
        await syncOfflineQueue()
        const { data: txn, error } = await supabase.from('transactions').insert(transaction).select().single()
        if (error) throw error
        await supabase.from('transaction_items').insert(txnItems.map(i => ({ ...i, transaction_id: txn.id })))
        if (posPaymentMethod === 'gcash' && gcash_reference) {
          await supabase.from('gcash_references').insert({ transaction_id: txn.id, reference_number: gcash_reference, amount: subtotal })
        }
        for (const item of items) {
          await supabase.rpc('decrement_stock', { p_product_id: item.product_id, p_quantity: item.quantity })
        }
        // Handle utang
        if (posPaymentMethod === 'utang' && customerName.trim()) {
          const { data: existingUtang } = await supabase
            .from('utang').select('*').ilike('customer_name', customerName.trim()).single()
          if (existingUtang) {
            const newTotal = existingUtang.total_amount + subtotal
            const newStatus = existingUtang.paid_amount >= newTotal ? 'paid' : existingUtang.paid_amount > 0 ? 'partial' : 'unpaid'
            await supabase.from('utang').update({ total_amount: newTotal, status: newStatus }).eq('id', existingUtang.id)
            await supabase.from('utang_items').insert({ utang_id: existingUtang.id, amount: subtotal, notes: `POS - ${txnNumber}` })
          } else {
            const { data: newUtang } = await supabase.from('utang').insert({
              customer_name: customerName.trim(), total_amount: subtotal,
              paid_amount: 0, balance: subtotal, status: 'unpaid', created_by: user?.id || null,
            }).select().single()
            if (newUtang) {
              await supabase.from('utang_items').insert({ utang_id: newUtang.id, amount: subtotal, notes: `POS - ${txnNumber}` })
            }
          }
        }
      } else {
        await addToQueue('transaction', { transaction, items: txnItems, gcash_reference: payment_method === 'gcash' ? gcash_reference : undefined })
      }

      // Build receipt
      const receiptData: Receipt = {
        transaction_number: txnNumber,
        items: items.map(i => ({ product_name: i.product_name, quantity: i.quantity, selling_price: i.selling_price, subtotal: i.subtotal })),
        subtotal,
        payment_method,
        amount_tendered: amount_tendered > 0 ? amount_tendered : subtotal,
        change_amount: posPaymentMethod === 'cash' ? change : 0,
        gcash_reference: posPaymentMethod === 'gcash' ? gcash_reference : undefined,
        served_by: user?.full_name || user?.username || 'Cashier',
        customer_name: customerName || undefined,
        date: new Date().toLocaleString('en-PH'),
      }
      setReceipt(receiptData)
      clearCart()
      setShowCheckout(false)
      setShowReceipt(true)
      loadData()
    } catch {
      await addToQueue('transaction', { transaction, items: txnItems, gcash_reference: payment_method === 'gcash' ? gcash_reference : undefined })
      showToast('⚠️ Saved offline.')
      clearCart(); setShowCheckout(false)
    }
    setProcessing(false)
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode && p.barcode.includes(search))
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory
    return matchSearch && matchCat
  })

  const catName = (p: Product) => (p as Product & { category?: { name: string } }).category?.name || ''

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f5f0ee' }}>
      {toast && (<div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 200, padding: '8px 16px', borderRadius: '12px', backgroundColor: '#3d2c2c', color: 'white', fontSize: '13px', fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>{toast}</div>)}

      {/* Search + controls */}
      <div style={{ padding: '10px 12px', backgroundColor: '#f5f0ee', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        <input type="text" placeholder="🔍 Search product or barcode..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#fff', fontSize: '13px', color: '#3d2c2c', outline: 'none' }} />
        <button onClick={() => setScanning(true)}
          style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          📷 Scan
        </button>
        <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e8ddd9', backgroundColor: '#fff' }}>
          <button onClick={() => setViewMode('grid')} style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: '16px', backgroundColor: viewMode === 'grid' ? '#b08a8a' : 'transparent', color: viewMode === 'grid' ? 'white' : '#9e8585' }}>⊞</button>
          <button onClick={() => setViewMode('list')} style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: '16px', backgroundColor: viewMode === 'list' ? '#b08a8a' : 'transparent', color: viewMode === 'list' ? 'white' : '#9e8585' }}>≡</button>
        </div>
      </div>

      {scanning && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setScanning(false)} />}

      {/* Three containers */}
      <div className="flex flex-col md:flex-row flex-1 gap-2.5 md:gap-[10px] md:px-3 md:pb-3 overflow-y-auto md:overflow-hidden">

        {/* LEFT — Categories */}
        <div className="hidden md:flex w-full md:w-[110px] shrink-0 md:shrink" style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>CATEGORIES</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
            <button onClick={() => setSelectedCategory('all')}
              style={{ width: '100%', padding: '8px', borderRadius: '10px', border: 'none', cursor: 'pointer', marginBottom: '3px', backgroundColor: selectedCategory === 'all' ? '#b08a8a' : '#f5f0ee', color: selectedCategory === 'all' ? 'white' : '#9e8585', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: selectedCategory === 'all' ? 'rgba(255,255,255,0.25)' : '#e8ddd9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: selectedCategory === 'all' ? 'white' : '#9e8585' }}>All</div>
              <span style={{ fontSize: '10px', fontWeight: 600 }}>All ({products.length})</span>
            </button>
            {categories.map(cat => {
              const isActive = selectedCategory === cat.id
              const color = getColor(cat.name)
              const count = products.filter(p => p.category_id === cat.id).length
              return (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                  style={{ width: '100%', padding: '8px', borderRadius: '10px', border: 'none', cursor: 'pointer', marginBottom: '3px', backgroundColor: isActive ? color : '#f5f0ee', color: isActive ? 'white' : '#9e8585', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: isActive ? 'white' : color }}>
                    {getInitials(cat.name)}
                  </div>
                  <span style={{ fontSize: '9px', fontWeight: 600, lineHeight: 1.2, textAlign: 'center', wordBreak: 'break-word' }}>{cat.name} {count > 0 ? `(${count})` : ''}</span>
                </button>
              )
            })}
          </div>
        </div>
        {/* Mobile Categories Dropdown */}
        <select
          className="block md:hidden w-full p-3 rounded-lg border border-[#e8ddd9] bg-white mb-2 text-[#3d2c2c] font-semibold text-[13px]"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="all">All ({products.length})</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        {/* MIDDLE — Products */}
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>
              PRODUCTS <span style={{ fontWeight: 400, color: '#b08a8a' }}>({filtered.length})</span>
            </p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {filtered.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9e8585' }}>
                <p style={{ fontSize: '36px', marginBottom: '8px' }}>📦</p>
                <p style={{ fontSize: '13px', margin: 0 }}>No products found</p>
                {user?.role === 'admin' && (
                  <button onClick={() => router.push('/products')} style={{ marginTop: '10px', fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#e8d5d0', color: '#b08a8a', cursor: 'pointer' }}>+ Add Products</button>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                {filtered.map(product => (
                  <button key={product.id} onPointerDown={e => { e.preventDefault(); addToCart(product) }} disabled={product.stock <= 0}
                    style={{ backgroundColor: '#f9f6f5', border: '1.5px solid #e8ddd9', borderRadius: '12px', padding: '12px 10px', textAlign: 'left', cursor: product.stock <= 0 ? 'not-allowed' : 'pointer', opacity: product.stock <= 0 ? 0.5 : 1, display: 'flex', flexDirection: 'column', gap: '6px' }}
                    onMouseEnter={e => { if (product.stock > 0) (e.currentTarget as HTMLButtonElement).style.borderColor = '#b08a8a' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e8ddd9' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: getColor(catName(product)) + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: getColor(catName(product)) }}>
                      {getInitials(catName(product) || 'OT')}
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#3d2c2c', margin: 0, lineHeight: 1.3 }}>{product.name}</p>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#b08a8a', margin: 0 }}>₱{product.selling_price.toFixed(2)}</p>
                    <p style={{ fontSize: '10px', color: product.stock <= product.low_stock_threshold ? '#c47a7a' : '#9e8585', margin: 0 }}>
                      {product.stock <= 0 ? '❌ Out' : `${product.stock} pcs`}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {filtered.map(product => (
                  <button key={product.id} onPointerDown={e => { e.preventDefault(); addToCart(product) }} disabled={product.stock <= 0}
                    style={{ backgroundColor: '#f9f6f5', border: '1.5px solid #e8ddd9', borderRadius: '10px', padding: '10px 12px', cursor: product.stock <= 0 ? 'not-allowed' : 'pointer', opacity: product.stock <= 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}
                    onMouseEnter={e => { if (product.stock > 0) (e.currentTarget as HTMLButtonElement).style.borderColor = '#b08a8a' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e8ddd9' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: getColor(catName(product)) + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: getColor(catName(product)), flexShrink: 0 }}>
                      {getInitials(catName(product) || 'OT')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                      <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>{catName(product) || 'Uncategorized'}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#b08a8a', margin: 0 }}>₱{product.selling_price.toFixed(2)}</p>
                      <p style={{ fontSize: '10px', color: product.stock <= product.low_stock_threshold ? '#c47a7a' : '#9e8585', margin: '2px 0 0' }}>{product.stock <= 0 ? '❌ Out' : `${product.stock} pcs`}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Cart */}
        <div style={{ width: '280px', flexShrink: 0, backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8ddd9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>
              CART <span style={{ fontWeight: 400, color: '#b08a8a' }}>({items.length})</span>
            </p>
            <div style={{ display: 'flex', gap: '6px' }}>
              {items.length > 0 && (
                <button onClick={handleVoidCart} style={{ fontSize: '11px', color: '#c47a7a', border: '1px solid #f5c4c4', backgroundColor: '#fdf0f0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>
                  🗑️ Void
                </button>
              )}
              {items.length > 0 && <button onClick={clearCart} style={{ fontSize: '11px', color: '#9e8585', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear</button>}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9e8585' }}>
                <p style={{ fontSize: '32px', marginBottom: '8px' }}>🛒</p>
                <p style={{ fontSize: '13px', margin: 0 }}>Cart is empty</p>
                <p style={{ fontSize: '11px', color: '#c4a09a', marginTop: '4px' }}>Tap a product to add</p>
              </div>
            ) : (
              <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {items.map(item => (
                  <div key={item.product_id} style={{ backgroundColor: '#f9f6f5', borderRadius: '10px', padding: '8px 10px', border: '1px solid #e8ddd9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#3d2c2c', margin: 0, flex: 1, paddingRight: '8px', lineHeight: 1.3 }}>{item.product_name}</p>
                      <button onClick={() => removeItem(item.product_id)} style={{ fontSize: '11px', color: '#c47a7a', border: 'none', background: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button onClick={() => updateQuantity(item.product_id, item.quantity - 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', backgroundColor: '#e8ddd9', color: '#3d2c2c', cursor: 'pointer', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#3d2c2c', minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product_id, item.quantity + 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', backgroundColor: '#c4a09a', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#b08a8a', margin: 0 }}>₱{item.subtotal.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: '12px', borderTop: '1px solid #e8ddd9', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '8px 10px', backgroundColor: '#f9f6f5', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#9e8585', fontWeight: 600 }}>TOTAL</span>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#3d2c2c' }}>₱{subtotal.toFixed(2)}</span>
            </div>
            {items.length > 0 && (
              <button onClick={() => setShowCheckout(true)} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                Proceed to Checkout →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Void Confirmation Modal */}
      {showVoidConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', maxWidth: '320px', borderRadius: '24px', padding: '24px', backgroundColor: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <p style={{ fontSize: '40px', marginBottom: '8px' }}>🗑️</p>
            <p style={{ fontWeight: 700, fontSize: '16px', color: '#3d2c2c', margin: '0 0 8px' }}>Void Transaction?</p>
            <p style={{ fontSize: '13px', color: '#9e8585', margin: '0 0 20px' }}>
              This will clear all {items.length} item{items.length > 1 ? 's' : ''} from the cart. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowVoidConfirm(false)}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#f5f0ee', color: '#9e8585', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { clearCart(); setShowVoidConfirm(false); showToast('🗑️ Transaction voided') }}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#c47a7a', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', maxWidth: '380px', borderRadius: '24px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight: 700, fontSize: '16px', color: '#3d2c2c', margin: '0 0 16px' }}>💳 Checkout</p>
            <div style={{ backgroundColor: '#f9f6f5', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: '#9e8585' }}>Items</span><span style={{ color: '#3d2c2c' }}>{items.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700 }}>
                <span style={{ color: '#3d2c2c' }}>Total</span><span style={{ color: '#b08a8a' }}>₱{subtotal.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {(['cash', 'gcash', 'utang'] as const).map(method => (
                <button key={method} onClick={() => { setPosPaymentMethod(method); if (method !== 'utang') setPaymentMethod(method) }}
                  style={{ flex: 1, padding: '10px 6px', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', backgroundColor: posPaymentMethod === method ? (method === 'utang' ? '#c47a7a' : '#b08a8a') : '#f5f0ee', color: posPaymentMethod === method ? 'white' : '#9e8585', border: `2px solid ${posPaymentMethod === method ? (method === 'utang' ? '#c47a7a' : '#b08a8a') : '#e8ddd9'}` }}>
                  {method === 'cash' ? '💵 Cash' : method === 'gcash' ? '📱 GCash' : '😬 Utang'}
                </button>
              ))}
            </div>
            {posPaymentMethod === 'cash' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>AMOUNT TENDERED</label>
                <input type="number" placeholder="0.00" value={amount_tendered || ''} onChange={e => setAmountTendered(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '16px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
                {amount_tendered >= subtotal && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', padding: '8px 12px', backgroundColor: '#f0f9f0', borderRadius: '10px' }}>
                    <span style={{ fontSize: '13px', color: '#7aaa7a', fontWeight: 600 }}>Change</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#7aaa7a' }}>₱{change.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            {posPaymentMethod === 'gcash' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>AMOUNT TENDERED (GCash)</label>
                <input type="number" placeholder="0.00" value={amount_tendered || ''} onChange={e => setAmountTendered(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '16px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box', marginBottom: '8px' }} />
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>GCASH REFERENCE NO. (optional)</label>
                <input type="text" placeholder="e.g. 1234567890" value={gcash_reference} onChange={e => setGcashReference(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '14px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
            {/* Customer name */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>
                CUSTOMER NAME {posPaymentMethod === 'utang' ? '*' : '(optional)'}
              </label>
              <input type="text" placeholder="e.g. Maria Santos" value={customerName} onChange={e => setCustomerName(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: `1.5px solid ${posPaymentMethod === 'utang' ? '#c47a7a' : '#e8ddd9'}`, backgroundColor: '#f5f0ee', fontSize: '14px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowCheckout(false)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#f5f0ee', color: '#9e8585', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCheckout} disabled={processing} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: processing ? '#d4bfbb' : 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: processing ? 'not-allowed' : 'pointer' }}>
                {processing ? 'Processing...' : '✅ Confirm Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receipt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', maxWidth: '320px', borderRadius: '24px', backgroundColor: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            {/* Receipt content */}
            <div id="receipt-content" style={{ padding: '24px', fontFamily: 'monospace' }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed #e8ddd9' }}>
                <p style={{ fontSize: '18px', fontWeight: 700, color: '#3d2c2c', margin: '0 0 4px', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                  {storeSettings.store_name}
                </p>
                <p style={{ fontSize: '11px', color: '#9e8585', margin: 0 }}>{receipt.date}</p>
                <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>#{receipt.transaction_number}</p>
                {receipt.customer_name && (
                  <p style={{ fontSize: '12px', color: '#3d2c2c', margin: '4px 0 0', fontWeight: 600 }}>👤 {receipt.customer_name}</p>
                )}
              </div>

              {/* Items */}
              <div style={{ marginBottom: '16px' }}>
                {receipt.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '12px', color: '#3d2c2c', margin: 0, fontWeight: 600 }}>{item.product_name}</p>
                      <p style={{ fontSize: '11px', color: '#9e8585', margin: '1px 0 0' }}>
                        {item.quantity} × ₱{item.selling_price.toFixed(2)}
                      </p>
                    </div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>
                      ₱{item.subtotal.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ borderTop: '1px dashed #e8ddd9', paddingTop: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#9e8585' }}>Subtotal</span>
                  <span style={{ fontSize: '13px', color: '#3d2c2c' }}>₱{receipt.subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#9e8585' }}>Payment</span>
                  <span style={{ fontSize: '13px', color: '#3d2c2c' }}>{receipt.payment_method === 'cash' ? '💵 Cash' : '📱 GCash'}</span>
                </div>
                {receipt.payment_method === 'cash' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#9e8585' }}>Tendered</span>
                      <span style={{ fontSize: '13px', color: '#3d2c2c' }}>₱{receipt.amount_tendered.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#7aaa7a' }}>Change</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#7aaa7a' }}>₱{receipt.change_amount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {receipt.payment_method === 'gcash' && receipt.gcash_reference && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#9e8585' }}>Ref #</span>
                    <span style={{ fontSize: '13px', color: '#3d2c2c' }}>{receipt.gcash_reference}</span>
                  </div>
                )}
              </div>

              {/* TOTAL */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f5e8e5', borderRadius: '10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#3d2c2c' }}>TOTAL</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#b08a8a' }}>₱{receipt.subtotal.toFixed(2)}</span>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', paddingTop: '12px', borderTop: '1px dashed #e8ddd9' }}>
                <p style={{ fontSize: '11px', color: '#9e8585', margin: '0 0 2px' }}>{storeSettings.receipt_footer}</p>
                <p style={{ fontSize: '10px', color: '#c4a09a', margin: 0 }}>Served by: {receipt.served_by}</p>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '12px 24px 20px', display: 'flex', gap: '8px' }}>
              <button onClick={() => window.print()}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', color: '#9e8585', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                🖨️ Print
              </button>
              <button onClick={() => setShowReceipt(false)}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                ✅ Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
