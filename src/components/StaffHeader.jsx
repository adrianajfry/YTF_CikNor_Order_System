import { useAuth } from '../contexts/AuthContext.jsx'

export default function StaffHeader({ title }) {
  const { logout, role } = useAuth()

  function handleLogout() {
    if (window.confirm('Are you sure you want to log out?')) {
      logout()
    }
  }

  return (
    <div className="staff-header">
      <strong>{title}</strong>
      <span className="staff-role-tag">Logged in as: {role}</span>
      <button onClick={handleLogout}>Log out</button>
    </div>
  )
}