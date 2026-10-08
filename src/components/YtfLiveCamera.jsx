import { useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'
import { PEER_ICE_CONFIG, VIEWER_PEER_ID } from '../lib/peerConfig.js'

const MAX_ZOOM = 4

export default function YtfLiveCamera() {
  const videoRef = useRef(null)
  const frameRef = useRef(null)
  const dragRef = useRef(null)
  const [status, setStatus] = useState('waiting') // waiting | connected | error
  const [detail, setDetail] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let peer
    let retryTimer
    let cancelled = false

    function connect() {
      if (cancelled) return
      peer = new Peer(VIEWER_PEER_ID, PEER_ICE_CONFIG)

      peer.on('open', (id) => console.log('Counter registered as:', id))
      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect()
      })

      peer.on('call', (call) => {
        call.answer()
        call.on('stream', (remoteStream) => {
          if (videoRef.current) videoRef.current.srcObject = remoteStream
          setStatus('connected')
          setDetail('')
        })
        call.on('close', () => setStatus('waiting'))
        call.on('error', (err) => console.error('Counter call error:', err))

        const pc = call.peerConnection
        if (pc) {
          pc.addEventListener('iceconnectionstatechange', () =>
            console.log('Counter ICE:', pc.iceConnectionState)
          )
        }
      })

      peer.on('error', (err) => {
        console.error('Counter peer error:', err.type, err)
        if (err.type === 'unavailable-id') {
          peer.destroy()
          retryTimer = setTimeout(connect, 3000)
        } else {
          setStatus('error')
          setDetail(err.type)
        }
      })
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      if (peer) peer.destroy()
    }
  }, [])

  // Keep the picture from being dragged past its own edges
  function clampPan(p, z) {
    const el = frameRef.current
    if (!el) return p
    const minX = -(z - 1) * el.clientWidth
    const minY = -(z - 1) * el.clientHeight
    return {
      x: Math.min(0, Math.max(minX, p.x)),
      y: Math.min(0, Math.max(minY, p.y)),
    }
  }

  // Zoom around the centre of the frame
  function applyZoom(nextZoom) {
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom))
    const el = frameRef.current
    if (!el) {
      setZoom(z)
      return
    }
    const cx = el.clientWidth / 2
    const cy = el.clientHeight / 2
    const ux = (cx - pan.x) / zoom
    const uy = (cy - pan.y) / zoom
    setZoom(z)
    setPan(clampPan({ x: cx - ux * z, y: cy - uy * z }, z))
  }

  function onPointerDown(e) {
    if (zoom === 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }

  function onPointerMove(e) {
    const d = dragRef.current
    if (!d) return
    setPan(
      clampPan(
        { x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) },
        zoom
      )
    )
  }

  function endDrag() {
    dragRef.current = null
  }

  return (
    <div className="counter-camera">
      <h2 className="counter-camera-title">Live streaming of YTF food</h2>

      <div
        ref={frameRef}
        className={`camera-frame ${zoom > 1 ? 'zoomed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-frame-video"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
      </div>

      <div className="camera-zoom-controls">
        <button onClick={() => applyZoom(zoom - 0.5)} disabled={zoom <= 1}>−</button>
        <span>{zoom.toFixed(1)}×</span>
        <button onClick={() => applyZoom(zoom + 0.5)} disabled={zoom >= MAX_ZOOM}>+</button>
        <button onClick={() => applyZoom(1)} disabled={zoom === 1}>Reset</button>
      </div>
      {zoom > 1 && <p className="camera-status-note">Drag the picture to move around.</p>}

      {status !== 'connected' && (
        <p className="camera-status-note">
          {status === 'error' ? `Camera connection error (${detail}).` : 'Waiting for the camera to connect…'}
        </p>
      )}
    </div>
  )
}