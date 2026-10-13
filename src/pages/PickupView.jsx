import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'

const STATION_ORDER = ['ytf', 'hotfood', 'beverage']
const STATION_LABEL = { ytf: 'YTF', hotfood: 'Hot food', beverage: 'Drinks' }

function itemStatusLabel(status) {
  if (status === 'picked_up') return 'picked up'
  if (status === 'ready') return 'ready'
  if (status === 'cancelled') return 'cancelled'
  return 'preparing'
}

export default function PickupView() {
  const [orders, setOrders] = useState([])
  const [doneOrders, setDoneOrders] = useState([])
  const [selected, setSelected] = useState(null)
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
      .select('id, order_number')
      .eq('board_status', 'done')
      .neq('payment_status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(30)
    setDoneOrders(data ?? [])
  }

  async function refreshSelected(orderId) {
    if (!orderId) return
    const [orderRes, itemsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, board_status, payment_status, recalled_at, created_at, total_amount, cancel_reason')
        .eq('id', orderId)
        .single(),
      supabase
        .from('order_items')
        .select('id, quantity, status, station_id, stations(name, slug), menu_items(name)')
        .eq('order_id', orderId),
    ])
    if (selectedIdRef.current !== orderId) return // the staff member already picked another order
    if (orderRes.data) setSelected(orderRes.data)
    setItems(itemsRes.data ?? [])
  }

  useEffect(() => {
    loadBoard()
    loadDone()
    const channel = supabase
      .channel('pickup-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadBoard()
        loadDone()
        if (selectedIdRef.current) refreshSelected(selectedIdRef.current)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        if (selectedIdRef.current) refreshSelected(selectedIdRef.current)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  function selectOrder(order) {
    if (selectedIdRef.current !== order.id) {
      setItems([])
      setSelected({ ...order })
    }
    selectedIdRef.current = order.id
    setMessage('')
    refreshSelected(order.id)
  }

  async function searchByNumber() {
    setMessage('')
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number')
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

  async function setItemsStatus(ids, status) {
    if (ids.length === 0) return
    const { error } = await supabase
      .from('order_items')
      .update({ status, status_updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) {
      alert(`Could not update the order: ${error.message}`)
      return
    }
    await refreshSelected(selectedIdRef.current)
    loadBoard()
    loadDone()
  }

  async function toggleStation(group) {
    const allPicked = group.items.every((i) => i.status === 'picked_up')
    if (allPicked) {
      if (!window.confirm(`Mark the ${group.label} items as NOT picked up? They will go back to Ready.`)) return
      await setItemsStatus(group.items.map((i) => i.id), 'ready')
    } else {
      await setItemsStatus(group.items.filter((i) => i.status === 'ready').map((i) => i.id), 'picked_up')
    }
  }

  async function toggleOrder(liveItems) {
    const allPicked = liveItems.every((i) => i.status === 'picked_up')
    if (allPicked) {
      if (!window.confirm(`Mark order #${selected.order_number} as NOT picked up? Everything goes back to Ready.`)) return
      await setItemsStatus(liveItems.map((i) => i.id), 'ready')
    } else {
      await setItemsStatus(liveItems.filter((i) => i.status === 'ready').map((i) => i.id), 'picked_up')
    }
  }

  async function recallOrder() {
    if (!selected) return
    const { error } = await supabase
      .from('orders')
      .update({ recalled_at: new Date().toISOString() })
      .eq('id', selected.id)
    if (error) {
      alert(`Could not flag the order: ${error.message}`)
      return
    }
    setMessage(`Order #${selected.order_number} flagged on the board.`)
    refreshSelected(selected.id)
    loadBoard()
  }

  const preparing = orders.filter((o) => o.board_status === 'preparing')
  const ready = orders.filter((o) => o.board_status === 'ready')

  const isCancelled = selected?.payment_status === 'cancelled'
  const liveItems = items.filter((i) => i.status !== 'cancelled')
  const orderAllPicked = liveItems.length > 0 && liveItems.every((i) => i.status === 'picked_up')
  const orderAnyCooking = liveItems.some((i) => i.status === 'queued' || i.status === 'cooking')

  const bySlug = {}
  for (const item of liveItems) {
    const slug = item.stations?.slug ?? 'other'
    if (!bySlug[slug]) bySlug[slug] = []
    bySlug[slug].push(item)
  }
  const slugs = [...STATION_ORDER, ...Object.keys(bySlug).filter((s) => !STATION_ORDER.includes(s))]
  const stationGroups = slugs
    .filter((slug) => bySlug[slug])
    .map((slug) => ({ slug, label: STATION_LABEL[slug] ?? slug, items: bySlug[slug] }))

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
        <div className="ticket-group pickup-detail">
          {isCancelled ? (
            <>
              <h2>
                Order #{selected.order_number}
                <span className="cancelled-tag">Cancelled</span>
              </h2>
              {selected.cancel_reason && <p className="availability-state">Reason: {selected.cancel_reason}</p>}
              <ul className="ticket-list">
                {items.map((item) => (
                  <li key={item.id} className="ticket ticket-cancelled">
                    {item.menu_items?.name} x{item.quantity}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <label className="order-ready-check">
                <input
                  type="checkbox"
                  checked={orderAllPicked}
                  disabled={orderAnyCooking || liveItems.length === 0}
                  onChange={() => toggleOrder(liveItems)}
                />
                Order #{selected.order_number}
                {orderAllPicked && <span className="availability-state ok"> · Completed</span>}
              </label>

              {orderAllPicked && selected.created_at && (
                <p className="availability-state">
                  Ordered {new Date(selected.created_at).toLocaleString()}
                  {selected.total_amount != null && ` · Total RM ${Number(selected.total_amount).toFixed(2)}`}
                </p>
              )}
              {orderAnyCooking && (
                <p className="availability-state">
                  Some food is still being prepared. Each station can be ticked once its food is ready.
                </p>
              )}

              {stationGroups.map((group) => {
                const allPicked = group.items.every((i) => i.status === 'picked_up')
                const stillCooking = group.items.some((i) => i.status === 'queued' || i.status === 'cooking')
                return (
                  <div key={group.slug} className="pickup-station-group">
                    <label className="station-ready-check">
                      <input
                        type="checkbox"
                        checked={allPicked}
                        disabled={stillCooking && !allPicked}
                        onChange={() => toggleStation(group)}
                      />
                      {group.label}:
                    </label>
                    <ul className="ticket-list">
                      {group.items.map((item) => (
                        <li key={item.id} className="ticket">
                          <span>
                            {item.menu_items?.name} x{item.quantity}
                          </span>
                          <span className="item-status-tag">{itemStatusLabel(item.status)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}

              {selected.board_status === 'preparing' &&
                (selected.recalled_at ? (
                  <p className="availability-state ok">Flagged on the board ✓</p>
                ) : (
                  <button className="btn-danger" onClick={recallOrder}>
                    Flag as waiting too long
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}