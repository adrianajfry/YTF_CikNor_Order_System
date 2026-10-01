import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

const ROLE_TO_PATH = {
  ytf_counter: '/counter/ytf',
  cashier: '/counter/cashier',
  ytf: '/station/ytf',
  beverage: '/station/beverage',
  hotfood: '/station/hotfood',
  pickup: '/pickup',
}

export default function LoginView() {
  const { session, role, loading, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session && role && ROLE_TO_PATH[role]) {
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
      <img src="/logo.png" alt="Yong Cik Nor Tau Foo logo" className="login-logo" />
      <h1 className="login-restaurant-name">Yong Cik Nor Tau Foo AU3 Keramat</h1>
      <p className="login-address">
        Kelumpuk Camar Block C, AU 3, 54200 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur
        <br />
        Area: AU3 Keramat
      </p>
      <p className="login-hours">
        Daily: 2:00 PM – 12:00 AM
        <br />
        <span className="login-hours-note">(Fridays: opens slightly later at 2:30 PM)</span>
      </p>
      <h3>Staff login</h3>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button disabled={submitting} type="submit">
          {submitting ? 'Signing in…' : 'Log in'}
        </button>
        {error && <p className="login-error">{error}</p>}
      </form>
    </div>
  )
}
