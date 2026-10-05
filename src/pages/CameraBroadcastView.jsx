import { useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'
import StaffHeader from '../components/StaffHeader.jsx'
import { PEER_ICE_CONFIG } from '../lib/peerConfig.js'

const VIEWER_PEER_ID = 'ytf-counter-viewer'

export default function CameraBroadcastView() {
  const videoRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | streaming | error
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
        peer.on('open', () => {
          const call = peer.call(VIEWER_PEER_ID, stream)
          if (call) setStatus('streaming')
        })
        peer.on('error', (err) => {
          console.error(err)
          setStatus('error')
          setErrorMessage(err.message || 'Connection error')
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
        {status === 'streaming' && 'Streaming to the YTF counter screen.'}
        {status === 'error' && `Could not start: ${errorMessage}`}
      </p>
      <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
    </div>
  )
}