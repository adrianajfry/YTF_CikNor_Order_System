import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { CASHIER_VIEWER_PEER_ID } from '../lib/peerConfig.js'
import { startCaller } from '../lib/peerCaller.js'

export default function CustomerDisplayView() {
  const [session, setSession] = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [camStatus, setCamStatus] = useState('idle') // idle | connecting | live | error
  const [camDetail, setCamDetail] = useState('')
  const [needsTap, setNeedsTap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const stopCallerRef = useRef(null)
  const startingRef = useRef(false)
  const startSeqRef = useRef(0)
  const wantsCameraRef = useRef(false)
  const lastCommandRef = useRef('idle')

  // The camera is wanted during a QR payment that has no receipt photo yet
  const wantsCamera =
    session?.status === 'awaiting_payment' &&
    session?.payment_method !== 'cash' &&
    !session?.receipt_url

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

    // Safety net: if a live update is ever missed, this screen still catches up within seconds
    const poll = setInterval(loadSession, 4000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [])

  async function startCamera() {
    if (streamRef.current || startingRef.current) return
    startingRef.current = true
    const seq = ++startSeqRef.current
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

      // The payment may have ended (or restarted) while the permission prompt was open
      if (seq !== startSeqRef.current || !wantsCameraRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      setCameraOn(true)
      setCamStatus('connecting')
      setCamDetail('')
      setNeedsTap(false)
      stopCallerRef.current = startCaller({
        stream,
        targetId: CASHIER_VIEWER_PEER_ID,
        onStatus: (status, detail) => {
          setCamStatus(status)
          setCamDetail(detail || '')
        },
      })
    } catch (err) {
      if (seq === startSeqRef.current) {
        console.error('Could not open camera:', err)
        setCamStatus('error')
        setCamDetail(err.message || 'Could not open the camera')
        setNeedsTap(true)
      }
    } finally {
      if (seq === startSeqRef.current) startingRef.current = false
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

  // Open the camera by itself whenever a QR payment needs a receipt; close it otherwise.
  // This also reopens it after the cashier presses Retake.
  useEffect(() => {
    wantsCameraRef.current = wantsCamera
    if (wantsCamera) {
      startCamera()
    } else {
      startSeqRef.current++ // forget any start still waiting on a permission prompt
      startingRef.current = false
      if (streamRef.current) stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsCamera])

  // When a payment ends (finished or cancelled), wipe any leftover on-screen state
  useEffect(() => {
    if (session && session.status !== 'awaiting_payment') {
      setSaving(false)
      setNotice('')
      setNeedsTap(false)
    }
  }, [session?.status])

  useEffect(() => {
    if (session?.receipt_url) setNotice('')
  }, [session?.receipt_url])

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
    setNotice('')
    canvas.toBlob(
      async (blob) => {
        stopCamera()

        const fail = (message) => {
          setNotice(message)
          setSaving(false)
          if (wantsCameraRef.current) startCamera() // bring the camera back so the cashier can try again
        }

        if (!blob) {
          fail('The photo could not be taken. Please show your receipt again.')
          return
        }

        const fileName = `receipt-${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('payment-receipts')
          .upload(fileName, blob, { contentType: 'image/jpeg' })
        if (uploadError) {
          console.error('Could not save the photo:', uploadError)
          fail('We could not save the photo. Please show your receipt again.')
          return
        }

        const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(fileName)
        const { error: rpcError } = await supabase.rpc('set_checkout_receipt', {
          p_receipt_url: urlData.publicUrl,
        })
        if (rpcError) {
          console.error('Could not attach the photo:', rpcError)
          fail('We could not save the photo. Please show your receipt again.')
          return
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

  if (session.payment_method === 'cash') {
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
          <h2>Paying with cash</h2>
          <p>Please hand RM {Number(session.total).toFixed(2)} to the cashier.</p>
        </div>
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

          {session.receipt_url && (
            <div className="receipt-popup">
              <p>Receipt captured ✓</p>
              <img src={session.receipt_url} alt="Your receipt" />
            </div>
          )}
          {saving && !session.receipt_url && (
            <div className="receipt-popup">
              <p>Saving your receipt…</p>
            </div>
          )}
        </div>
        <p>Scan to pay (demo)</p>

        {!session.receipt_url && (
          <div className="receipt-camera-box">
            <p className="receipt-camera-title">After paying, show your receipt to this camera</p>
            {cameraOn ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
                <p className="camera-status-note">
                  {camStatus === 'live' && 'Connected to the cashier ✓'}
                  {camStatus === 'connecting' && (camDetail || 'Connecting to the cashier…')}
                  {camStatus === 'error' && camDetail}
                </p>
              </>
            ) : needsTap ? (
              <button className="camera-setup-button" onClick={startCamera}>
                Camera is off — staff: tap here to enable
              </button>
            ) : (
              <p className="camera-status-note">Starting camera…</p>
            )}
            {notice && <p className="login-error">{notice}</p>}
          </div>
        )}
      </div>
    </div>
  )
}