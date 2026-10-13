import { useEffect, useState } from 'react'
import { Peer } from 'peerjs'
import { PEER_ICE_CONFIG, CASHIER_VIEWER_PEER_ID } from './peerConfig.js'

const FATAL_ERRORS = ['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed']

// Keeps the cashier reachable for as long as the cashier page is open,
// and receives the customer display's camera whenever it calls.
export function useCashierReceiptStream() {
  const [stream, setStream] = useState(null)
  const [linkStatus, setLinkStatus] = useState('starting') // starting | ready | taken | error

  useEffect(() => {
    let peer
    let activeCall
    let retryTimer
    let cancelled = false

    function scheduleRebuild() {
      if (cancelled) return
      clearTimeout(retryTimer)
      retryTimer = setTimeout(connect, 3000)
    }

    function connect() {
      if (cancelled) return
      const thisPeer = new Peer(CASHIER_VIEWER_PEER_ID, PEER_ICE_CONFIG)
      peer = thisPeer
      setLinkStatus('starting')

      thisPeer.on('open', () => {
        if (peer === thisPeer) setLinkStatus('ready')
      })

      thisPeer.on('disconnected', () => {
        if (peer !== thisPeer || cancelled || thisPeer.destroyed) return
        setLinkStatus('starting')
        thisPeer.reconnect()
      })

      thisPeer.on('call', (call) => {
        activeCall = call
        call.answer()
        call.on('stream', (remoteStream) => {
          if (activeCall === call) setStream(remoteStream)
        })
        call.on('close', () => {
          if (activeCall === call) setStream(null)
        })
        call.on('error', (err) => console.error('Cashier receiver call error:', err))
      })

      thisPeer.on('error', (err) => {
        console.error('Cashier receiver error:', err.type, err)
        if (peer !== thisPeer || !FATAL_ERRORS.includes(err.type)) return
        setLinkStatus(err.type === 'unavailable-id' ? 'taken' : 'error')
        if (!thisPeer.destroyed) thisPeer.destroy()
        scheduleRebuild()
      })
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      if (peer && !peer.destroyed) peer.destroy()
    }
  }, [])

  return { stream, linkStatus }
}