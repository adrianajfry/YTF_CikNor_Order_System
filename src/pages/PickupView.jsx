import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'

export default function PickupView() {
  const [orders, setOrders] = useState([])
  const [doneOrders, setDoneOrders] = useState([])
  const [selected, setSelected] = useState(null) // { id, order_number, board_status, ... }
  const [items, setItems] = useState([])
  const [searchNumber, setSearchNumber] = useState('')
  const [message, setMessage] = useState('')
  const selectedIdRef = useRef(null)

  async function loadBoard() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, board_status, recalled_at')
      .neq('board_status', 'done')
      .order('recalled_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setOrders(data ?? [])
  }

  async function loadDone() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, board_status, created_at, total_amount')
      .eq('board_status', 'done')
      .order('created_at', { ascending: false })
      .limit(30)
    setDoneOrders(data ?? [])
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
    loadDone()
    const channel = supabase
      .channel('pickup-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadBoard()
        loadDone()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        if (selectedIdRef.current) loadItems(selectedIdRef.current)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  function selectOrder(order) {
    setSelected(order)
    selectedIdRef.current = order.id
    setMessage('')
    loadItems(order.id)
  }

  async function searchByNumber() {
    setMessage('')
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, board_status, created_at, total_amount')
      .eq('order_number', searchNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!order) {
      setMessage('No order with that number.')
      setItems([])
      setSelected(null)
      selectedIdRef.current = null
      return
    }
    selectOrder(order)
  }

  async function markPickedUp(item) {
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'picked_up', status_updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (error) {
      alert(`Could not mark as picked up: ${error.message}`)
      return
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'picked_up' } : i)))
    loadBoard()
    loadDone()
  }

  async function recallOrder() {
    if (!selected) return
    await supabase.from('orders').update({ recalled_at: new Date().toISOString() }).eq('id', selected.id)
    setMessage(`Order #${selected.order_number} flagged on the board.`)
  }

  const preparing = orders.filter((o) => o.board_status === 'preparing')
  const ready = orders.filter((o) => o.board_status === 'ready')
  const selectedIsDone = selected?.board_status === 'done'

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
        <div>
          <h2>Done</h2>
          <div className="lobby-list">
            {doneOrders.length === 0 && <p className="empty-note">No completed orders yet.</p>}
            {doneOrders.map((o) => (
              <button key={o.id} className="board-chip done" onClick={() => selectOrder(o)}>
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
          <h2>
            Order #{selected.order_number}
            {selectedIsDone && <span className="availability-state ok"> · Completed</span>}
          </h2>
          {selectedIsDone && selected.created_at && (
            <p className="availability-state">
              Ordered {new Date(selected.created_at).toLocaleString()}
              {selected.total_amount != null && ` · Total RM ${Number(selected.total_amount).toFixed(2)}`}
            </p>
          )}
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {item.quantity} x {item.menu_items?.name} — {item.status === 'picked_up' ? 'picked up' : item.status}
                {item.status === 'ready' && (
                <button className="btn-inline" onClick={() => markPickedUp(item)}>Mark picked up</button>
              )}
              </li>
            ))}
          </ul>
          {!selectedIsDone && <button onClick={recallOrder}>Flag as waiting too long</button>}
        </>
      )}
    </div>
  )
}