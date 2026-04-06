'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Product, Category } from '@/types'
import BarcodeScanner from '@/components/BarcodeScanner'
import { withAuth } from '@/lib/withAuth'
import RunningText from '@/components/RunningText'


function getColor(name: string): string {
  // Generate consistent color from category name
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 35%, 65%)`
}

function getInitials(name: string) { 
  return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() 
}

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [editCategory, setEditCategory] = useState<Category | null>(null)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [form, setForm] = useState({
    barcode: '', name: '', category_id: '',
    buying_price: '', selling_price: '',
    stock: '', low_stock_threshold: '5', expiry_date: '',
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*, category:categories(name)').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    if (prods) setProducts(prods)
    if (cats) setCategories(cats)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function openNewCategory() {
    setEditCategory(null)
    setCategoryName('')
    setShowCategoryForm(true)
  }

  function openEditCategory(cat: Category) {
    setEditCategory(cat)
    setCategoryName(cat.name)
    setShowCategoryForm(true)
  }

  async function handleSaveCategory() {
    if (!categoryName.trim()) { showToast('⚠️ Category name required!'); return }
    if (editCategory) {
      const { error } = await supabase.from('categories').update({ name: categoryName.trim() }).eq('id', editCategory.id)
      if (error) { showToast('❌ Error updating category'); return }
      showToast('✅ Category updated!')
    } else {
      const { error } = await supabase.from('categories').insert({ name: categoryName.trim() })
      if (error) { showToast('❌ Already exists!'); return }
      showToast('✅ Category added!')
    }
    setShowCategoryForm(false)
    loadData()
  }

  async function handleDeleteCategory(cat: Category) {
    const hasProducts = products.some(p => p.category_id === cat.id)
    if (hasProducts) { showToast('⚠️ Cannot delete — has products!'); return }
    await supabase.from('categories').delete().eq('id', cat.id)
    showToast('✅ Deleted!')
    if (selectedCategory === cat.id) setSelectedCategory('all')
    loadData()
  }

  function openNewProduct() {
    setEditProduct(null)
    setForm({ barcode: '', name: '', category_id: selectedCategory !== 'all' ? selectedCategory : '', buying_price: '', selling_price: '', stock: '', low_stock_threshold: '5', expiry_date: '' })
    setShowProductForm(true)
  }

  const modalActionRef = useRef<boolean>(false)

  function safeModalAction(fn: () => void) {
    if (modalActionRef.current) return
    modalActionRef.current = true
    setTimeout(() => { modalActionRef.current = false }, 500)
    fn()
  }

  function openEditProduct(product: Product) {
    setEditProduct(product)
    setForm({
      barcode: product.barcode || '', name: product.name,
      category_id: product.category_id || '',
      buying_price: product.buying_price.toString(),
      selling_price: product.selling_price.toString(),
      stock: product.stock.toString(),
      low_stock_threshold: product.low_stock_threshold.toString(),
      expiry_date: product.expiry_date || '',
    })
    setShowProductForm(true)
  }

  async function handleBarcodeScan(decoded: string) {
    setScanning(false)
    setForm(f => ({ ...f, barcode: decoded }))
    const { data } = await supabase.from('products').select('*').eq('barcode', decoded).single()
    if (data) { showToast('ℹ️ Already registered!'); openEditProduct(data) }
    else { showToast('✅ Scanned! Fill in product details.'); setShowProductForm(true) }
  }

  async function handleSaveProduct() {
    if (!form.name || !form.selling_price) { showToast('⚠️ Name and price required!'); return }
    const data = {
      barcode: form.barcode || null, name: form.name,
      category_id: form.category_id || null,
      buying_price: parseFloat(form.buying_price) || 0,
      selling_price: parseFloat(form.selling_price),
      stock: parseInt(form.stock) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
      expiry_date: form.expiry_date || null,
    }
    if (editProduct) {
      const { error } = await supabase.from('products').update(data).eq('id', editProduct.id)
      if (error) { showToast('❌ Error'); return }
      showToast('✅ Updated!')
    } else {
      const { error } = await supabase.from('products').insert(data)
      if (error) { showToast('❌ Error'); return }
      showToast('✅ Added!')
    }
    setShowProductForm(false)
    loadData()
  }

  async function toggleActive(product: Product) {
    await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id)
    loadData()
  }

  async function handleDeleteProduct(product: Product) {
    const confirm = window.confirm(`Delete "${product.name}"? This cannot be undone.`)
    if (!confirm) return
    const { error } = await supabase.from('products').delete().eq('id', product.id)
    if (error) { showToast('❌ Cannot delete — product has sales history!'); return }
    showToast('✅ Product deleted!')
    loadData()
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode && p.barcode.includes(search))
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory
    return matchSearch && matchCat
  })

  const selectedCategoryName = selectedCategory === 'all' ? 'All Products' : categories.find(c => c.id === selectedCategory)?.name || ''

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f5f0ee' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '8px 16px', borderRadius: '12px', backgroundColor: '#3d2c2c', color: 'white', fontSize: '13px', fontWeight: 500 }}>
          {toast}
        </div>
      )}

      {/* TOP — Search bar */}
      <div style={{ padding: '12px 16px', backgroundColor: '#f5f0ee', borderBottom: '1px solid #e8ddd9', display: 'flex', gap: '8px', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="🔍 Search products by name or barcode..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#fff', fontSize: '13px', color: '#3d2c2c', outline: 'none' }}
        />
        <button
          onClick={() => setScanning(true)}
          style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px dashed #c4a09a', backgroundColor: '#e8d5d0', color: '#b08a8a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          📷 Scan Barcode
        </button>
      </div>

      {/* Scanner */}
      {scanning && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setScanning(false)}
        />
      )}

      {/* BOTTOM — Two containers side by side */}
      <div className="flex flex-col md:flex-row flex-1 gap-3 md:gap-[10px] px-3 pb-3 md:px-3 md:pb-3 overflow-y-auto md:overflow-hidden">

        {/* LEFT Container — Categories */}
        <div className="hidden md:flex w-full md:w-[280px] shrink-0 md:shrink" style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8ddd9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>Categories</p>
            <button
              onClick={openNewCategory}
              style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#e8d5d0', color: '#b08a8a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              + Add
            </button>
          </div>

          {/* Category list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {/* All */}
            <button
              onClick={() => setSelectedCategory('all')}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '10px', border: 'none',
                cursor: 'pointer', textAlign: 'left', marginBottom: '2px',
                backgroundColor: selectedCategory === 'all' ? '#f5e8e5' : 'transparent',
                borderLeft: selectedCategory === 'all' ? '3px solid #b08a8a' : '3px solid transparent',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}
            >
              <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: '#e8ddd9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#9e8585', flexShrink: 0 }}>
                All
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>All Products</p>
                <p style={{ fontSize: '11px', color: '#9e8585', margin: 0 }}>{products.length} items</p>
              </div>
            </button>

            {/* Categories */}
            {categories.map(cat => {
              const count = products.filter(p => p.category_id === cat.id).length
              const isActive = selectedCategory === cat.id
              const color = getColor(cat.name)
              return (
                <div key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    padding: '10px 12px', borderRadius: '10px', marginBottom: '2px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                    backgroundColor: isActive ? '#f5e8e5' : 'transparent',
                    borderLeft: isActive ? '3px solid #b08a8a' : '3px solid transparent',
                  }}
                >
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color, flexShrink: 0 }}>
                    {getInitials(cat.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</p>
                    <p style={{ fontSize: '11px', color: '#9e8585', margin: 0 }}>{count} items</p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); openEditCategory(cat) }}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', backgroundColor: '#e8d5d0', color: '#b08a8a', fontSize: '12px', cursor: 'pointer' }}>
                      ✏️
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteCategory(cat) }}
                      style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', backgroundColor: '#f9e8e8', color: '#c47a7a', fontSize: '12px', cursor: 'pointer' }}>
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Inline category form */}
          {showCategoryForm && (
            <div style={{ padding: '12px', borderTop: '1px solid #e8ddd9', backgroundColor: '#f5f0ee', flexShrink: 0 }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#3d2c2c', margin: '0 0 8px' }}>
                {editCategory ? 'Edit Category' : 'New Category'}
              </p>
              <input
                type="text"
                placeholder="Category name"
                value={categoryName}
                onChange={e => setCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveCategory()}
                autoFocus
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #e8ddd9', backgroundColor: '#fff', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box', marginBottom: '8px' }}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => setShowCategoryForm(false)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: '#e8ddd9', color: '#9e8585', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSaveCategory}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Save
                </button>
              </div>
            </div>
          )}
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

        {/* RIGHT Container — Products */}
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8ddd9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>{selectedCategoryName}</p>
              <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>{filtered.length} products</p>
            </div>
            <button onClick={openNewProduct}
              style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
              + Add Product
            </button>
          </div>

          {/* Table wrapper Desktop */}
          <div className="hidden md:flex overflow-x-auto flex-1 flex-col">
            <div className="min-w-[600px] flex-1 flex flex-col">
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px 60px 70px 120px', padding: '8px 16px', backgroundColor: '#f9f6f5', borderBottom: '1px solid #e8ddd9', flexShrink: 0 }}>
                {['PRODUCT', 'BARCODE', 'BUY', 'SELL', 'STOCK', 'ACTIONS'].map(h => (
                  <p key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#9e8585', margin: 0, letterSpacing: '1px' }}>{h}</p>
                ))}
              </div>

              {/* Product rows */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9e8585' }}>
                <p style={{ fontSize: '36px', marginBottom: '8px' }}>📦</p>
                <p style={{ fontSize: '13px', margin: 0 }}>No products yet</p>
                <p style={{ fontSize: '11px', marginTop: '4px', color: '#b08a8a' }}>Click &quot;+ Add Product&quot; to get started</p>
              </div>
            ) : filtered.map((product, i) => (
              <div key={product.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 60px 60px 70px 120px',
                  padding: '11px 16px', alignItems: 'center',
                  borderBottom: i < filtered.length - 1 ? '1px solid #f9f6f5' : 'none',
                  backgroundColor: 'white', opacity: product.is_active ? 1 : 0.5,
                }}
              >
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>{product.name}</p>
                  <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>
                    {(product as Product & { category?: { name: string } }).category?.name || 'Uncategorized'}
                    {product.expiry_date && <span style={{ color: '#c4aa7a', marginLeft: '6px' }}>· Exp: {product.expiry_date}</span>}
                  </p>
                </div>
                <p style={{ fontSize: '11px', color: '#9e8585', margin: 0 }}>
                  {product.barcode ? '...' + product.barcode.slice(-5) : '—'}
                </p>
                <p style={{ fontSize: '12px', color: '#9e8585', margin: 0 }}>₱{product.buying_price.toFixed(2)}</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#b08a8a', margin: 0 }}>₱{product.selling_price.toFixed(2)}</p>
                <span style={{
                  fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: 600, display: 'inline-block',
                  backgroundColor: product.stock <= 0 ? '#fdf0f0' : product.stock <= product.low_stock_threshold ? '#fdf5f0' : '#f0f9f0',
                  color: product.stock <= 0 ? '#c47a7a' : product.stock <= product.low_stock_threshold ? '#c4aa7a' : '#7aaa7a',
                }}>
                  {product.stock <= 0 ? 'Out' : `${product.stock} pcs`}
                </span>
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'nowrap' }}>
                  <button onPointerDown={e => { e.preventDefault(); safeModalAction(() => openEditProduct(product)) }}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', backgroundColor: '#e8d5d0', color: '#b08a8a', fontSize: '10px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Edit
                  </button>
                  <button onClick={() => toggleActive(product)}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', backgroundColor: product.is_active ? '#f5f0ee' : '#e8f5e8', color: product.is_active ? '#9e8585' : '#7aaa7a', fontSize: '10px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {product.is_active ? 'Off' : 'On'}
                  </button>
                  <button onClick={() => handleDeleteProduct(product)}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', backgroundColor: '#f9e8e8', color: '#c47a7a', fontSize: '10px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
            </div>
          </div>

          {/* Product cards Mobile */}
          <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-2 bg-[#f5f0ee]">
            {filtered.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#9e8585' }}>
                <p style={{ fontSize: '36px', marginBottom: '8px' }}>📦</p>
                <p style={{ fontSize: '13px', margin: 0 }}>No products yet</p>
              </div>
            ) : filtered.map((product) => (
              <div key={product.id} className={`bg-white rounded-2xl p-3 border border-[#e8ddd9] shadow-sm flex flex-col gap-2 ${product.is_active ? '' : 'opacity-50'}`}>
                {/* Top row: Name & Active toggle */}
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0" style={{ flex: 1 }}>
                      <RunningText text={product.name} className="text-[14px] font-bold text-[#3d2c2c]" />
                      <p className="text-[11px] text-[#9e8585] mt-0.5">
                        {(product as Product & { category?: { name: string } }).category?.name || 'Uncategorized'}
                        {product.barcode && <span className="ml-1 text-[#c4aa7a] font-semibold">· {product.barcode.slice(-5)}</span>}
                      </p>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold flex-shrink-0 whitespace-nowrap ${product.stock <= 0 ? 'bg-[#fdf0f0] text-[#c47a7a]' : product.stock <= product.low_stock_threshold ? 'bg-[#fdf5f0] text-[#c4aa7a]' : 'bg-[#f0f9f0] text-[#7aaa7a]'}`}>
                    {product.stock <= 0 ? 'Out' : `${product.stock} pcs`}
                  </span>
                </div>
                
                {/* Price & Actions Row */}
                <div className="flex items-end justify-between mt-1 border-t border-[#f5f0ee] pt-2">
                  <div>
                    <p className="text-[10px] font-semibold text-[#9e8585] mb-0.5">BUY: ₱{product.buying_price.toFixed(2)}</p>
                    <p className="text-[15px] font-bold text-[#c47a7a]">SELL: ₱{product.selling_price.toFixed(2)}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onPointerDown={e => { e.preventDefault(); safeModalAction(() => openEditProduct(product)) }} className="px-3 py-1.5 bg-[#e8d5d0] text-[#b08a8a] text-[11px] font-bold rounded-lg border-none active:scale-95 transition-transform">Edit</button>
                    <button onClick={() => toggleActive(product)} className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border-none active:scale-95 transition-transform ${product.is_active ? 'bg-[#f5f0ee] text-[#9e8585]' : 'bg-[#e8f5e8] text-[#7aaa7a]'}`}>{product.is_active ? 'Off' : 'On'}</button>
                    <button onClick={() => handleDeleteProduct(product)} className="px-3 py-1.5 bg-[#f9e8e8] text-[#c47a7a] text-[11px] font-bold rounded-lg border-none active:scale-95 transition-transform">Del</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Product Form Modal */}
      {showProductForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', maxWidth: '420px', borderRadius: '24px', padding: '20px', backgroundColor: '#fff', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight: 700, fontSize: '16px', color: '#3d2c2c', margin: '0 0 16px' }}>
              {editProduct ? '✏️ Edit Product' : '+ New Product'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'BARCODE', key: 'barcode', type: 'text', placeholder: 'Scan or type barcode' },
                { label: 'PRODUCT NAME *', key: 'name', type: 'text', placeholder: 'e.g. Lucky Me Pancit Canton' },
                { label: 'BUYING PRICE (₱)', key: 'buying_price', type: 'number', placeholder: '0.00' },
                { label: 'SELLING PRICE (₱) *', key: 'selling_price', type: 'number', placeholder: '0.00' },
                { label: 'STOCK QUANTITY', key: 'stock', type: 'number', placeholder: '0' },
                { label: 'LOW STOCK ALERT', key: 'low_stock_threshold', type: 'number', placeholder: '5' },
                { label: 'EXPIRY DATE', key: 'expiry_date', type: 'date', placeholder: '' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '5px' }}>{field.label}</label>
                  <input
                    type={field.type} placeholder={field.placeholder}
                    value={form[field.key as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '5px' }}>CATEGORY</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none' }}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onPointerDown={e => { e.preventDefault(); safeModalAction(() => setShowProductForm(false)) }}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#f5f0ee', color: '#9e8585', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onPointerDown={e => { e.preventDefault(); safeModalAction(() => handleSaveProduct()) }}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                {editProduct ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default withAuth(ProductsPage, ['admin'])