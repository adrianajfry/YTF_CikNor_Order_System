import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { CASHIER_VIEWER_PEER_ID } from '../lib/peerConfig.js'
import { startCaller } from '../lib/peerCaller.js'

export default function CustomerDisplayView() {
  const [session, setSession] = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [camStatus, setCamStatus] = useState('idle') // idle | connecting | live | error
  const [camDetail, setCamDetail] = useState('')
  const [saving, setSaving] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const stopCallerRef = useRef(null)
  const lastCommandRef = useRef('idle')

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

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15 },
        },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
      setCamStatus('connecting')
      setCamDetail('')
      stopCallerRef.current = startCaller({
        stream,
        targetId: CASHIER_VIEWER_PEER_ID,
        onStatus: (status, detail) => {
          setCamStatus(status)
          setCamDetail(detail || '')
        },
      })
    } catch (err) {
      console.error('Could not open camera:', err)
      setCamStatus('error')
      setCamDetail(err.message || 'Could not open the camera')
    }
  }

  function stopCamera() {
    if (stopCallerRef.current) stopCallerRef.current()
    stopCallerRef.current = null
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOn(false)
    setCamStatus('idle')
    setCamDetail('')
  }

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOn])

  function capturePhoto() {
    const video = videoRef.current
    if (!video || !streamRef.current || video.videoWidth === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    setSaving(true)
    canvas.toBlob(
      async (blob) => {
        stopCamera()
        if (!blob) {
          setSaving(false)
          return
        }

        const fileName = `receipt-${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('payment-receipts')
          .upload(fileName, blob, { contentType: 'image/jpeg' })
        if (uploadError) {
          console.error('Could not save the photo:', uploadError)
          setCamStatus('error')
          setCamDetail('We could not save the photo. Please try again.')
          setSaving(false)
          return
        }

        const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(fileName)
        const { error: rpcError } = await supabase.rpc('set_checkout_receipt', {
          p_receipt_url: urlData.publicUrl,
        })
        if (rpcError) {
          console.error('Could not attach the photo:', rpcError)
          setCamStatus('error')
          setCamDetail('We could not save the photo. Please try again.')
        }
        setSaving(false)
      },
      'image/jpeg',
      0.9
    )
  }

  // The cashier taps "Capture receipt" → a new unique command arrives here
  useEffect(() => {
    const command = session?.camera_command ?? 'idle'
    if (command === lastCommandRef.current) return
    lastCommandRef.current = command
    if (command.startsWith('capture')) capturePhoto()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.camera_command])

  // Turn the camera off if the payment ends for any reason
  useEffect(() => {
    if (session && session.status !== 'awaiting_payment' && streamRef.current) stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status])

  useEffect(() => {
    return () => {
      if (stopCallerRef.current) stopCallerRef.current()
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
    }
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
        <div className="qr-overlay-wrap">
          <img src={qrUrl} alt="Scan to pay" />

          {session.receipt_url ? (
            <div className="receipt-popup">
              <p>Receipt captured ✓</p>
              <img src={session.receipt_url} alt="Your receipt" />
            </div>
          ) : cameraOn ? (
            <div className="receipt-popup">
              <p>Hold your payment receipt up to the camera</p>
              <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
              <p className="camera-status-note">
                {camStatus === 'live' && 'Connected to the cashier ✓'}
                {camStatus === 'connecting' && (camDetail || 'Connecting to the cashier…')}
                {camStatus === 'error' && camDetail}
              </p>
            </div>
          ) : saving ? (
            <div className="receipt-popup">
              <p>Saving your receipt…</p>
            </div>
          ) : null}
        </div>

        {!session.receipt_url && !cameraOn && !saving && (
          <>
            <p>Scan to pay (demo)</p>
            <button className="btn-primary" onClick={startCamera}>
              Show us your receipt
            </button>
            {camStatus === 'error' && <p className="login-error">{camDetail}</p>}
          </>
        )}

        {cameraOn && <button onClick={stopCamera}>Close camera</button>}
      </div>
    </div>
  )
}