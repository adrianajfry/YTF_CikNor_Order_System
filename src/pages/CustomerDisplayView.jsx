import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function CustomerDisplayView() {
  const [session, setSession] = useState(null)
  const [cameraLive, setCameraLive] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const lastCommandRef = useRef(null)

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

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setCameraLive(true)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 0)
    } catch (err) {
      console.error('Could not open camera:', err)
    }
  }

  function closeCamera() {
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraLive(false)
  }

  async function capturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) {
      closeCamera()
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    canvas.toBlob(
      async (blob) => {
        closeCamera()
        if (!blob) return

        const fileName = `receipt-${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('payment-receipts')
          .upload(fileName, blob, { contentType: 'image/jpeg' })
        if (uploadError) {
          console.error('Could not save the photo:', uploadError)
          return
        }

        const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(fileName)
        const { error: rpcError } = await supabase.rpc('set_checkout_receipt', {
          p_receipt_url: urlData.publicUrl,
        })
        if (rpcError) console.error('Could not attach the photo:', rpcError)
      },
      'image/jpeg',
      0.85
    )
  }

  useEffect(() => {
    const command = session?.camera_command ?? 'idle'
    if (command === lastCommandRef.current) return
    lastCommandRef.current = command

    if (command === 'open') openCamera()
    else if (command === 'capture') capturePhoto()
    else closeCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.camera_command])

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
        <div className="qr-overlay-wrap">
          {session.receipt_url ? (
            <div className="receipt-popup">
              <p>Receipt captured ✓</p>
              <img src={session.receipt_url} alt="Your receipt" />
            </div>
          ) : cameraLive ? (
            <div className="receipt-popup">
              <p>Please show your receipt to the camera</p>
              <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
            </div>
          ) : (
            <img src={qrUrl} alt="Scan to pay" />
          )}
        </div>
        {!session.receipt_url && !cameraLive && <p>Scan to pay (demo)</p>}
      </div>
    </div>
  )
}