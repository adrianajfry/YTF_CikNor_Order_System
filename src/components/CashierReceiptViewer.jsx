import { useEffect, useState } from 'react'
import { Peer } from 'peerjs'
import { PEER_ICE_CONFIG, CASHIER_VIEWER_PEER_ID } from '../lib/peerConfig.js'

export default function CashierReceiptViewer({ onLiveChange, hidden }) {
  const [stream, setStream] = useState(null)

  useEffect(() => {
    let peer
    let activeCall
    let retryTimer
    let cancelled = false

    function connect() {
      if (cancelled) return
      peer = new Peer(CASHIER_VIEWER_PEER_ID, PEER_ICE_CONFIG)

      peer.on('open', (id) => console.log('Cashier viewer registered as:', id))
      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect()
      })

      peer.on('call', (call) => {
        activeCall = call
        call.answer()
        call.on('stream', (remoteStream) => {
          setStream(remoteStream)
          onLiveChange?.(true)
        })
        call.on('close', () => {
          if (activeCall !== call) return
          setStream(null)
          onLiveChange?.(false)
        })
        call.on('error', (err) => console.error('Cashier viewer call error:', err))
      })

      peer.on('error', (err) => {
        console.error('Cashier viewer peer error:', err.type, err)
        if (err.type === 'unavailable-id') {
          peer.destroy()
          retryTimer = setTimeout(connect, 3000)
        }
      })
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      if (peer) peer.destroy()
      onLiveChange?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!stream || hidden) return null

  return (
    <div className="receipt-popup">
      <p>Customer camera (live)</p>
      <video
        ref={(el) => {
          if (el && el.srcObject !== stream) el.srcObject = stream
        }}
        autoPlay
        playsInline
        muted
        className="camera-preview"
      />
    </div>
  )
}