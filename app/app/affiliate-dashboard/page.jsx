'use client'

import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export default function AffiliateDashboardPage() {
  return (
    <AuthGate title="Affiliate Dashboard">
      <div className="static-app-frame-wrap">
        <Link href="/app" className="static-app-back">← Kembali ke App</Link>
        <iframe
          src="/api/static-app/affiliate-dashboard"
          title="Affiliate Dashboard"
          className="static-app-frame"
        />
      </div>
    </AuthGate>
  )
}
