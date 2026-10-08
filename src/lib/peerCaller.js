import { Peer } from 'peerjs'
import { PEER_ICE_CONFIG } from './peerConfig.js'

export function startCaller({ stream, targetId, onStatus }) {
  let peer
  let currentCall
  let retryTimer
  let callSeq = 0
  let isLive = false
  let stopped = false

  function report(status, detail = '') {
    if (!stopped) onStatus(status, detail)
  }

  function scheduleRetry(message) {
    if (stopped) return
    isLive = false
    report('connecting', message)
    clearTimeout(retryTimer)
    retryTimer = setTimeout(placeCall, 3000)
  }

  function placeCall() {
    if (stopped || !peer || peer.destroyed) return
    const seq = ++callSeq
    if (currentCall) currentCall.close()

    const call = peer.call(targetId, stream)
    currentCall = call
    if (!call) {
      scheduleRetry('Could not start the call — retrying…')
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
      pc.addEventListener('connectionstatechange', () => {
        if (seq !== callSeq) return
        if (pc.connectionState === 'connected') {
          isLive = true
          report('live')
        }
        if (pc.connectionState === 'failed') scheduleRetry('Connection failed — retrying…')
      })
    }
  }

  peer = new Peer(PEER_ICE_CONFIG)
  peer.on('open', () => {
    if (!isLive) placeCall()
  })
  peer.on('disconnected', () => {
    if (!peer.destroyed) peer.reconnect()
  })
  peer.on('error', (err) => {
    console.error('Caller peer error:', err.type, err)
    if (err.type === 'peer-unavailable') scheduleRetry('Waiting for the cashier screen…')
    else report('error', `${err.type}: ${err.message}`)
  })

  return function stop() {
    stopped = true
    clearTimeout(retryTimer)
    if (peer) peer.destroy()
  }
}