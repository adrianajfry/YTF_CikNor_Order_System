import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import StaffHeader from '../components/StaffHeader.jsx'

const SNAPSHOT_PATH = 'ytf-live.jpg'
const CAPTURE_INTERVAL_MS = 2000

export default function CameraBroadcastView() {
  const { logout } = useAuth()
  const videoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const [status, setStatus] = useState('starting') // starting | live | error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let stream
    let intervalId

    async function captureAndUpload() {
      const video = videoRef.current
      if (!video || video.videoWidth === 0) return

      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)

      canvas.toBlob(
        async (blob) => {
          if (!blob) return
          const { error } = await supabase.storage
            .from('camera-snapshots')
            .upload(SNAPSHOT_PATH, blob, { upsert: true, contentType: 'image/jpeg' })
          if (error) console.error('Snapshot upload failed:', error)
        },
        'image/jpeg',
        0.7
      )
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (videoRef.current) videoRef.current.srcObject = stream
        setStatus('live')
        intervalId = setInterval(captureAndUpload, CAPTURE_INTERVAL_MS)
      } catch (err) {
        console.error(err)
        setStatus('error')
        setErrorMessage(err.message || 'Could not access camera')
      }
    }
    start()

    return () => {
      if (stream) stream.getTracks().forEach((track) => track.stop())
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  return (
    <div className="view">
      <StaffHeader title="YTF camera" />
      <h1>YTF camera</h1>
      <p>
        {status === 'starting' && 'Starting camera…'}
        {status === 'live' && 'Sending a photo every 2 seconds to the counter screen.'}
        {status === 'error' && `Could not start: ${errorMessage}`}
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