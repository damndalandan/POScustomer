'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getStoredUser, logout } from '@/lib/auth'
import { syncOfflineQueue } from '@/lib/sync'
import { getQueueCount } from '@/lib/db'
import { User } from '@/types'

const navItems = [
  { icon: '🏠', label: 'Home', href: '/dashboard', roles: ['admin'] },
  { icon: '🛒', label: 'POS', href: '/pos', roles: ['admin', 'cashier'] },
  { icon: '📦', label: 'Products', href: '/products', roles: ['admin'] },
  { icon: '🗃️', label: 'Inventory', href: '/inventory', roles: ['admin'] },
  { icon: '😬', label: 'Utang', href: '/utang', roles: ['admin', 'cashier'] },
  { icon: '💵', label: 'Cash', href: '/cash', roles: ['admin', 'cashier'] },
  { icon: '📊', label: 'Reports', href: '/reports', roles: ['admin'] },
  { icon: '🧾', label: 'Expenses', href: '/expenses', roles: ['admin', 'cashier'] },
  { icon: '↩️', label: 'Refunds', href: '/refunds', roles: ['admin'] },
  { icon: '⚙️', label: 'Settings', href: '/settings', roles: ['admin'] },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [mounted, setMounted] = useState(false)
  const [pendingSync, setPendingSync] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setMounted(true)
    setIsOnline(navigator.onLine)
    const storedUser = getStoredUser()
    if (!storedUser) {
      router.push('/login')
      return
    }
    setUser(storedUser)

    getQueueCount().then(setPendingSync)

    const handleOnline = async () => {
      setIsOnline(true)
      const count = await getQueueCount()
      if (count > 0) {
        setSyncing(true)
        await syncOfflineQueue()
        setPendingSync(0)
        setSyncing(false)
      }
    }

    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (navigator.onLine) handleOnline()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [router])

  if (!mounted || !user) return null

  const visibleNav = navItems.filter((item) => item.roles.includes(user.role))

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f0ee',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'linear-gradient(135deg, #c4a09a, #b08a8a)',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ height: '28px', display: 'flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt="Chiara Store"
              style={{ height: '28px', width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', margin: 0 }}>
              {user.role === 'admin' ? '👑' : '👤'} {user.full_name || user.username}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pendingSync > 0 ? (
            <div style={{
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
            }}>
              {syncing ? '🔄' : '⏳'} {pendingSync}
            </div>
          ) : (
            <div style={{
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
            }}>
              {isOnline ? '🟢' : '🔴'}
            </div>
          )}
          <button
            onClick={logout}
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {children}
      </div>

      {/* Bottom Navigation */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid #e8ddd9',
        backgroundColor: '#fff',
        zIndex: 10,
        display: 'flex',
      }}>
        {visibleNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 4px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                color: isActive ? '#b08a8a' : '#9e8585',
                borderTop: isActive ? '2px solid #b08a8a' : '2px solid transparent',
                transition: 'color 0.15s',
              }}
            >
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              <span style={{ fontSize: '10px', marginTop: '2px', fontWeight: 500 }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}