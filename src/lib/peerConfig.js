export const VIEWER_PEER_ID = 'ytf-counter-viewer'
export const CASHIER_VIEWER_PEER_ID = 'ytf-cashier-receipt-viewer'

const turnHost = import.meta.env.VITE_TURN_HOST || 'standard.relay.metered.ca'
const turnUsername = import.meta.env.VITE_TURN_USERNAME
const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL

const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

if (turnUsername && turnCredential) {
  const auth = { username: turnUsername, credential: turnCredential }
  iceServers.push(
    { urls: `turn:${turnHost}:80`, ...auth },
    { urls: `turn:${turnHost}:80?transport=tcp`, ...auth },
    { urls: `turn:${turnHost}:443`, ...auth },
    { urls: `turns:${turnHost}:443?transport=tcp`, ...auth }
  )
} else {
  console.warn('No TURN credentials set (VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL). Video may fail across different networks.')
}

export const PEER_ICE_CONFIG = { config: { iceServers } }