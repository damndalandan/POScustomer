'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'

export default function LoginPage() {
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { user, error } = await login(username, password)
    if (error || !user) {
      setError(error || 'Login failed')
      setLoading(false)
      return
    }
    setUser(user)
    router.push(user.role === 'admin' ? '/dashboard' : '/pos')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f5f0ee 0%, #e8d5d0 100%)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-2" style={{ width: '360px', height: '260px' }}>
            <img
              src="/logo.png"
              alt="Chiara Store"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#3d2c2c' }}>Chiara Store</h1>
          <p className="text-sm mt-1" style={{ color: '#9e8585' }}>Point of Sale System</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl p-6 shadow-lg" style={{ backgroundColor: '#fff', border: '1px solid #e8ddd9' }}>
          <h2 className="text-base font-semibold mb-5" style={{ color: '#3d2c2c' }}>Sign in to continue</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5 tracking-wide" style={{ color: '#9e8585' }}>
                USERNAME
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{ backgroundColor: '#f5f0ee', border: '1.5px solid #e8ddd9', color: '#3d2c2c' }}
                onFocus={(e) => (e.target.style.borderColor = '#b08a8a')}
                onBlur={(e) => (e.target.style.borderColor = '#e8ddd9')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 tracking-wide" style={{ color: '#9e8585' }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{ backgroundColor: '#f5f0ee', border: '1.5px solid #e8ddd9', color: '#3d2c2c' }}
                onFocus={(e) => (e.target.style.borderColor = '#b08a8a')}
                onBlur={(e) => (e.target.style.borderColor = '#e8ddd9')}
              />
            </div>
            {error && (
              <div className="rounded-xl p-3 text-center text-sm" style={{ backgroundColor: '#f9e8e8', color: '#c47a7a' }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 mt-2"
              style={{ background: loading ? '#d4bfbb' : 'linear-gradient(135deg, #c4a09a, #b08a8a)' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs mt-6" style={{ color: '#9e8585' }}>Chiara Store POS v1.0</p>
      </div>
    </div>
  )
}
