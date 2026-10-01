import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

// Wrap a page with this and it only renders for the matching role —
// anyone else (or anyone not logged in) is bounced to /login.
export default function ProtectedRoute({ allowedRole, children }) {
  const { session, role, loading } = useAuth()

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>
  if (!session || role !== allowedRole) return <Navigate to="/login" replace />
  return children
}
