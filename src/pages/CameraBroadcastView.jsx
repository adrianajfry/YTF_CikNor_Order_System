import { useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'
import { PEER_ICE_CONFIG, VIEWER_PEER_ID } from '../lib/peerConfig.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import StaffHeader from '../components/StaffHeader.jsx'

export default function CameraBroadcastView() {
  const { logout } = useAuth()
  const videoRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | calling | streaming | error
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let peer
    let stream
    let wakeLock
    let currentCall
    let retryTimer
    let callSeq = 0
    let isStreaming = false
    let cancelled = false

    function scheduleRetry(message) {
      if (cancelled) return
      isStreaming = false
      setStatus('calling')
      setDetail(message)
      clearTimeout(retryTimer)
      retryTimer = setTimeout(placeCall, 3000)
    }

    function placeCall() {
      if (cancelled || !peer || peer.destroyed) return
      const seq = ++callSeq
      if (currentCall) currentCall.close()

      const call = peer.call(VIEWER_PEER_ID, stream)
      currentCall = call
      if (!call) {
        scheduleRetry('Could not start a call — retrying…')
        return
      }

      call.on('close', () => {
        if (seq === callSeq) scheduleRetry('Connection closed — retrying…')
      })
      call.on('error', (err) => {
        console.error('Call error:', err)
        if (seq === callSeq) scheduleRetry('Call error — retrying…')
      })

      const pc = call.peerConnection
      if (pc) {
        pc.addEventListener('icecandidate', (e) => {
          if (e.candidate) console.log('Camera candidate type:', e.candidate.type)
        })
        pc.addEventListener('iceconnectionstatechange', () =>
          console.log('Camera ICE:', pc.iceConnectionState)
        )
        pc.addEventListener('connectionstatechange', () => {
          if (seq !== callSeq) return
          if (pc.connectionState === 'connected') {
            isStreaming = true
            setStatus('streaming')
            setDetail('')
          }
          if (pc.connectionState === 'failed') scheduleRetry('Connection failed — retrying…')
        })
      }
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 854 },
            height: { ideal: 480 },
            aspectRatio: { ideal: 16 / 9 },
            frameRate: { ideal: 15 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (videoRef.current) videoRef.current.srcObject = stream

        try {
          if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen')
        } catch (err) {
          console.warn('Could not keep the screen awake:', err)
        }

        peer = new Peer(PEER_ICE_CONFIG)
        peer.on('open', (id) => {
          console.log('Camera peer opened:', id)
          if (!isStreaming) placeCall()
        })
        peer.on('disconnected', () => {
          if (!peer.destroyed) peer.reconnect()
        })
        peer.on('error', (err) => {
          console.error('Camera peer error:', err.type, err)
          if (err.type === 'peer-unavailable') {
            scheduleRetry('Waiting for the counter screen to be open…')
          } else {
            setStatus('error')
            setDetail(`${err.type}: ${err.message}`)
          }
        })
      } catch (err) {
        console.error(err)
        setStatus('error')
        setDetail(err.message || 'Could not access camera')
      }
    }
    start()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      if (wakeLock) wakeLock.release().catch(() => {})
      if (stream) stream.getTracks().forEach((track) => track.stop())
      if (peer) peer.destroy()
    }
  }, [])

  return (
    <div className="view">
      <StaffHeader title="YTF camera" />
      <h1>YTF camera</h1>
      <p>
        {status === 'starting' && 'Starting camera…'}
        {status === 'calling' && (detail || 'Connecting to the counter screen…')}
        {status === 'streaming' && 'Connected — streaming live. Keep this screen on.'}
        {status === 'error' && `Could not connect: ${detail}`}
      </p>
      <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
      <button
        className="btn-danger"
        style={{ marginTop: 16 }}
        onClick={() => {
          if (window.confirm('Are you sure you want to log out?')) logout()
        }}
      >
        Log out
      </button>
    </div>
  )
}