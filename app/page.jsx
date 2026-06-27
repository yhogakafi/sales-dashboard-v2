'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SummaryCards from '@/components/SummaryCards'
import DailyTrendChart from '@/components/DailyTrendChart'
import BreakdownCharts from '@/components/BreakdownCharts'
import RankingTable from '@/components/RankingTable'
import PivotTable from '@/components/PivotTable'
import CategorySummary from '@/components/CategorySummary'
import CategoryDateDetail from '@/components/CategoryDateDetail'
import { exportToExcel } from '@/lib/exportExcel'

export default function HomePage() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/data', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Gagal memuat data.')
        return body
      })
      .then((body) => setPayload(body))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const analysis = payload?.analysis
  const categories = payload?.categories || {}
  const hasAnyCategory = Object.keys(categories).length > 0

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Dashboard penjualan</p>
          <h1>Analisa penjualan toko online</h1>
        </div>
        {analysis && (
          <button className="btn-export" onClick={() => exportToExcel(analysis, categories)}>
            Unduh sebagai Excel
          </button>
        )}
      </header>

      {loading && <p className="loading-text">Memuat data…</p>}

      {!loading && error && (
        <div className="upload-zone has-error">
          <p className="upload-title">Belum ada data untuk ditampilkan</p>
          <p className="upload-sub">{error}</p>
        </div>
      )}

      {!loading && analysis && (
        <main className="dashboard">
          <p className="period-note">
            Periode data: {analysis.periodLabel} ({analysis.dateKeys.length} hari aktif)
            {payload.uploadedAt && (
              <> &middot; Terakhir diperbarui {new Date(payload.uploadedAt).toLocaleString('id-ID')}</>
            )}
          </p>

          <SummaryCards data={analysis} />

          <section>
            <h2 className="section-title">Tren harian</h2>
            <DailyTrendChart daily={analysis.daily} />
          </section>

          <section>
            <h2 className="section-title">Komposisi omset</h2>
            <BreakdownCharts platformTotals={analysis.platformTotals} brandTotals={analysis.brandTotals} />
          </section>

          <section>
            <RankingTable data={analysis} />
          </section>

          {hasAnyCategory && (
            <section>
              <CategorySummary data={analysis} categories={categories} />
            </section>
          )}

          {hasAnyCategory && (
            <section>
              <CategoryDateDetail data={analysis} categories={categories} />
            </section>
          )}

          <section>
            <PivotTable data={analysis} />
          </section>
        </main>
      )}

      <footer className="app-footer">
        <p>Data diperbarui oleh admin toko. Dashboard ini hanya untuk dilihat.</p>
        <Link href="/admin" className="admin-link">
          Masuk sebagai admin
        </Link>
      </footer>
    </div>
  )
}
