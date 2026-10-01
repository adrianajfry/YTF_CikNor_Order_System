import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { getNextOrderNumber } from '../lib/nextOrderNumber.js'
import StaffHeader from '../components/StaffHeader.jsx'

export default function CashierView() {
  const [lobbyOrders, setLobbyOrders] = useState([])
  const [heldDrafts, setHeldDrafts] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [activeMode, setActiveMode] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [pendingRequests, setPendingRequests] = useState(new Set())
  const [cart, setCart] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState(null)

  // Restore any held drafts and an in-progress draft on load (e.g. after a logout)
  useEffect(() => {
    try {
      const savedHeld = localStorage.getItem('cashier_held_drafts')
      if (savedHeld) setHeldDrafts(JSON.parse(savedHeld))
    } catch {
      localStorage.removeItem('cashier_held_drafts')
    }
    try {
      const savedActive = localStorage.getItem('cashier_active_draft')
      if (savedActive) {
        const draft = JSON.parse(savedActive)
        setSelectedOrder(draft.selectedOrder)
        setCart(draft.cart)
        setActiveMode(true)
      }
    } catch {
      localStorage.removeItem('cashier_active_draft')
    }
  }, [])

  // Keep the in-progress draft saved while it's active
  useEffect(() => {
    if (activeMode) {
      localStorage.setItem('cashier_active_draft', JSON.stringify({ selectedOrder, cart }))
    }
  }, [activeMode, selectedOrder, cart])

  useEffect(() => {
    localStorage.setItem('cashier_held_drafts', JSON.stringify(heldDrafts))
  }, [heldDrafts])

  useEffect(() => {
    async function loadMenu() {
      const { data } = await supabase
        .from('menu_items')
        .select('id, name, price, available, station_id, stations!inner(name, slug)')
        .in('stations.slug', ['beverage', 'hotfood'])
        .order('name')
      setMenuItems(data ?? [])
    }
    loadMenu()
  }, [])

  async function loadLobby() {
    const { data: station } = await supabase.from('stations').select('id').eq('slug', 'ytf').single()
    if (!station) return
    const { data } = await supabase
      .from('order_items')
      .select('order_id, orders(order_number, created_at, payment_status)')
      .eq('station_id', station.id)

    const waiting = new Map()
    for (const row of data ?? []) {
      const order = row.orders
      if (order && order.payment_status === 'unpaid') {
        waiting.set(row.order_id, { id: row.order_id, order_number: order.order_number, created_at: order.created_at })
      }
    }
    setLobbyOrders([...waiting.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
  }

  async function loadPendingRequests() {
    const { data } = await supabase.from('stock_check_requests').select('menu_item_id').is('resolved_at', null)
    setPendingRequests(new Set((data ?? []).map((r) => r.menu_item_id)))
  }

  useEffect(() => {
    loadLobby()
    loadPendingRequests()
    const channel = supabase
      .channel('cashier-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, loadLobby)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadLobby)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_check_requests' }, loadPendingRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        supabase
          .from('menu_items')
          .select('id, name, price, available, station_id, stations!inner(name, slug)')
          .in('stations.slug', ['beverage', 'hotfood'])
          .order('name')
          .then(({ data }) => setMenuItems(data ?? []))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  function pickOrder(order) {
    setSelectedOrder(order)
    setActiveMode(true)
  }

  function startNewOrder() {
    setSelectedOrder(null)
    setActiveMode(true)
  }

  function resumeDraft(draft) {
    setHeldDrafts((prev) => prev.filter((d) => d.id !== draft.id))
    setSelectedOrder(draft.selectedOrder)
    setCart(draft.cart)
    setActiveMode(true)
  }

  function backToLobby() {
    if (cart.length > 0 || selectedOrder) {
      const label = selectedOrder ? `#${selectedOrder.order_number}` : 'New order'
      setHeldDrafts((prev) => [...prev, { id: crypto.randomUUID(), label, selectedOrder, cart }])
    }
    localStorage.removeItem('cashier_active_draft')
    setCart([])
    setSelectedOrder(null)
    setActiveMode(false)
  }

  function discardDraft() {
    localStorage.removeItem('cashier_active_draft')
    setCart([])
    setSelectedOrder(null)
    setActiveMode(false)
  }

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((line) => line.menu_item_id === item.id)
      if (existing) {
        return prev.map((line) =>
          line.menu_item_id === item.id ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, station_id: item.station_id, quantity: 1 }]
    })
  }

  function changeQuantity(menuItemId, delta) {
    setCart((prev) =>
      prev
        .map((line) => (line.menu_item_id === menuItemId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    )
  }

  function removeLine(menuItemId) {
    setCart((prev) => prev.filter((line) => line.menu_item_id !== menuItemId))
  }

  async function askStation(item) {
    const { error } = await supabase.from('stock_check_requests').insert({
      menu_item_id: item.id,
      station_id: item.station_id,
    })
    if (error) {
      console.error(error)
      return
    }
    setPendingRequests((prev) => new Set(prev).add(item.id))
  }

  async function completeOrder() {
    setSubmitting(true)
    const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

    let orderId = selectedOrder?.id
    let orderNumber = selectedOrder?.order_number

    if (orderId) {
      if (cart.length > 0) {
        const { data: existingOrder, error: fetchError } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('id', orderId)
          .single()
        if (fetchError) {
          alert(`Could not load order #${orderNumber}: ${fetchError.message}`)
          setSubmitting(false)
          return
        }
        const { error: totalError } = await supabase
          .from('orders')
          .update({ total_amount: (existingOrder?.total_amount ?? 0) + total })
          .eq('id', orderId)
        if (totalError) {
          alert(`Could not update the total for #${orderNumber}: ${totalError.message}`)
          setSubmitting(false)
          return
        }
      }
    } else {
      orderNumber = await getNextOrderNumber(supabase)
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({ order_number: orderNumber, total_amount: total })
        .select()
        .single()
      if (orderError) {
        alert(`Could not create the order: ${orderError.message}`)
        setSubmitting(false)
        return
      }
      orderId = order.id
    }

    if (cart.length > 0) {
      const orderItems = cart.map((line) => ({
        order_id: orderId,
        menu_item_id: line.menu_item_id,
        station_id: line.station_id,
        quantity: line.quantity,
        unit_price: line.price,
      }))
      const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
      if (itemsError) {
        alert(`Order #${orderNumber}: the items failed to save: ${itemsError.message}`)
        setSubmitting(false)
        return
      }
    }

    const { error: payError } = await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId)
    if (payError) {
      alert(`Order #${orderNumber}: could not mark as paid: ${payError.message}`)
      setSubmitting(false)
      return
    }

    localStorage.removeItem('cashier_active_draft')
    await loadLobby()
    setLastOrderNumber(orderNumber)
    setCart([])
    setSelectedOrder(null)
    setActiveMode(false)
    setSubmitting(false)
  }

  function renderMenuCard(item) {
    const isPending = pendingRequests.has(item.id)
    return (
      <div className={`menu-card ${item.available ? '' : 'unavailable'}`} key={item.id}>
        <div>
          <strong>{item.name}</strong>
          <div>RM {item.price.toFixed(2)}</div>
        </div>
        <div className="menu-card-actions">
          <button disabled={!item.available} onClick={() => addToCart(item)}>Add</button>
          {!item.available && (
            isPending ? (
              <span className="pending-note">Waiting for kitchen…</span>
            ) : (
              <button onClick={() => askStation(item)}>Ask station</button>
            )
          )}
        </div>
      </div>
    )
  }

  const hotFoodItems = menuItems.filter((i) => i.stations?.slug === 'hotfood')
  const beverageItems = menuItems.filter((i) => i.stations?.slug === 'beverage')

  return (
    <div className="view">
      <StaffHeader title="Cashier" />
      <h1>Cashier</h1>

      {lastOrderNumber && <div className="order-number-banner">Order #{lastOrderNumber} paid.</div>}

      {!activeMode && (
        <>
          <h2>Waiting from YTF</h2>
          {lobbyOrders.length === 0 && <p className="empty-note">No orders waiting right now.</p>}
          <div className="lobby-list">
            {lobbyOrders.map((o) => (
              <button key={o.id} className="lobby-chip" onClick={() => pickOrder(o)}>
                #{o.order_number}
              </button>
            ))}
          </div>

          {heldDrafts.length > 0 && (
            <>
              <h2>Held orders</h2>
              <div className="lobby-list">
                {heldDrafts.map((draft) => (
                  <button key={draft.id} className="lobby-chip held" onClick={() => resumeDraft(draft)}>
                    {draft.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <button onClick={startNewOrder}>+ New order (no YTF)</button>
        </>
      )}

      {activeMode && (
        <>
          <p>{selectedOrder ? `Adding to order #${selectedOrder.order_number}` : 'New order'}</p>

          <h2>Hot food</h2>
          <div className="menu-grid">{hotFoodItems.map(renderMenuCard)}</div>

          <h2>Beverages</h2>
          <div className="menu-grid">{beverageItems.map(renderMenuCard)}</div>

          <h2>Current order</h2>
          {cart.length === 0 && <p>No hot food or drinks added.</p>}
          <ul className="cart-list">
            {cart.map((line) => (
              <li key={line.menu_item_id}>
                <button onClick={() => changeQuantity(line.menu_item_id, -1)}>-</button>
                {line.quantity} x {line.name} — RM {(line.price * line.quantity).toFixed(2)}
                <button onClick={() => changeQuantity(line.menu_item_id, 1)}>+</button>
                <button onClick={() => removeLine(line.menu_item_id)}>Remove</button>
              </li>
            ))}
          </ul>

          <button
            disabled={submitting || (!selectedOrder && cart.length === 0)}
            onClick={completeOrder}
          >
            {submitting ? 'Processing…' : 'Complete order & payment'}
          </button>
          <button onClick={backToLobby}>Back to lobby</button>
          <button onClick={discardDraft}>Discard</button>
        </>
      )}
    </div>
  )
}