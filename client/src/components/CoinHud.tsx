import React from 'react'

import { useAppSelector } from '../hooks'

export default function CoinHud() {
  const coinBalance = useAppSelector((state) => state.social.snapshot?.progression.coinBalance || 0)
  const formattedBalance = coinBalance.toLocaleString()

  return <aside className="coin-hud" aria-label={`Ví Coin: ${formattedBalance} Coin`}>
    <svg className="coin-hud-icon" viewBox="0 0 16 16" shapeRendering="crispEdges" focusable="false" aria-hidden="true">
      <path fill="#6b431f" d="M4 0h8v1h2v2h1v2h1v6h-1v2h-2v2h-2v1H4v-1H2v-2H1v-2H0V5h1V3h1V1h2V0Z" />
      <path fill="#f4c95d" d="M4 1h8v1h2v2h1v6h-1v2h-2v2H4v-1H2v-2H1V5h2V3h1V1Z" />
      <path fill="#ffe99a" d="M4 2h7v1h2v2h1v3h-1V6h-1V4h-2V3H4Z" />
      <path fill="#c4832d" d="M2 6h2v5h2v2h5v1H4v-1H2v-2H1V7h1Z" />
      <path fill="#9b6328" d="M7 3h2v1h1v1H8v1h2v1h1v2H9v1H8v1H6v-1H5V9h2v1h1V9H7V8H6V6h1V4h0V3Z" />
      <path fill="#fff4b5" d="M5 3h1v2H5zM4 6h1v4H4z" />
    </svg>
    <span className="coin-hud-copy">
      <span className="coin-hud-label">WALLET</span>
      <span className="coin-hud-value"><strong>{formattedBalance}</strong><small>COIN</small></span>
    </span>
  </aside>
}
