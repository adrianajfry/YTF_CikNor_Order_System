import { useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'
import { PEER_ICE_CONFIG } from '../lib/peerConfig.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import StaffHeader from '../components/StaffHeader.jsx'

const VIEWER_PEER_ID = 'ytf-counter-viewer'

export default function CameraBroadcastView() {
  const { logout } = useAuth()
  const videoRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | calling | streaming | error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let peer
    let stream

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (videoRef.current) videoRef.current.srcObject = stream

        peer = new Peer(PEER_ICE_CONFIG)

        peer.on('open', (id) => {
          console.log('Camera peer opened:', id)
          setStatus('calling')
          const call = peer.call(VIEWER_PEER_ID, stream)

          if (!call) {
            setStatus('error')
            setErrorMessage('Could not start a call to the counter screen.')
            return
          }

          call.on('error', (err) => {
            console.error('Call error:', err)
            setStatus('error')
            setErrorMessage(err.message || 'Call error')
          })
          call.on('close', () => {
            setStatus('error')
            setErrorMessage('Connection closed.')
          })

          const watchConnection = () => {
            const pc = call.peerConnection
            if (!pc) return
            pc.addEventListener('connectionstatechange', () => {
              console.log('Call connection state:', pc.connectionState)
              if (pc.connectionState === 'connected') setStatus('streaming')
              if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                setStatus('error')
                setErrorMessage(`Connection ${pc.connectionState}.`)
              }
            })
          }
          watchConnection()
        })

        peer.on('error', (err) => {
          console.error('Camera peer error:', err.type, err)
          setStatus('error')
          setErrorMessage(`${err.type}: ${err.message || 'Connection error'}`)
        })
      } catch (err) {
        console.error(err)
        setStatus('error')
        setErrorMessage(err.message || 'Could not access camera')
      }
    }
    start()

    return () => {
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
        {status === 'calling' && 'Connecting to the counter screen…'}
        {status === 'streaming' && 'Connected — streaming live.'}
        {status === 'error' && `Could not connect: ${errorMessage}`}
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