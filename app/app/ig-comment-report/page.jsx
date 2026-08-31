'use client'

import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export default function IgCommentReportPage() {
  return (
    <AuthGate title="Laporan Komentar Instagram">
      <div className="static-app-frame-wrap">
        <Link href="/app" className="static-app-back">← Kembali ke App</Link>
        <iframe
          src="/api/static-app/ig-comment-report"
          title="Laporan Komentar Instagram"
          className="static-app-frame"
        />
      </div>
    </AuthGate>
  )
}
