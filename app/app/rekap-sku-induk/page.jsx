'use client'

import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export default function RekapSkuIndukPage() {
  return (
    <AuthGate title="Rekap SKU Induk">
      <div className="static-app-frame-wrap">
        <Link href="/app" className="static-app-back">← Kembali ke App</Link>
        <iframe
          src="/api/static-app/rekap-sku-induk"
          title="Rekap SKU Induk"
          className="static-app-frame"
        />
      </div>
    </AuthGate>
  )
}
