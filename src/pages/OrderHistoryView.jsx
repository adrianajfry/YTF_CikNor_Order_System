import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import StaffHeader from '../components/StaffHeader.jsx'
import { SLUG_TO_STATION_NAME } from '../lib/stationNames.js'

export default function OrderHistoryView({ stationSlug }) {
  const stationName = SLUG_TO_STATION_NAME[stationSlug] ?? stationSlug
  const [stationId, setStationId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])

  useEffect(() => {
    async function init() {
      const { data: station } = await supabase.from('stations').select('id').eq('name', stationName).single()
      if (!station) {
        setLoading(false)
        return
      }
      setStationId(station.id)
    }
    init()
  }, [stationName])

  async function loadHistory(id) {
    const { data } = await supabase
      .from('order_items')
      .select('id, order_id, quantity, status, orders(order_number, created_at), menu_items(name)')
      .eq('station_id', id)
      .in('status', ['ready', 'picked_up'])
      .order('status_updated_at', { ascending: false })
      .limit(100)

    const byOrder = {}
    for (const item of data ?? []) {
      const key = item.order_id
      if (!byOrder[key]) {
        byOrder[key] = {
          orderId: key,
          orderNumber: item.orders?.order_number,
          createdAt: item.orders?.created_at,
          items: [],
        }
      }
      byOrder[key].items.push(item)
    }
    setGroups(Object.values(byOrder).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    setLoading(false)
  }

  useEffect(() => {
    if (!stationId) return

    loadHistory(stationId)

    const channel = supabase
      .channel(`station-history-${stationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items', filter: `station_id=eq.${stationId}` },
        () => loadHistory(stationId)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [stationId])

  return (
    <div className="view">
      <StaffHeader title={`${stationName} station — history`} />
      <h1>Order history</h1>
      <Link to={`/station/${stationSlug}`} className="history-link">← Back to live orders</Link>

      {loading ? (
        <div className="ticket-groups">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : groups.length === 0 ? (
        <p className="empty-note">No completed orders yet.</p>
      ) : (
        <div className="ticket-groups">
          {groups.map((group) => (
            <div key={group.orderId} className="ticket-group">
              <div className="ticket-group-header">
                <span>Order #{group.orderNumber}</span>
                <span className="history-date">
                  {group.createdAt ? new Date(group.createdAt).toLocaleString() : ''}
                </span>
              </div>
              <ul className="ticket-list">
                {group.items.map((item) => (
                  <li key={item.id} className="ticket">
                    {item.quantity} x {item.menu_items?.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}