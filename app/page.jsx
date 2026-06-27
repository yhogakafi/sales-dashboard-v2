'use client'

import { useCallback, useEffect, useState } from 'react'
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
  const [loggedIn, setLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
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

  // Coba langsung fetch data sekali di awal -- kalau cookie sesi viewer/admin
  // masih berlaku, request ini akan berhasil dan kita skip form login.
  useEffect(() => {
    fetch('/api/data', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          setCheckingSession(false)
          return
        }
        const body = await res.json()
        if (!res.ok && res.status !== 404) throw new Error(body.error || 'Gagal memuat data.')
        setPayload(body)
        setLoggedIn(true)
        setCheckingSession(false)
      })
      .catch((err) => {
        setError(err.message)
        setCheckingSession(false)
      })
  }, [])

  const handleLogin = useCallback(
    async (e) => {
      e.preventDefault()
      setLoginError(null)
      setLoginLoading(true)
      try {
        const res = await fetch('/api/viewer-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Password salah.')
        }
        setLoggedIn(true)
        loadData()
      } catch (err) {
        setLoginError(err.message)
      } finally {
        setLoginLoading(false)
      }
    },
    [password, loadData]
  )

  const analysis = payload?.analysis
  const categories = payload?.categories || {}
  const hasAnyCategory = Object.keys(categories).length > 0

  if (checkingSession) {
    return (
      <div className="app-shell admin-login-shell">
        <p className="loading-text">Memeriksa sesi…</p>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div className="app-shell admin-login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <p className="eyebrow">Dashboard penjualan</p>
          <h1>Masukkan password tim untuk melihat</h1>
          <input
            type="password"
            placeholder="Password tim"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
            autoFocus
          />
          {loginError && <p className="upload-error">{loginError}</p>}
          <button type="submit" className="btn-export" disabled={loginLoading}>
            {loginLoading ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
      </div>
    )
  }

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
