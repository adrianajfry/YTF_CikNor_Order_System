import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function CustomerDisplayView() {
  const [session, setSession] = useState(null)

  async function loadSession() {
    const { data } = await supabase.from('checkout_sessions').select('*').eq('id', 'current').single()
    setSession(data)
  }

  useEffect(() => {
    loadSession()
    const channel = supabase
      .channel('customer-display')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkout_sessions', filter: 'id=eq.current' },
        loadSession
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  if (!session || session.status !== 'awaiting_payment') {
    return (
      <div className="customer-display idle">
        <h1>Welcome to Yong Cik Nor Tau Foo</h1>
        <p>Please proceed to the cashier to place your order.</p>
      </div>
    )
  }

  const qrText = `DEMO PAYMENT - ${session.order_label} - Total RM${Number(session.total).toFixed(2)}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrText)}`

  return (
    <div className="customer-display">
      <div className="customer-display-order">
        <h2>{session.order_label}</h2>
        <ul>
          {(session.items ?? []).map((item, i) => (
            <li key={i}>
              {item.quantity} x {item.name} — RM {(item.price * item.quantity).toFixed(2)}
            </li>
          ))}
        </ul>
        <div className="customer-display-total">Total: RM {Number(session.total).toFixed(2)}</div>
      </div>
      <div className="customer-display-qr">
        <img src={qrUrl} alt="Scan to pay" />
        <p>Scan to pay (demo)</p>
      </div>
    </div>
  )
}