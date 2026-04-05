import { supabase } from '@/lib/supabase'
import { User } from '@/types'

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'chiara_salt_2026')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function login(
  username: string,
  password: string
): Promise<{ user: User | null; error: string | null }> {
  try {
    const hashed = await hashPassword(password)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .single()

    if (error || !data) return { user: null, error: 'Invalid username or password' }

    const passwordMatch = data.password_hash === hashed || data.password_hash === password
    if (!passwordMatch) return { user: null, error: 'Invalid username or password' }

    // Auto-upgrade plain text to hashed
    if (data.password_hash === password) {
      await supabase.from('users').update({ password_hash: hashed }).eq('id', data.id)
    }

    localStorage.setItem('chiara_user', JSON.stringify(data))
    return { user: data, error: null }
  } catch {
    return { user: null, error: 'Something went wrong. Please try again.' }
  }
}

export async function createUser(
  username: string,
  password: string,
  role: 'admin' | 'cashier',
  fullName: string
): Promise<{ error: string | null }> {
  try {
    const hashed = await hashPassword(password)
    const { error } = await supabase.from('users').insert({
      username, password_hash: hashed, role, full_name: fullName || null,
    })
    if (error) return { error: 'Username already exists!' }
    return { error: null }
  } catch {
    return { error: 'Something went wrong.' }
  }
}

export async function changePassword(userId: string, newPassword: string): Promise<{ error: string | null }> {
  try {
    const hashed = await hashPassword(newPassword)
    const { error } = await supabase.from('users').update({ password_hash: hashed }).eq('id', userId)
    if (error) return { error: 'Error changing password' }
    return { error: null }
  } catch {
    return { error: 'Something went wrong.' }
  }
}

export function logout() {
  localStorage.removeItem('chiara_user')
  window.location.href = '/login'
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem('chiara_user')
  if (!stored) return null
  try { return JSON.parse(stored) as User } catch { return null }
}

export function isAuthenticated(): boolean { return getStoredUser() !== null }
export function isAdmin(): boolean { return getStoredUser()?.role === 'admin' }
