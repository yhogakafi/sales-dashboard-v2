'use client'

import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export default function ProductCatalogPage() {
  return (
    <AuthGate title="Katalog Produk">
      <div className="static-app-frame-wrap">
        <Link href="/app" className="static-app-back">← Kembali ke App</Link>
        <iframe
          src="/api/static-app/product-catalog"
          title="Katalog Produk"
          className="static-app-frame"
        />
      </div>
    </AuthGate>
  )
}
