'use client'

import Link from 'next/link'
import AuthGate from '@/components/AuthGate'
import { STATIC_APPS_LIST } from '@/lib/staticAppsList'

export default function AppListPage() {
  return (
    <AuthGate title="App">
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">Dashboard penjualan</p>
            <h1>App</h1>
          </div>
        </header>

        <div className="app-grid">
          {STATIC_APPS_LIST.map((app) => (
            <Link key={app.slug} href={`/app/${app.slug}`} className="app-card">
              <h3>{app.title}</h3>
              <p>{app.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </AuthGate>
  )
}
