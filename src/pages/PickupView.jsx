import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'

const STATION_ORDER = ['ytf', 'hotfood', 'beverage']
const STATION_LABEL = { ytf: 'YTF', hotfood: 'Hot food', beverage: 'Drink' }

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

  async function handOverReady(readyItems) {
    if (readyItems.length === 0) return
    if (!window.confirm(`Hand over the ready items of order #${selected.order_number} to the customer?`)) return
    await setItemsStatus(readyItems.map((i) => i.id), 'picked_up')
  }

  async function undoHandover(pickedItems) {
    if (!window.confirm(`Put the collected items of order #${selected.order_number} back to Ready?`)) return
    await setItemsStatus(pickedItems.map((i) => i.id), 'ready')
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
  const readyItems = liveItems.filter((i) => i.status === 'ready')
  const pickedItems = liveItems.filter((i) => i.status === 'picked_up')
  const anyCooking = liveItems.some((i) => i.status === 'queued' || i.status === 'cooking')
  const allPicked = liveItems.length > 0 && pickedItems.length === liveItems.length

  let stateLabel = 'Preparing'
  let stateClass = ''
  if (allPicked) {
    stateLabel = 'Completed'
    stateClass = 'completed'
  } else if (readyItems.length > 0 && anyCooking) {
    stateLabel = 'Partly ready'
    stateClass = 'partial'
  } else if (readyItems.length > 0) {
    stateLabel = 'Ready for pickup'
    stateClass = 'ready'
  }

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
              <div className="pickup-order-header">
                <h2>Order #{selected.order_number}</h2>
                <span className="cancelled-tag">Cancelled</span>
              </div>
              {selected.cancel_reason && <p className="availability-state">Reason: {selected.cancel_reason}</p>}
              <ul className="pickup-item-list">
                {items.map((item) => (
                  <li key={item.id} className="pickup-item pickup-item-cancelled">
                    {item.menu_items?.name} x{item.quantity}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="pickup-order-header">
                <h2>Order #{selected.order_number}</h2>
                <span className={`order-state-tag ${stateClass}`}>{stateLabel}</span>
              </div>

              {allPicked && selected.created_at && (
                <p className="availability-state">
                  Ordered {new Date(selected.created_at).toLocaleString()}
                  {selected.total_amount != null && ` · Total RM ${Number(selected.total_amount).toFixed(2)}`}
                </p>
              )}

              {stationGroups.map((group) => {
                const everyCollected = group.items.every((i) => i.status === 'picked_up')
                const everyReady = group.items.every((i) => i.status === 'ready' || i.status === 'picked_up')
                return (
                  <div key={group.slug}>
                    <div className="pickup-station-title">
                      {group.label}:
                      {everyCollected ? (
                        <span className="station-state-tag">collected</span>
                      ) : everyReady ? (
                        <span className="station-state-tag ok">ready ✓</span>
                      ) : (
                        <span className="station-state-tag">preparing…</span>
                      )}
                    </div>
                    <ul className="pickup-item-list">
                      {group.items.map((item) => (
                        <li key={item.id} className={`pickup-item pickup-item-${item.status}`}>
                          {item.menu_items?.name} x{item.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}

              <div className="pickup-actions">
                {readyItems.length > 0 && (
                  <button className="btn-primary" onClick={() => handOverReady(readyItems)}>
                    Hand over ready items
                  </button>
                )}
                {pickedItems.length > 0 && (
                  <button className="btn-separated" onClick={() => undoHandover(pickedItems)}>
                    Undo handover
                  </button>
                )}
                {selected.board_status === 'preparing' &&
                  !allPicked &&
                  (selected.recalled_at ? (
                    <span className="availability-state ok">Flagged on the board ✓</span>
                  ) : (
                    <button className="btn-danger" onClick={recallOrder}>
                      Flag as waiting too long
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}