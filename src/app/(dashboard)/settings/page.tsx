'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getStoredUser, changePassword, createUser } from '@/lib/auth'
import { StoreSettings } from '@/types'
import { withAuth } from '@/lib/withAuth'

function SettingsPage() {
  const user = getStoredUser()
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [form, setForm] = useState({ store_name: '', address: '', phone: '', receipt_footer: '', low_stock_default: '5' })
  const [pwForm, setPwForm] = useState({ newPw: '', confirm: '' })
  const [toast, setToast] = useState('')
  const [newUser, setNewUser] = useState({ username: '', password: '', full_name: '', role: 'cashier' })
  const [users, setUsers] = useState<Record<string, unknown>[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: s } = await supabase.from('store_settings').select('*').single()
    if (s) {
      setSettings(s)
      setForm({ store_name: s.store_name || '', address: s.address || '', phone: s.phone || '', receipt_footer: s.receipt_footer || '', low_stock_default: s.low_stock_default?.toString() || '5' })
    }
    const { data: u } = await supabase.from('users').select('id, username, role, full_name, is_active').order('created_at')
    if (u) setUsers(u)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function saveSettings() {
    if (!settings) return
    const { error } = await supabase.from('store_settings').update({
      store_name: form.store_name, address: form.address || null,
      phone: form.phone || null, receipt_footer: form.receipt_footer || null,
      low_stock_default: parseInt(form.low_stock_default) || 5,
    }).eq('id', settings.id)
    if (error) { showToast('❌ Error saving settings'); return }
    showToast('✅ Settings saved!')
  }

  async function handleChangePassword() {
    if (!pwForm.newPw || pwForm.newPw !== pwForm.confirm) { showToast('⚠️ Passwords do not match!'); return }
    if (pwForm.newPw.length < 6) { showToast('⚠️ Password must be at least 6 characters!'); return }
    const { error } = await changePassword(user?.id || '', pwForm.newPw)
    if (error) { showToast('❌ ' + error); return }
    showToast('✅ Password changed!')
    setPwForm({ newPw: '', confirm: '' })
  }

  async function handleAddUser() {
    if (!newUser.username || !newUser.password) { showToast('⚠️ Username and password required!'); return }
    if (newUser.password.length < 6) { showToast('⚠️ Password must be at least 6 characters!'); return }
    const { error } = await createUser(newUser.username, newUser.password, newUser.role as 'admin' | 'cashier', newUser.full_name)
    if (error) { showToast('❌ ' + error); return }
    showToast('✅ User added!')
    setNewUser({ username: '', password: '', full_name: '', role: 'cashier' })
    loadData()
  }

  async function toggleUser(id: string, active: boolean) {
    await supabase.from('users').update({ is_active: !active }).eq('id', id)
    loadData()
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '8px 16px', borderRadius: '12px', backgroundColor: '#3d2c2c', color: 'white', fontSize: '13px', fontWeight: 500 }}>
          {toast}
        </div>
      )}

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '700px', margin: '0 auto' }}>

        {/* Store Settings */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8ddd9', background: 'linear-gradient(135deg, #f5e8e5, #f9f6f5)' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>🏪 Store Settings</p>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'STORE NAME', key: 'store_name', type: 'text', placeholder: 'Chiara Store' },
              { label: 'ADDRESS', key: 'address', type: 'text', placeholder: 'Store address' },
              { label: 'PHONE', key: 'phone', type: 'text', placeholder: '09XX XXX XXXX' },
              { label: 'RECEIPT FOOTER', key: 'receipt_footer', type: 'text', placeholder: 'Thank you!' },
              { label: 'DEFAULT LOW STOCK THRESHOLD', key: 'low_stock_default', type: 'number', placeholder: '5' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder} value={form[f.key as keyof typeof form]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <button onClick={saveSettings}
              style={{ padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              💾 Save Settings
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8ddd9', background: 'linear-gradient(135deg, #f5e8e5, #f9f6f5)' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>🔒 Change Password</p>
            <p style={{ fontSize: '11px', color: '#9e8585', margin: '2px 0 0' }}>Passwords are securely hashed</p>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'NEW PASSWORD (min 6 chars)', key: 'newPw', placeholder: 'New password' },
              { label: 'CONFIRM PASSWORD', key: 'confirm', placeholder: 'Confirm password' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#9e8585', display: 'block', marginBottom: '6px' }}>{f.label}</label>
                <input type="password" placeholder={f.placeholder} value={pwForm[f.key as keyof typeof pwForm]}
                  onChange={e => setPwForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <button onClick={handleChangePassword}
              style={{ padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              🔒 Change Password
            </button>
          </div>
        </div>

        {/* User Management */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e8ddd9', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8ddd9', background: 'linear-gradient(135deg, #f5e8e5, #f9f6f5)' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#3d2c2c', margin: 0 }}>👥 User Management</p>
          </div>
          <div style={{ padding: '16px' }}>
            {/* Existing users */}
            <div style={{ marginBottom: '16px' }}>
              {users.map(u => (
                <div key={u.id as string} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', backgroundColor: '#f9f6f5', marginBottom: '6px', border: '1px solid #e8ddd9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: u.role === 'admin' ? '#f5e8e5' : '#e8f0f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                      {u.role === 'admin' ? '👑' : '👤'}
                    </div>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#3d2c2c', margin: 0 }}>
                        {u.username as string}
                        {(u.id as string) === user?.id && <span style={{ fontSize: '10px', color: '#b08a8a', marginLeft: '6px' }}>(you)</span>}
                      </p>
                      <p style={{ fontSize: '11px', color: '#9e8585', margin: '1px 0 0' }}>
                        {u.role as string}{u.full_name ? ` · ${u.full_name}` : ''}
                      </p>
                    </div>
                  </div>
                  {(u.id as string) !== user?.id && (
                    <button onClick={() => toggleUser(u.id as string, u.is_active as boolean)}
                      style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', backgroundColor: (u.is_active as boolean) ? '#f9e8e8' : '#e8f5e8', color: (u.is_active as boolean) ? '#c47a7a' : '#7aaa7a' }}>
                      {(u.is_active as boolean) ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add new user */}
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#9e8585', letterSpacing: '1px', margin: '0 0 10px' }}>ADD NEW USER</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'Full Name', key: 'full_name', type: 'text', placeholder: 'Full name' },
                { label: 'Username', key: 'username', type: 'text', placeholder: 'Username' },
                { label: 'Password (min 6 chars)', key: 'password', type: 'password', placeholder: 'Password' },
              ].map(f => (
                <input key={f.key} type={f.type} placeholder={f.placeholder} value={newUser[f.key as keyof typeof newUser]}
                  onChange={e => setNewUser(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none', boxSizing: 'border-box' }} />
              ))}
              <select value={newUser.role} onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e8ddd9', backgroundColor: '#f5f0ee', fontSize: '13px', color: '#3d2c2c', outline: 'none' }}>
                <option value="cashier">👤 Cashier</option>
                <option value="admin">👑 Admin</option>
              </select>
              <button onClick={handleAddUser}
                style={{ padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #c4a09a, #b08a8a)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                + Add User
              </button>
            </div>
          </div>
        </div>

        {/* App info */}
        <div style={{ textAlign: 'center', padding: '12px', color: '#9e8585' }}>
          <p style={{ fontSize: '12px', margin: 0 }}>Chiara Store POS v1.0</p>
          <p style={{ fontSize: '11px', margin: '2px 0 0' }}>Built with Next.js + Supabase · Passwords are SHA-256 hashed</p>
        </div>
      </div>
    </div>
  )
}

export default withAuth(SettingsPage, ['admin'])
