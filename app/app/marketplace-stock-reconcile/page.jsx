'use client'

import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export default function MarketplaceStockReconcilePage() {
  return (
    <AuthGate title="Marketplace Stock Reconcile">
      <div className="static-app-frame-wrap">
        <Link href="/app" className="static-app-back">← Kembali ke App</Link>
        <iframe
          src="/api/static-app/marketplace-stock-reconcile"
          title="Marketplace Stock Reconcile"
          className="static-app-frame"
        />
      </div>
    </AuthGate>
  )
}
