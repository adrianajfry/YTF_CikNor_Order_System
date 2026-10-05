import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'
import { SLUG_TO_STATION_NAME } from '../lib/stationNames.js'

export default function StationView({ stationSlug: stationSlugProp }) {
  const params = useParams()
  const stationSlug = stationSlugProp ?? params.stationSlug
  const stationName = SLUG_TO_STATION_NAME[stationSlug] ?? stationSlug
  const [stationId, setStationId] = useState(null)
  const [items, setItems] = useState([])
  const [requests, setRequests] = useState([])
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
      .select('id, menu_items(name)')
      .eq('station_id', id)
      .is('resolved_at', null)
    setRequests(data ?? [])
  }

  useEffect(() => {
    if (!stationId) return

    loadItems(stationId)
    loadRequests(stationId)

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

  async function resolveRequest(request, response) {
    await supabase
      .from('stock_check_requests')
      .update({ resolved_at: new Date().toISOString(), response })
      .eq('id', request.id)
    if (response === 'unavailable') {
      const { data: reqRow } = await supabase
        .from('stock_check_requests')
        .select('menu_item_id')
        .eq('id', request.id)
        .single()
      if (reqRow) {
        await supabase.from('menu_items').update({ available: false }).eq('id', reqRow.menu_item_id)
      }
    }
    loadRequests(stationId)
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

  return (
    <div className="view">
      <StaffHeader title={`${stationName} station`} />
      <h1>{stationName} station</h1>
      <Link to={`/station/${stationSlug}/history`} className="history-link">View order history →</Link>

      {requests.length > 0 && (
        <div className="banner">
          {requests.map((req) => (
            <div key={req.id} className="banner-row">
              Counter is asking: is <strong>{req.menu_items?.name}</strong> available?
              <button onClick={() => resolveRequest(req, 'available')}>Yes</button>
              <button onClick={() => resolveRequest(req, 'unavailable')}>Out of stock</button>
            </div>
          ))}
        </div>
      )}

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
    </div>
  )
}