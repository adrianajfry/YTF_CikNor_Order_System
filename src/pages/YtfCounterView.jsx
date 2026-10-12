import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { getNextOrderNumber } from '../lib/nextOrderNumber.js'
import StaffHeader from '../components/StaffHeader.jsx'
import YtfLiveCamera from '../components/YtfLiveCamera.jsx'
import ToggleSwitch from '../components/ToggleSwitch.jsx'

export default function YtfCounterView() {
  const [stationId, setStationId] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState(null)

  useEffect(() => {
    async function findStation() {
      const { data } = await supabase.from('stations').select('id').eq('slug', 'ytf').single()
      if (data) setStationId(data.id)
    }
    findStation()
  }, [])

  async function loadMenu(id) {
    const { data } = await supabase
      .from('menu_items')
      .select('id, name, price, available, restocked, station_id, image_url')
      .eq('station_id', id)
      .order('name')
    setMenuItems(data ?? [])
  }

  useEffect(() => {
    if (!stationId) return
    loadMenu(stationId)
    const channel = supabase
      .channel('ytf-counter-menu')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `station_id=eq.${stationId}` },
        () => loadMenu(stationId)
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [stationId])

  useEffect(() => {
    const saved = localStorage.getItem('ytf_counter_draft_cart')
    if (saved) {
      try {
        setCart(JSON.parse(saved))
      } catch {
        localStorage.removeItem('ytf_counter_draft_cart')
      }
    }
  }, [])

  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('ytf_counter_draft_cart', JSON.stringify(cart))
    } else {
      localStorage.removeItem('ytf_counter_draft_cart')
    }
  }, [cart])

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

  function removeFromCart(item) {
    setCart((prev) =>
      prev
        .map((line) => (line.menu_item_id === item.id ? { ...line, quantity: line.quantity - 1 } : line))
        .filter((line) => line.quantity > 0)
    )
  }

  async function toggleAvailability(item) {
    const question = item.available
      ? `Mark "${item.name}" as UNAVAILABLE?`
      : `Switch "${item.name}" back to AVAILABLE?`
    if (!window.confirm(question)) return

    const fn = item.available ? 'ytf_counter_set_unavailable' : 'ytf_counter_set_available'
    const { error } = await supabase.rpc(fn, { p_item_id: item.id })
    if (error) {
      alert(`Could not update ${item.name}: ${error.message}`)
      return
    }
    loadMenu(stationId)
  }

  async function submitOrder() {
    if (cart.length === 0) return
    setSubmitting(true)

    const nextNumber = await getNextOrderNumber(supabase)
    const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({ order_number: nextNumber, total_amount: total })
      .select()
      .single()

    if (orderError) {
      console.error(orderError)
      alert(`Could not create the order: ${orderError.message}`)
      setSubmitting(false)
      return
    }

    const orderItems = cart.map((line) => ({
      order_id: order.id,
      menu_item_id: line.menu_item_id,
      station_id: line.station_id,
      quantity: line.quantity,
      unit_price: line.price,
    }))

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
    if (itemsError) {
      console.error(itemsError)
      alert(`Order #${nextNumber} was created, but the items failed to save: ${itemsError.message}`)
      setSubmitting(false)
      return
    }

    setLastOrderNumber(nextNumber)
    setCart([])
    setSubmitting(false)
  }

  return (
    <div className="view">
      <StaffHeader title="YTF counter" />
      <h1>YTF counter</h1>

      <YtfLiveCamera />

      {lastOrderNumber && (
        <div className="order-number-banner">
          Order #{lastOrderNumber} sent — tell the cashier this number if the customer also wants hot food or drinks.
        </div>
      )}

      <div className="menu-grid">
        {menuItems.map((item) => {
          const canToggle = item.available || item.restocked
          return (
            <div className="menu-card" key={item.id}>
              <div className={item.available ? '' : 'faded'}>
                {item.image_url && <img src={item.image_url} alt={item.name} className="menu-card-photo" />}
                <strong>{item.name}</strong>
                <div>RM {item.price.toFixed(2)}</div>
              </div>
              <div className="menu-card-actions">
                <button disabled={!item.available} onClick={() => addToCart(item)}>+</button>
                <button onClick={() => removeFromCart(item)}>-</button>
              </div>
              <div className={`availability-toggle ${canToggle ? '' : 'locked'}`}>
                <ToggleSwitch
                  checked={item.available}
                  disabled={!canToggle}
                  label={`${item.name} availability`}
                  onChange={() => toggleAvailability(item)}
                />
                <span>
                  {item.available
                    ? 'Available'
                    : item.restocked
                    ? 'Restocked — switch back on'
                    : 'Unavailable — waiting for kitchen top-up'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <h2>Bowl total</h2>
      <ul className="cart-list">
        {cart.map((line) => (
          <li key={line.menu_item_id}>
            <button onClick={() => removeFromCart({ id: line.menu_item_id })}>-</button>
            {line.quantity} x {line.name} — RM {(line.price * line.quantity).toFixed(2)}
            <button onClick={() => addToCart({ id: line.menu_item_id, name: line.name, price: line.price, station_id: line.station_id })}>+</button>
          </li>
        ))}
      </ul>
      <button onClick={() => setCart([])}>Clear order</button>
      <button className="btn-primary" disabled={submitting || cart.length === 0} onClick={submitOrder}>
        {submitting ? 'Sending…' : 'Send to cashier'}
      </button>
    </div>
  )
}