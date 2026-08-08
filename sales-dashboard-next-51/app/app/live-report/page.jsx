'use client'

import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export default function LiveReportPage() {
  return (
    <AuthGate title="Live Report">
      <div className="static-app-frame-wrap">
        <Link href="/app" className="static-app-back">← Kembali ke App</Link>
        <iframe
          src="/api/static-app/live-report"
          title="Live Report"
          className="static-app-frame"
        />
      </div>
    </AuthGate>
  )
}
