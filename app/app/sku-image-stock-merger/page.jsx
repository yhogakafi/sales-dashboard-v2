'use client'

import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export default function SkuImageStockMergerPage() {
  return (
    <AuthGate title="SKU gambar dan stock marketplace">
      <div className="static-app-frame-wrap">
        <Link href="/app" className="static-app-back">← Kembali ke App</Link>
        <iframe
          src="/api/static-app/rekap-sku-induk"
          title="SKU gambar dan stock marketplace"
          className="static-app-frame"
        />
      </div>
    </AuthGate>
  )
}
