import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'

const SLUG_TO_STATION_NAME = {
  ytf: 'Yong Tau Foo',
  beverage: 'Beverage',
  hotfood: 'Hot Food',
}

export default function StationView({ stationSlug: stationSlugProp }) {
  const params = useParams()
  const stationSlug = stationSlugProp ?? params.stationSlug
  const stationName = SLUG_TO_STATION_NAME[stationSlug] ?? stationSlug
  const [stationId, setStationId] = useState(null)
  const [items, setItems] = useState([])
  const [requests, setRequests] = useState([])

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

  useEffect(() => {
    if (!stationId) return

    async function loadItems() {
      const { data } = await supabase
        .from('order_items')
        .select('id, quantity, status, orders(order_number), menu_items(name)')
        .eq('station_id', stationId)
        .in('status', ['queued', 'cooking', 'ready'])
        .order('status_updated_at')
      setItems(data ?? [])
    }
    async function loadRequests() {
      const { data } = await supabase
        .from('stock_check_requests')
        .select('id, menu_items(name)')
        .eq('station_id', stationId)
        .is('resolved_at', null)
      setRequests(data ?? [])
    }
    loadItems()
    loadRequests()

    const channel = supabase
      .channel(`station-${stationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items', filter: `station_id=eq.${stationId}` },
        loadItems
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_check_requests', filter: `station_id=eq.${stationId}` },
        loadRequests
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [stationId])

  async function advanceStatus(item) {
    const next = item.status === 'queued' ? 'cooking' : 'ready'
    await supabase
      .from('order_items')
      .update({ status: next, status_updated_at: new Date().toISOString() })
      .eq('id', item.id)
  }

  async function resolveRequest(request, response) {
    await supabase
      .from('stock_check_requests')
      .update({ resolved_at: new Date().toISOString(), response })
      .eq('id', request.id)
    if (response === 'unavailable') {
      // Also flip the menu item off for future orders.
      const { data: reqRow } = await supabase
        .from('stock_check_requests')
        .select('menu_item_id')
        .eq('id', request.id)
        .single()
      if (reqRow) {
        await supabase.from('menu_items').update({ available: false }).eq('id', reqRow.menu_item_id)
      }
    }
  }

  return (
    <div className="view">
      <StaffHeader title={`${stationName} station`} />
      <h1>{stationName} station</h1>

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

      {(() => {
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

        if (orderGroups.length === 0) {
          return <p className="empty-note">No orders waiting right now — you're all caught up.</p>
        }

        return (
          <div className="ticket-groups">
            {orderGroups.map((group) => (
              <div key={group.orderId} className="ticket-group">
                <div className="ticket-group-header">Order #{group.orderNumber}</div>
                <ul className="ticket-list">
                  {group.items.map((item) => (
                    <li key={item.id} className={`ticket ticket-${item.status}`}>
                      {item.quantity} x {item.menu_items?.name} ({item.status})
                      {item.status !== 'ready' && (
                        <button onClick={() => advanceStatus(item)}>
                          Mark {item.status === 'queued' ? 'cooking' : 'ready'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
