import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { getNextOrderNumber } from '../lib/nextOrderNumber.js'
import StaffHeader from '../components/StaffHeader.jsx'
import CashierReceiptViewer from '../components/CashierReceiptViewer.jsx'

export default function CashierView() {
  const [lobbyOrders, setLobbyOrders] = useState([])
  const [heldDrafts, setHeldDrafts] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [activeMode, setActiveMode] = useState(false)
  const [paymentStage, setPaymentStage] = useState('building')
  const [menuItems, setMenuItems] = useState([])
  const [pendingRequests, setPendingRequests] = useState(new Set())
  const [cart, setCart] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState(null)
  const [checkoutSession, setCheckoutSession] = useState(null)
  const [customerCamLive, setCustomerCamLive] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captureNote, setCaptureNote] = useState('')

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

  useEffect(() => {
    if (activeMode && paymentStage === 'building') {
      localStorage.setItem('cashier_active_draft', JSON.stringify({ selectedOrder, cart }))
    }
  }, [activeMode, paymentStage, selectedOrder, cart])

  useEffect(() => {
    localStorage.setItem('cashier_held_drafts', JSON.stringify(heldDrafts))
  }, [heldDrafts])

  // Receipt photos expire after 3 days. Deleting via the Storage API (not SQL) removes the real files.
  useEffect(() => {
    async function cleanupOldReceipts() {
      const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000
      const { data, error } = await supabase.storage
        .from('payment-receipts')
        .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } })
      if (error || !data) return
      const expired = data
        .filter((file) => file.created_at && new Date(file.created_at).getTime() < cutoff)
        .map((file) => file.name)
      if (expired.length > 0) await supabase.storage.from('payment-receipts').remove(expired)
    }
    cleanupOldReceipts()
  }, [])

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

  async function loadCheckoutSession() {
    const { data } = await supabase.from('checkout_sessions').select('*').eq('id', 'current').single()
    setCheckoutSession(data)
  }

  useEffect(() => {
    loadLobby()
    loadPendingRequests()
    loadCheckoutSession()
    const channel = supabase
      .channel('cashier-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, loadLobby)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadLobby)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_check_requests' }, loadPendingRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkout_sessions', filter: 'id=eq.current' }, loadCheckoutSession)
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

  // Once the customer display's photo lands, reset the command
  useEffect(() => {
    if (checkoutSession?.camera_command?.startsWith('capture') && checkoutSession?.receipt_url) {
      supabase.from('checkout_sessions').update({ camera_command: 'idle' }).eq('id', 'current')
    }
  }, [checkoutSession?.camera_command, checkoutSession?.receipt_url])

  // A photo arriving means the capture succeeded
  useEffect(() => {
    if (checkoutSession?.receipt_url) setCapturing(false)
  }, [checkoutSession?.receipt_url])

  // If the photo never arrives, tell the cashier instead of waiting forever
  useEffect(() => {
    if (!capturing) return
    const timer = setTimeout(() => {
      setCapturing(false)
      setCaptureNote('The photo did not arrive. Please try again.')
    }, 15000)
    return () => clearTimeout(timer)
  }, [capturing])

  function pickOrder(order) {
    setSelectedOrder(order)
    setActiveMode(true)
    setPaymentStage('building')
  }

  function startNewOrder() {
    setSelectedOrder(null)
    setActiveMode(true)
    setPaymentStage('building')
  }

  function resumeDraft(draft) {
    setHeldDrafts((prev) => prev.filter((d) => d.id !== draft.id))
    setSelectedOrder(draft.selectedOrder)
    setCart(draft.cart)
    setActiveMode(true)
    setPaymentStage('building')
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

  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const orderLabel = selectedOrder ? `Order #${selectedOrder.order_number}` : 'New order'

  async function proceedToPayment() {
    if (!selectedOrder && cart.length === 0) return
    const { error } = await supabase
      .from('checkout_sessions')
      .update({
        order_label: orderLabel,
        items: cart.map((l) => ({ name: l.name, quantity: l.quantity, price: l.price })),
        total,
        status: 'awaiting_payment',
        receipt_url: null,
        camera_command: 'idle',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'current')
    if (error) {
      alert(`Could not start payment: ${error.message}`)
      return
    }
    setCapturing(false)
    setCaptureNote('')
    setPaymentStage('awaiting_payment')
  }

  async function cancelPayment() {
    await supabase
      .from('checkout_sessions')
      .update({ status: 'idle', receipt_url: null, camera_command: 'idle' })
      .eq('id', 'current')
    setCapturing(false)
    setCaptureNote('')
    setPaymentStage('building')
  }

  async function takePhoto() {
    setCapturing(true)
    setCaptureNote('')
    const { error } = await supabase
      .from('checkout_sessions')
      .update({ camera_command: `capture-${Date.now()}` })
      .eq('id', 'current')
    if (error) {
      setCapturing(false)
      setCaptureNote(`Could not send the capture request: ${error.message}`)
    }
  }

  function retakePhoto() {
    supabase.from('checkout_sessions').update({ receipt_url: null, camera_command: 'idle' }).eq('id', 'current')
  }

  async function submitOrder() {
    setSubmitting(true)

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

    const { error: payError } = await supabase
      .from('orders')
      .update({ payment_status: 'paid', receipt_url: checkoutSession?.receipt_url ?? null })
      .eq('id', orderId)
    if (payError) {
      alert(`Order #${orderNumber}: could not mark as paid: ${payError.message}`)
      setSubmitting(false)
      return
    }

    await supabase
      .from('checkout_sessions')
      .update({ status: 'idle', receipt_url: null, camera_command: 'idle' })
      .eq('id', 'current')
    localStorage.removeItem('cashier_active_draft')
    await loadLobby()
    setLastOrderNumber(orderNumber)
    setCart([])
    setSelectedOrder(null)
    setActiveMode(false)
    setPaymentStage('building')
    setCapturing(false)
    setCaptureNote('')
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
  const receiptUrl = checkoutSession?.receipt_url ?? null
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    `DEMO PAYMENT - ${orderLabel} - Total RM${total.toFixed(2)}`
  )}`

  return (
    <div className="view">
      <StaffHeader title="Cashier" />
      <h1>Cashier</h1>
      <Link to="/counter/cashier/history" className="history-link">View order history →</Link>

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

      {activeMode && paymentStage === 'building' && (
        <>
          <p>{orderLabel}</p>

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
            className="btn-primary"
            disabled={!selectedOrder && cart.length === 0}
            onClick={proceedToPayment}
          >
            Proceed with payment
          </button>
          <button onClick={backToLobby}>Back to lobby</button>
          <button className="btn-danger" onClick={discardDraft}>Discard</button>
        </>
      )}

      {activeMode && paymentStage === 'awaiting_payment' && (
        <div className="payment-review">
          <div className="payment-summary">
            <h2>{orderLabel}</h2>
            <ul>
              {cart.map((line) => (
                <li key={line.menu_item_id}>
                  {line.quantity} x {line.name} — RM {(line.price * line.quantity).toFixed(2)}
                </li>
              ))}
            </ul>
            <div className="payment-total">Total: RM {total.toFixed(2)}</div>
          </div>

          <div className="payment-qr">
            <div className="qr-overlay-wrap">
              <img src={qrUrl} alt="Scan to pay" />

              {receiptUrl && (
                <div className="receipt-popup">
                  <p>Receipt captured ✓</p>
                  <img src={receiptUrl} alt="Customer's receipt" />
                  <button onClick={retakePhoto}>Retake</button>
                </div>
              )}

              <CashierReceiptViewer onLiveChange={setCustomerCamLive} hidden={!!receiptUrl} />
            </div>

            {!receiptUrl && (
              <>
                {customerCamLive ? (
                  <button className="btn-primary" disabled={capturing} onClick={takePhoto}>
                    {capturing ? 'Capturing…' : 'Capture receipt'}
                  </button>
                ) : (
                  <p>Waiting for the customer to tap "Show us your receipt"…</p>
                )}
                {captureNote && <p className="login-error">{captureNote}</p>}
              </>
            )}
            {receiptUrl && (
              <p className="camera-status-note">
                To retake, ask the customer to tap "Show us your receipt" again.
              </p>
            )}
          </div>

          <div className="payment-actions">
            <button
              className="btn-primary"
              disabled={submitting}
              onClick={() => {
                if (window.confirm('Customer made a payment?')) submitOrder()
              }}
            >
              {submitting ? 'Sending…' : 'Submit order'}
            </button>
            <button onClick={cancelPayment}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}