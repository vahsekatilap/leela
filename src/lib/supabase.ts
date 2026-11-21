import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const backendConfigured = Boolean(url && key)
export const SUPABASE_URL = url ?? ''
export const SUPABASE_KEY = key ?? ''

export const supabase = createClient<Database>(url || 'http://localhost:54321', key || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'leela-auth' },
  realtime: { params: { eventsPerSecond: 20 } },
})

export function isNetworkError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  const m = (error.message ?? '').toLowerCase()
  const code = String(error.code ?? '')
  return (
    // The server busy or briefly down: worth trying again rather than giving up.
    /^5\d\d$/.test(code) ||
    ['PGRST000', 'PGRST001', 'PGRST002', '57014', '57P01', '08006', '08001'].includes(code) ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('gateway') ||
    m.includes('temporarily unavailable') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('network request failed') ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  )
}
