'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Product } from '@/types'
import { getStoredUser } from '@/lib/auth'
import { addToQueue } from '@/lib/db'
import BarcodeScanner from '@/components/BarcodeScanner'
import { withAuth } from '@/lib/withAuth'

const categoryColors: Record<string, string> = {
  'Beverages': '#8aaac4', 'Canned Goods': '#c4a09a', 'Condiments': '#c4aa7a',
  'Dairy': '#b0c4b0', 'Frozen Goods': '#a0c4c4', 'Instant Noodles': '#c4b48a',
  'Personal Care': '#c48ab4', 'Rice & Grains': '#8faa8f', 'Snacks': '#c48a8a', 'Others': '#aaaaaa',
}
function getColor(name: string) { return categoryColors[name] || '#b08a8a' }
function getInitials(name: string) { return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() }

interface InventoryLog {
  id: string
  product_id: string
  quantity: number
  buying_price: number | null
  notes: string | null
  created_at: string
  product?: { name: string; category?: { name: string } }
}

function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [activeTab, setActiveTab] = useState<'stock' | 'history'>('stock')
  const [showRestock, setShowRestock] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [scanning, setScanning] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [buyingPrice, setBuyingPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState('')
  const user = getStoredUser()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: prods }, { data: logsData }] = await Promise.all([
      supabase.from('products').select('*, category:categories(name)').eq('is_active', true).order('name'),
      supabase.from('inventory_logs')
        .select('*, product:products(name, category:categories(name))')
        .eq('type', 'restock')
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    if (prods) setProducts(prods)
    if (logsData) setLogs(logsData)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function openRestock(product: Product) {
    setSelectedProduct(product)
    setQuantity('')
    setBuyingPrice(product.buying_price.toString())
    setNotes('')
    setShowRestock(true)
  }

  function handleBarcodeScan(decoded: string) {
    setScanning(false)
    const product = products.find(p => p.barcode === decoded)
    if (product) { openRestock(product); showToast(`✅ Found: ${product.name}`) }
    else showToast('❌ Product not found. Register it in Products first.')
  }

  async function handleRestock() {
    if (!selectedProduct || !quantity) { showToast('⚠️ Enter quantity!'); return }
    const qty = parseInt(quantity)
    const price = parseFloat(buyingPrice) || selectedProduct.buying_price
    const inventoryLog = {
      product_id: selectedProduct.id, type: 'restock',
      quantity: qty, buying_price: price,
      notes: notes || null, performed_by: user?.id || null,
    }
    try {
      if (navigator.onLine) {
        const { error } = await supabase.from('inventory_logs').insert(inventoryLog)
        if (error) throw error
        await supabase.rpc('increment_stock', { p_product_id: selectedProduct.id, p_quantity: qty })
      } else {
        await addToQueue('restock', { inventory_log: inventoryLog, product_id: selectedProduct.id, quantity: qty })
      }
      showToast(`✅ Added ${qty} pcs of ${selectedProduct.name}!`)
      setShowRestock(false)
      loadData()
    } catch { showToast('❌ Error restocking') }
  }

  // Smart categories — only show ones with products
  const usedCategoryIds = new Set(products.map(p => p.category_id).filter(Boolean))
  const usedCategories = products
    .map(p => (p as Product & { category?: { name: string } }).category?.name)
    .filter((name, index, self) => name && self.indexOf(name) === index)

  // Get unique categories from products
  const smartCategories: { id: string; name: string }[] = []
  products.forEach(p => {
    const catId = p.category_id
    const catName = (p as Product & { category?: { name: string } }).category?.name
    if (catId && catName && !smartCategories.find(c => c.id === catId)) {
      smartCategories.push({ id: catId, name: catName })
    }
  })
  smartCategories.sort((a, b) => a.name.localeCompare(b.name))

  const filtered = products.filter(p => selectedCategory === 'all' || p.category_id === selectedCategory)
  const lowStockCount = products.filter(p => p.stock <= p.low_stock_threshold).length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f5f0ee' }}>

      {toast && (
        <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '8px 16px', borderRadius: '12px', backgroundColor: '#3d2c2c', color: 'white', fontSize: '13px', fontWeight: 500 }}>
          {toast}
        </div>
      )}

      {/* Low stock alert banner */}
      {lowStockCount > 0 && (
        <div style={{ padding: '8px 16px', backgroundColor: '#fdf0f0', borderBottom: '1px solid #f5c4c4', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '14px' }}>⚠️</span>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#c47a7a', margin: 0 }}>
            {lowStockCount} product{lowStockCount > 1 ? 's' : ''} running low on stock!
          </p>
          <button
            onClick={() => { setSelectedCategory('all'); setActiveTab('stock') }}
            style={{ marginLeft: 'auto', fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: 'none', backgroundColor: '#c47a7a', color: 'white', cursor: 'pointer', fontWeight: 600 }}
          >
            View All
          </button>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', gap: '10px', padding: '12px', overflow: 'hidden' }}>

        {/* LEFT — Smart Categories */}
        <div style={{ width: '280px', flexShrink: 0, backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>CATEGORIES</p>
            <p style={{ fontSize: '10px', color: '#c4a09a', margin: '2px 0 0' }}>
              {smartCategories.length} active
            </p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>

            {/* All */}
            <button onClick={() => setSelectedCategory('all')}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', backgroundColor: selectedCategory === 'all' ? '#f5e8e5' : 'transparent', borderLeft: selectedCategory === 'all' ? '3px solid #b08a8a' : '3px solid transparent' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: '#e8ddd9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#9e8585', flexShrink: 0 }}>All</div>
              <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>All</p>
                <p style={{ fontSize: '10px', color: '#9e8585', margin: 0 }}>{products.length} items</p>
              </div>
            </button>

            {/* Smart categories only */}
            {smartCategories.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#9e8585', textAlign: 'center', padding: '12px 4px' }}>
                No products yet
              </p>
            ) : smartCategories.map(cat => {
              const isActive = selectedCategory === cat.id
              const color = getColor(cat.name)
              const count = products.filter(p => p.category_id === cat.id).length
              const lowCount = products.filter(p => p.category_id === cat.id && p.stock <= p.low_stock_threshold).length
              return (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', backgroundColor: isActive ? '#f5e8e5' : 'transparent', borderLeft: isActive ? '3px solid #b08a8a' : '3px solid transparent' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color, flexShrink: 0 }}>
                    {getInitials(cat.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#3d2c2c', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</p>
                    <p style={{ fontSize: '10px', color: '#9e8585', margin: 0 }}>
                      {count} items {lowCount > 0 && <span style={{ color: '#c47a7a' }}>· {lowCount} low</span>}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Tabs container */}
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab header */}
          <div style={{ padding: '0 16px', borderBottom: '1px solid #e8ddd9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex' }}>
              {([
                { key: 'stock', label: 'Stock Levels' },
                { key: 'history', label: 'Restock History' },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{ padding: '14px 16px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, backgroundColor: 'transparent', color: activeTab === tab.key ? '#b08a8a' : '#9e8585', borderBottom: activeTab === tab.key ? '2px solid #b08a8a' : '2px solid transparent', marginBottom: '-1px' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Scan button */}
            <button onClick={() => setScanning(true)}
              style={{ padding: '8px 14px', borderRadius: '10px', border: '1.5px dashed #c4a09a', backgroundColor: '#e8d5d0', color: '#b08a8a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              📷 Scan to Restock
            </button>
          </div>

          {/* Scanner */}
          {scanning && (
          <BarcodeScanner
            onScan={handleBarcodeScan}
            onClose={() => setScanning(false)}
          />
        )}

          {/* STOCK LEVELS TAB */}
          {activeTab === 'stock' && (
            <>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px 120px', padding: '10px 16px', backgroundColor: '#f9f6f5', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
                {['PRODUCT', 'CATEGORY', 'STOCK', 'THRESHOLD', 'ACTION'].map(h => (
                  <p key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>{h}</p>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9e8585' }}>
                    <p style={{ fontSize: '36px', marginBottom: '8px' }}>📦</p>
                    <p style={{ fontSize: '13px', margin: 0 }}>No products in this category</p>
                  </div>
                ) : filtered.map((product, i) => {
                  const isLow = product.stock <= product.low_stock_threshold
                  const isOut = product.stock <= 0
                  return (
                    <div key={product.id}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px 120px', padding: '12px 16px', borderBottom: i < filtered.length - 1 ? '1px solid #f9f6f5' : 'none', alignItems: 'center', backgroundColor: isOut ? '#fdf8f8' : isLow ? '#fdfaf5' : 'white' }}>

                      {/* Product */}
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>{product.name}</p>
                        {product.expiry_date && (
                          <p style={{ fontSize: '10px', color: '#c4aa7a', margin: '2px 0 0' }}>Exp: {product.expiry_date}</p>
                        )}
                      </div>

                      {/* Category */}
                      <div>
                        {(() => {
                          const catName = (product as Product & { category?: { name: string } }).category?.name
                          const color = getColor(catName || '')
                          return catName ? (
                            <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: 600, backgroundColor: color + '22', color }}>
                              {catName}
                            </span>
                          ) : <span style={{ fontSize: '11px', color: '#9e8585' }}>—</span>
                        })()}
                      </div>

                      {/* Stock */}
                      <div>
                        <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', fontWeight: 700, backgroundColor: isOut ? '#fdf0f0' : isLow ? '#fdf5f0' : '#f0f9f0', color: isOut ? '#c47a7a' : isLow ? '#c4aa7a' : '#7aaa7a' }}>
                          {isOut ? '❌ Out' : `${product.stock} pcs`}
                        </span>
                      </div>

                      {/* Threshold */}
                      <p style={{ fontSize: '12px', color: '#9e8585', margin: 0 }}>
                        Alert at {product.low_stock_threshold}
                      </p>

                      {/* Action */}
                      <button onClick={() => openRestock(product)}
                        style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
                        + Restock
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* RESTOCK HISTORY TAB */}
          {activeTab === 'history' && (
            <>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 1fr', padding: '10px 16px', backgroundColor: '#f9f6f5', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
                {['PRODUCT', 'CATEGORY', 'QTY ADDED', 'BUY PRICE', 'DATE & NOTES'].map(h => (
                  <p key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>{h}</p>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {logs.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9e8585' }}>
                    <p style={{ fontSize: '36px', marginBottom: '8px' }}>📋</p>
                    <p style={{ fontSize: '13px', margin: 0 }}>No restock history yet</p>
                  </div>
                ) : logs.map((log, i) => {
                  const catName = (log.product as { name: string; category?: { name: string } } | undefined)?.category?.name
                  const color = getColor(catName || '')
                  return (
                    <div key={log.id}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 1fr', padding: '12px 16px', borderBottom: i < logs.length - 1 ? '1px solid #f9f6f5' : 'none', alignItems: 'center', backgroundColor: 'white' }}>

                      {/* Product */}
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>
                        {(log.product as { name: string } | undefined)?.name || '—'}
                      </p>

                      {/* Category */}
                      <div>
                        {catName ? (
                          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: 600, backgroundColor: color + '22', color }}>
                            {catName}
                          </span>
                        ) : <span style={{ fontSize: '11px', color: '#9e8585' }}>—</span>}
                      </div>

                      {/* Qty */}
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#7aaa7a' }}>+{log.quantity} pcs</span>

                      {/* Buying price */}
                      <p style={{ fontSize: '12px', color: '#9e8585', margin: 0 }}>
                        {log.buying_price ? `₱${log.buying_price.toFixed(2)}` : '—'}
                      </p>

                      {/* Date + notes */}
                      <div>
                        <p style={{ fontSize: '12px', color: '#3d2c2c', margin: 0 }}>
                          {new Date(log.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          <span style={{ color: '#9e8585', marginLeft: '6px' }}>
                            {new Date(log.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </p>
                        {log.notes && <p style={{ fontSize: '11px', color: '#c4a09a', margin: '2px 0 0' }}>{log.notes}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Restock Modal */}
      {showRestock && selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', maxWidth: '400px', borderRadius: '24px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight: 700, fontSize: '16px', color: '#3d2c2c', margin: '0 0 4px' }}>📦 Restock</p>
            <p style={{ fontSize: '13px', color: '#9e8585', margin: '0 0 16px' }}>{selectedProduct.name}</p>

            {/* Current stock */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#f9f6f5', borderRadius: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: '#9e8585' }}>Current stock</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: selectedProduct.stock <= selectedProduct.low_stock_threshold ? '#c47a7a' : '#7aaa7a' }}>
                {selectedProduct.stock} pcs
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>QUANTITY TO ADD *</label>
                <input type="number" placeholder="e.g. 10" value={quantity} onChange={e => setQuantity(e.target.value)} autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '16px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
                {quantity && parseInt(quantity) > 0 && (
                  <p style={{ fontSize: '12px', color: '#7aaa7a', margin: '6px 0 0 4px', fontWeight: 600 }}>
                    New stock: {selectedProduct.stock + parseInt(quantity)} pcs
                  </p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>BUYING PRICE PER PC (₱)</label>
                <input type="number" placeholder="0.00" value={buyingPrice} onChange={e => setBuyingPrice(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '14px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>NOTES (optional)</label>
                <input type="text" placeholder="e.g. From SM Supermarket" value={notes} onChange={e => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowRestock(false)}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#f5f0ee', color: '#9e8585', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleRestock}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                ✅ Add Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default withAuth(InventoryPage, ['admin'])