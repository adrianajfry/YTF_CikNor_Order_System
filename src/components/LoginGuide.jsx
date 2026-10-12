import { Link } from 'react-router-dom'

// Edit these passwords to match the ones you created the accounts with.
const ACCOUNTS = [
  { role: 'YTF counter', username: 'ytf_counter', password: 'ciknor_counter', what: 'Tally the bowl, send it to the cashier, mark YTF food unavailable.' },
  { role: 'Cashier', username: 'cashier', password: 'ciknor_cashier', what: 'Hot food and drinks, payment, receipt capture, order history.' },
  { role: 'YTF kitchen', username: 'ytf', password: 'ciknor_ytf', what: 'Mark YTF orders ready, confirm booth top-ups.' },
  { role: 'Hot food kitchen', username: 'hotfood', password: 'ciknor_food', what: 'Mark hot food orders ready, toggle hot food availability.' },
  { role: 'Beverage kitchen', username: 'beverage', password: 'ciknor_drink', what: 'Mark drink orders ready, toggle drink availability.' },
  { role: 'Pickup counter', username: 'pickup', password: 'ciknor_pickup', what: 'Hand over finished orders, flag overdue ones.' },
  { role: 'YTF camera (phone)', username: 'ytf_camera', password: 'ciknor_camera', what: 'Streams the YTF food booth to the YTF counter screen.' },
]

export default function LoginGuide() {
  return (
    <details className="login-guide">
      <summary>Demo guide: which account to use</summary>
      <p>This is a self-learning project, so these are practice accounts.</p>
      <ul>
        {ACCOUNTS.map((a) => (
          <li key={a.username}>
            <strong>{a.role}</strong>
            <div>Username: <code>{a.username}</code></div>
            <div>Password: <code>{a.password}</code></div>
            <div className="login-guide-what">{a.what}</div>
          </li>
        ))}
      </ul>
      <p>
        No login needed for: <Link to="/board">Status board</Link> and{' '}
        <Link to="/customer-display">Customer display</Link>.
      </p>
    </details>
  )
}