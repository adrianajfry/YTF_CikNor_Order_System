import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function BoardView() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadBoard() {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, board_status, recalled_at')
        .neq('board_status', 'done')
        .order('recalled_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      setOrders(data ?? [])
      setLoading(false)
    }
    loadBoard()

    const channel = supabase
      .channel('board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadBoard)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const ready = orders.filter((o) => o.board_status === 'ready')
  const preparing = orders.filter((o) => o.board_status === 'preparing')

  return (
    <div className="board">
      <div className="board-column">
        <h2>Preparing</h2>
        <div className="board-numbers">
          {loading ? (
            <>
              <span className="skeleton-chip" />
              <span className="skeleton-chip" />
            </>
          ) : (
            preparing.map((o) => (
              <span key={o.id} className={`board-chip ${o.recalled_at ? 'recalled' : ''}`}>{o.order_number}</span>
            ))
          )}
        </div>
      </div>
      <div className="board-column">
        <h2>Ready for pickup</h2>
        <div className="board-numbers">
          {loading ? (
            <span className="skeleton-chip" />
          ) : (
            ready.map((o) => (
              <span key={o.id} className={`board-chip ready ${o.recalled_at ? 'recalled' : ''}`}>
                {o.order_number}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  )
}