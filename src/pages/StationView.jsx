import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'
import ToggleSwitch from '../components/ToggleSwitch.jsx'
import { SLUG_TO_STATION_NAME } from '../lib/stationNames.js'

export default function StationView({ stationSlug: stationSlugProp }) {
  const params = useParams()
  const stationSlug = stationSlugProp ?? params.stationSlug
  const stationName = SLUG_TO_STATION_NAME[stationSlug] ?? stationSlug
  const isYtf = stationSlug === 'ytf'
  const [stationId, setStationId] = useState(null)
  const [items, setItems] = useState([])
  const [requests, setRequests] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: station } = await supabase
        .from('stations')
        .select('id')
        .eq('name', stationName)
        .single()
      if (!station) return
      setStationId(station.id)
    }
    init()
  }, [stationName])

  async function loadItems(id) {
    if (!id) return
    const { data } = await supabase
      .from('order_items')
      .select('id, order_id, quantity, status, orders(order_number, created_at), menu_items(name)')
      .eq('station_id', id)
      .in('status', ['queued', 'cooking'])
      .order('status_updated_at')
    setItems(data ?? [])
    setLoadingItems(false)
  }

  async function loadRequests(id) {
    if (!id) return
    const { data } = await supabase
      .from('stock_check_requests')
      .select('id, menu_item_id, menu_items(name)')
      .eq('station_id', id)
      .is('resolved_at', null)
    setRequests(data ?? [])
  }

  async function loadMenuItems(id) {
    if (!id) return
    const { data } = await supabase
      .from('menu_items')
      .select('id, name, available, restocked')
      .eq('station_id', id)
      .order('name')
    setMenuItems(data ?? [])
  }

  useEffect(() => {
    if (!stationId) return

    loadItems(stationId)
    loadRequests(stationId)
    loadMenuItems(stationId)

    const channel = supabase
      .channel(`station-${stationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items', filter: `station_id=eq.${stationId}` },
        () => loadItems(stationId)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_check_requests', filter: `station_id=eq.${stationId}` },
        () => loadRequests(stationId)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `station_id=eq.${stationId}` },
        () => loadMenuItems(stationId)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [stationId])

  async function markOrderReady(group) {
    const idsToUpdate = group.items.filter((item) => item.status !== 'ready').map((item) => item.id)
    if (idsToUpdate.length === 0) return

    const { error } = await supabase
      .from('order_items')
      .update({ status: 'ready', status_updated_at: new Date().toISOString() })
      .in('id', idsToUpdate)

    if (error) {
      alert(`Could not update order #${group.orderNumber}: ${error.message}`)
      return
    }

    loadItems(stationId)
  }

  // Hot food / beverage kitchens toggle their own menu (with a confirmation first)
  async function setItemAvailability(item, available) {
    const question = available
      ? `Mark "${item.name}" as AVAILABLE?`
      : `Mark "${item.name}" as UNAVAILABLE?`
    if (!window.confirm(question)) return

    const { error } = await supabase.rpc('kitchen_set_availability', {
      p_item_id: item.id,
      p_available: available,
    })
    if (error) {
      alert(`Could not update ${item.name}: ${error.message}`)
      return
    }
    loadMenuItems(stationId)
    loadRequests(stationId)
  }

  // YTF kitchen tells the YTF counter the booth was topped up
  async function confirmRestock(item) {
    const { error } = await supabase.rpc('ytf_kitchen_confirm_restock', { p_item_id: item.id })
    if (error) {
      alert(`Could not notify the counter about ${item.name}: ${error.message}`)
      return
    }
    loadMenuItems(stationId)
  }

  // Answer the cashier's "is it available?" question
  async function resolveRequest(request, isAvailable) {
    const itemName = request.menu_items?.name ?? 'this item'

    if (isAvailable) {
      if (!window.confirm(`Mark "${itemName}" as AVAILABLE?`)) return
      const { error } = await supabase.rpc('kitchen_set_availability', {
        p_item_id: request.menu_item_id,
        p_available: true,
      })
      if (error) {
        alert(`Could not update the item: ${error.message}`)
        return
      }
    } else {
      const { error } = await supabase
        .from('stock_check_requests')
        .update({ resolved_at: new Date().toISOString(), response: 'unavailable' })
        .eq('id', request.id)
      if (error) {
        alert(`Could not answer the question: ${error.message}`)
        return
      }
    }
    loadRequests(stationId)
    loadMenuItems(stationId)
  }

  const groups = {}
  for (const item of items) {
    const key = item.order_id
    if (!groups[key]) {
      groups[key] = {
        orderId: key,
        orderNumber: item.orders?.order_number,
        createdAt: item.orders?.created_at,
        items: [],
      }
    }
    groups[key].items.push(item)
  }
  const orderGroups = Object.values(groups).sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  )

  const unavailableItems = menuItems.filter((item) => !item.available)
  const sortedMenu = [...menuItems].sort(
    (a, b) => Number(a.available) - Number(b.available) || a.name.localeCompare(b.name)
  )

  return (
    <div className="view">
      <StaffHeader title={`${stationName} station`} />
      <h1>{stationName} station</h1>
      <Link to={`/station/${stationSlug}/history`} className="history-link">View order history →</Link>

      {loadingItems ? (
        <div className="ticket-groups">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : orderGroups.length === 0 ? (
        <p className="empty-note">No orders waiting right now — you're all caught up.</p>
      ) : (
        <div className="ticket-groups">
          {orderGroups.map((group) => {
            const allReady = group.items.every((item) => item.status === 'ready')

            return (
              <div key={group.orderId} className="ticket-group">
                <label className="order-ready-check">
                  <input
                    type="checkbox"
                    checked={allReady}
                    disabled={allReady}
                    onChange={() => markOrderReady(group)}
                  />
                  Order #{group.orderNumber}
                </label>
                <ul className="ticket-list">
                  {group.items.map((item) => (
                    <li key={item.id} className={`ticket ticket-${item.status}`}>
                      {item.quantity} x {item.menu_items?.name}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      <div className="availability-section">
        {isYtf ? (
          <>
            <h2>Unavailable YTF food</h2>
            {unavailableItems.length === 0 ? (
              <p className="empty-note">Everything on the booth is marked available.</p>
            ) : (
              <ul className="availability-list alert">
                {unavailableItems.map((item) => (
                  <li key={item.id} className="availability-row">
                    <span>{item.name}</span>
                    {item.restocked ? (
                      <span className="availability-state ok">
                        Counter notified ✓ — waiting for them to switch it back on
                      </span>
                    ) : (
                      <button className="btn-primary" onClick={() => confirmRestock(item)}>
                        Topped up — notify counter
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <h2>Menu availability</h2>

            {requests.length > 0 && (
              <div className="banner">
                {requests.map((req) => (
                  <div key={req.id} className="banner-row">
                    Counter is asking: is <strong>{req.menu_items?.name}</strong> available again?
                    <button className="btn-primary" onClick={() => resolveRequest(req, true)}>Yes, available</button>
                    <button onClick={() => resolveRequest(req, false)}>Not yet</button>
                  </div>
                ))}
              </div>
            )}

            {unavailableItems.length > 0 && (
              <p className="availability-state">
                Unavailable now: {unavailableItems.map((item) => item.name).join(', ')}
              </p>
            )}

            <ul className="availability-list">
              {sortedMenu.map((item) => (
                <li key={item.id} className={`availability-row ${item.available ? '' : 'is-unavailable'}`}>
                  <div className="availability-switch">
                    <ToggleSwitch
                      checked={item.available}
                      label={`${item.name} availability`}
                      onChange={() => setItemAvailability(item, !item.available)}
                    />
                    <span>{item.name}</span>
                  </div>
                  <span className="availability-state">{item.available ? 'Available' : 'Unavailable'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}