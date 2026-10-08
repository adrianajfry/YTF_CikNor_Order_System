import { useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'
import { PEER_ICE_CONFIG, VIEWER_PEER_ID } from '../lib/peerConfig.js'

export default function YtfLiveCamera() {
  const videoRef = useRef(null)
  const [status, setStatus] = useState('waiting') // waiting | connected | error
  const [detail, setDetail] = useState('')

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
          // An older session still holds this ID on the signaling server; try again shortly
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

  return (
    <div className="counter-camera">
      <h2 className="counter-camera-title">Live streaming of YTF food</h2>
      <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
      {status !== 'connected' && (
        <p className="camera-status-note">
          {status === 'error' ? `Camera connection error (${detail}).` : 'Waiting for the camera to connect…'}
        </p>
      )}
    </div>
  )
}