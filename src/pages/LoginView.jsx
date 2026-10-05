import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'

const ROLE_TO_PATH = {
  ytf_counter: '/counter/ytf',
  cashier: '/counter/cashier',
  ytf: '/station/ytf',
  beverage: '/station/beverage',
  hotfood: '/station/hotfood',
  pickup: '/pickup',
  ytf_camera: '/camera/ytf',
}

export default function LoginView() {
  const { session, role, loading, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [justLoggedIn, setJustLoggedIn] = useState(false)
  const [readyToRedirect, setReadyToRedirect] = useState(false)

  useEffect(() => {
    if (!loading && session && role && ROLE_TO_PATH[role] && !readyToRedirect) {
      setJustLoggedIn(true)
      const timer = setTimeout(() => setReadyToRedirect(true), 500)
      return () => clearTimeout(timer)
    }
  }, [loading, session, role, readyToRedirect])

  if (readyToRedirect && role && ROLE_TO_PATH[role]) {
    return <Navigate to={ROLE_TO_PATH[role]} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const loginError = await login(username, password)
    if (loginError) setError('Wrong username or password.')
    setSubmitting(false)
  }

  return (
    <div className="view login-view">
      <AnimatePresence mode="wait">
        {justLoggedIn ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="login-success"
          >
            <div className="login-success-check">✓</div>
            <p>Logged in — loading your page…</p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <img src="/logo.png" alt="Yong Cik Nor Tau Foo" className="login-logo" />
            <h1>Yong Cik Nor Tau Foo</h1>
            <p className="login-subtitle">Kelumpuk Camar Block C, AU 3, 54200 Kuala Lumpur</p>
            <p className="login-subtitle">Setiap Hari: 2:00 PM – 12:00 AM, Hari Jumaat: Buka bermula jam 2:30 PM</p>
            <h3>Staff login</h3>
            <form onSubmit={handleSubmit}>
              <input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <button disabled={submitting} type="submit">
                {submitting ? 'Signing in…' : 'Log in'}
              </button>
              {error && <p className="login-error">{error}</p>}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}