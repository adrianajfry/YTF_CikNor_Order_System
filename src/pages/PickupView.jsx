import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'

export default function PickupView() {
  const [orders, setOrders] = useState([])
  const [selected, setSelected] = useState(null) // { id, order_number }
  const [items, setItems] = useState([])
  const [searchNumber, setSearchNumber] = useState('')
  const [message, setMessage] = useState('')

  async function loadBoard() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, board_status, recalled_at')
      .neq('board_status', 'done')
      .order('recalled_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setOrders(data ?? [])
  }

  async function loadItems(orderId) {
    const { data } = await supabase
      .from('order_items')
      .select('id, quantity, status, menu_items(name)')
      .eq('order_id', orderId)
    setItems(data ?? [])
  }

  useEffect(() => {
    loadBoard()
    const channel = supabase
      .channel('pickup-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadBoard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        if (selected) loadItems(selected.id)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  function selectOrder(order) {
    setSelected(order)
    setMessage('')
    loadItems(order.id)
  }

  async function searchByNumber() {
    setMessage('')
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('order_number', searchNumber)
      .neq('board_status', 'done')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!order) {
      setMessage('No active order with that number.')
      setItems([])
      setSelected(null)
      return
    }
    selectOrder(order)
  }

  async function markPickedUp(item) {
    await supabase
      .from('order_items')
      .update({ status: 'picked_up', status_updated_at: new Date().toISOString() })
      .eq('id', item.id)

  async function recallOrder() {
    if (!selected) return
    await supabase.from('orders').update({ recalled_at: new Date().toISOString() }).eq('id', selected.id)
    setMessage(`Order #${selected.order_number} flagged on the board.`)
  }

  const preparing = orders.filter((o) => o.board_status === 'preparing')
  const ready = orders.filter((o) => o.board_status === 'ready')

  return (
    <div className="view">
      <StaffHeader title="Pickup counter" />
      <h1>Pickup counter</h1>

      <div className="pickup-board">
        <div>
          <h2>Preparing</h2>
          <div className="lobby-list">
            {preparing.length === 0 && <p className="empty-note">Nothing preparing right now.</p>}
            {preparing.map((o) => (
              <button
                key={o.id}
                className={`board-chip ${o.recalled_at ? 'recalled' : ''}`}
                onClick={() => selectOrder(o)}
              >
                {o.order_number}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2>Ready for pickup</h2>
          <div className="lobby-list">
            {ready.length === 0 && <p className="empty-note">Nothing ready right now.</p>}
            {ready.map((o) => (
              <button
                key={o.id}
                className={`board-chip ready ${o.recalled_at ? 'recalled' : ''}`}
                onClick={() => selectOrder(o)}
              >
                {o.order_number}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h2>Or type an order number</h2>
      <div className="pickup-lookup">
        <input value={searchNumber} onChange={(e) => setSearchNumber(e.target.value)} placeholder="Order number" />
        <button onClick={searchByNumber}>Look up</button>
      </div>

      {message && <p>{message}</p>}

      {selected && (
        <>
          <h2>Order #{selected.order_number}</h2>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {item.quantity} x {item.menu_items?.name} — {item.status}
                {item.status === 'ready' && <button onClick={() => markPickedUp(item)}>Mark picked up</button>}
              </li>
            ))}
          </ul>
          <button onClick={recallOrder}>Flag as waiting too long</button>
        </>
      )}
    </div>
  )
}
}