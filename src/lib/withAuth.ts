'use client'

import { createElement, useEffect, useState, type FC } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredUser } from '@/lib/auth'
import { UserRole } from '@/types'

export function withAuth(
  Component: FC,
  allowedRoles: UserRole[]
): FC {
  return function ProtectedPage() {
    const router = useRouter()
    const [allowed, setAllowed] = useState(false)

    useEffect(() => {
      const user = getStoredUser()
      if (!user) {
        router.push('/login')
        return
      }
      if (!allowedRoles.includes(user.role)) {
        router.push('/pos')
        return
      }
      setAllowed(true)
    }, [router])

    if (!allowed) return null
    return createElement(Component)
  }
}