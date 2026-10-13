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
      .select(
        'id, order_number, total_amount, created_at, receipt_url, payment_method, cash_received, payment_status, cancelled_at, cancel_reason, refund_amount, order_items(status)'
      )
      // paid orders, plus cancelled orders that had already been paid (refund due)
      .or('payment_status.eq.paid,and(payment_status.eq.cancelled,refund_amount.gt.0)')
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, loadHistory)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function cancelPaidOrder(order) {
    const amount = Number(order.total_amount).toFixed(2)
    const refundText =
      order.payment_method === 'cash'
        ? `Give RM ${amount} back to the customer in cash.`
        : `Send RM ${amount} back to the customer (this demo does not move real money).`

    const reason = window.prompt(
      `Cancel order #${order.order_number}?\nThe kitchens will be told to stop making it.\n\n${refundText}\n\nReason (optional):`,
      ''
    )
    if (reason === null) return // pressed Cancel: keep the order

    const { error } = await supabase.rpc('cashier_cancel_order', {
      p_order_id: order.id,
      p_reason: reason,
    })
    if (error) {
      alert(`Could not cancel order #${order.order_number}: ${error.message}`)
      return
    }
    loadHistory()
  }

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
          {orders.map((order) => {
            const cancelled = order.payment_status === 'cancelled'
            const collected = (order.order_items ?? []).some((i) => i.status === 'picked_up')
            return (
              <li
                key={order.id}
                className={`history-row ${cancelled ? 'history-row-cancelled' : ''}`}
                onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
              >
                <div className="history-row-top">
                  <div>
                    Order #{order.order_number} — RM {Number(order.total_amount).toFixed(2)}
                    <span className="history-date"> · {new Date(order.created_at).toLocaleString()}</span>
                    {order.payment_method && (
                      <span className="history-method-tag">
                        {order.payment_method === 'cash' ? '💵 cash' : '📱 QR'}
                      </span>
                    )}
                    {order.receipt_url && <span className="history-receipt-tag"> 📷 receipt</span>}
                    {cancelled && <span className="history-cancelled-tag">✕ cancelled</span>}
                  </div>

                  {!cancelled &&
                    (collected ? (
                      <span className="availability-state">Items collected — can't cancel</span>
                    ) : (
                      <button
                        className="btn-danger btn-mini"
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelPaidOrder(order)
                        }}
                      >
                        Cancel order
                      </button>
                    ))}
                </div>

                {expandedId === order.id && (
                  <div className="history-receipt-expanded">
                    {cancelled ? (
                      <p>
                        Cancelled {order.cancelled_at ? new Date(order.cancelled_at).toLocaleString() : ''}.
                        {order.cancel_reason ? ` Reason: ${order.cancel_reason}.` : ''}{' '}
                        Refund due: RM {Number(order.refund_amount).toFixed(2)} (
                        {order.payment_method === 'cash' ? 'cash' : 'QR payment'}).
                      </p>
                    ) : order.payment_method === 'cash' ? (
                      <p>
                        Cash received: RM {Number(order.cash_received ?? 0).toFixed(2)} · Change given: RM{' '}
                        {Math.max(0, Number(order.cash_received ?? 0) - Number(order.total_amount)).toFixed(2)}
                      </p>
                    ) : order.receipt_url ? (
                      <img src={order.receipt_url} alt={`Receipt for order ${order.order_number}`} />
                    ) : (
                      <p className="empty-note">No receipt was captured for this order.</p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}