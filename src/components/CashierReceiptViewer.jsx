import { useEffect, useState } from 'react'
import { Peer } from 'peerjs'
import { PEER_ICE_CONFIG, CASHIER_VIEWER_PEER_ID } from '../lib/peerConfig.js'

export default function CashierReceiptViewer({ stream, hidden }) {
  if (!stream || hidden) return null

  return (
    <div className="receipt-live-feed">
      <p className="camera-status-note">Customer camera (live)</p>
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