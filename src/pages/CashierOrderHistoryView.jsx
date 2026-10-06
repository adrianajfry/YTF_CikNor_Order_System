import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'

export default function CashierOrderHistoryView() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  async function loadHistory() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, created_at, receipt_url')
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: false })
      .limit(100)
    setOrders(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadHistory()
    const channel = supabase
      .channel('cashier-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadHistory)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  return (
    <div className="view">
      <StaffHeader title="Cashier — history" />
      <h1>Order history</h1>
      <Link to="/counter/cashier" className="history-link">← Back to cashier</Link>

      {loading ? (
        <div className="ticket-groups">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : orders.length === 0 ? (
        <p className="empty-note">No paid orders yet.</p>
      ) : (
        <ul className="cart-list">
          {orders.map((order) => (
            <li
              key={order.id}
              className="history-row"
              onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
            >
              <div>
                Order #{order.order_number} — RM {Number(order.total_amount).toFixed(2)}
                <span className="history-date"> · {new Date(order.created_at).toLocaleString()}</span>
                {order.receipt_url && <span className="history-receipt-tag"> 📷 receipt</span>}
              </div>
              {expandedId === order.id && (
                <div className="history-receipt-expanded">
                  {order.receipt_url ? (
                    <img src={order.receipt_url} alt={`Receipt for order ${order.order_number}`} />
                  ) : (
                    <p className="empty-note">No receipt was captured for this order.</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}