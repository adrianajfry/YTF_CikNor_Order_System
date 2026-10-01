import { useAuth } from '../contexts/AuthContext.jsx'

export default function StaffHeader({ title }) {
  const { logout, role } = useAuth()
  return (
    <div className="staff-header">
      <strong>{title}</strong>
      <span className="staff-role-tag">Logged in as: {role}</span>
      <button onClick={logout}>Log out</button>
    </div>
  )
}