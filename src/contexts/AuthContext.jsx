import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const STAFF_EMAIL_DOMAIN = 'ycntf.internal' // must match scripts/create-staff-accounts.mjs

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadRole(data.session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) loadRole(newSession.user.id)
      else {
        setRole(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadRole(userId) {
    const { data } = await supabase.from('staff').select('role').eq('id', userId).single()
    setRole(data?.role ?? null)
    setLoading(false)
  }

  async function login(username, password) {
    const email = `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
