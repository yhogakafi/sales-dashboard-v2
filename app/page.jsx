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
import CompareView from '@/components/CompareView'
import { exportToExcel } from '@/lib/exportExcel'

async function fetchData(id) {
  const url = id ? `/api/data?id=${encodeURIComponent(id)}` : '/api/data'
  const res = await fetch(url, { cache: 'no-store' })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Gagal memuat data.')
  return body
}

export default function HomePage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [periods, setPeriods] = useState([])
  const [selectedId, setSelectedId] = useState('') // '' = terbaru
  const [compareId, setCompareId] = useState('') // '' = tidak ada perbandingan

  const [payload, setPayload] = useState(null)
  const [comparePayload, setComparePayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadPeriods = useCallback(async () => {
    const res = await fetch('/api/periods', { cache: 'no-store' })
    if (res.ok) setPeriods(await res.json())
  }, [])

  const loadData = useCallback(async (id, compareIdVal) => {
    setLoading(true)
    setError(null)
    try {
      const main = await fetchData(id)
      setPayload(main)
      if (compareIdVal) {
        const compare = await fetchData(compareIdVal)
        setComparePayload(compare)
      } else {
        setComparePayload(null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Cek sesi di awal — kalau cookie valid, skip form login
  useEffect(() => {
    fetch('/api/data', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) { setCheckingSession(false); return }
        const body = await res.json()
        if (res.ok || res.status === 404) {
          setLoggedIn(true)
          if (res.ok) setPayload(body)
        }
        setCheckingSession(false)
        loadPeriods()
      })
      .catch(() => setCheckingSession(false))
  }, [loadPeriods])

  const handleLogin = useCallback(async (e) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await fetch('/api/viewer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Password salah.')
      setLoggedIn(true)
      await loadPeriods()
      await loadData('', '')
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }, [password, loadData, loadPeriods])

  const handlePeriodChange = useCallback((newId) => {
    setSelectedId(newId)
    setCompareId('')
    setComparePayload(null)
    loadData(newId, '')
  }, [loadData])

  const handleCompareChange = useCallback((newCompareId) => {
    setCompareId(newCompareId)
    if (newCompareId) {
      loadData(selectedId, newCompareId)
    } else {
      setComparePayload(null)
    }
  }, [selectedId, loadData])

  const analysis = payload?.analysis
  const categories = payload?.categories || {}
  const hasAnyCategory = Object.keys(categories).length > 0
  const isComparing = !!(comparePayload?.analysis)

  if (checkingSession) {
    return <div className="app-shell admin-login-shell"><p className="loading-text">Memeriksa sesi…</p></div>
  }

  if (!loggedIn) {
    return (
      <div className="app-shell admin-login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <p className="eyebrow">Dashboard penjualan</p>
          <h1>Masukkan password tim untuk melihat</h1>
          <input type="password" placeholder="Password tim" value={password}
            onChange={(e) => setPassword(e.target.value)} className="login-input" autoFocus />
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

      {/* ── Pemilih periode ── */}
      {periods.length > 0 && (
        <div className="period-picker">
          <div className="period-picker-group">
            <label className="period-picker-label">Periode</label>
            <select className="category-select" value={selectedId} onChange={(e) => handlePeriodChange(e.target.value)}>
              <option value="">Terbaru ({periods[0]?.label})</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.label} — {p.dateRange}</option>
              ))}
            </select>
          </div>
          <div className="period-picker-group">
            <label className="period-picker-label">Bandingkan dengan</label>
            <select className="category-select" value={compareId} onChange={(e) => handleCompareChange(e.target.value)}>
              <option value="">— Tidak dibandingkan —</option>
              {periods.filter((p) => p.id !== (selectedId || periods[0]?.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.label} — {p.dateRange}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading && <p className="loading-text">Memuat data…</p>}

      {!loading && error && (
        <div className="upload-zone has-error">
          <p className="upload-title">Belum ada data untuk ditampilkan</p>
          <p className="upload-sub">{error}</p>
        </div>
      )}

      {/* ── Mode perbandingan ── */}
      {!loading && isComparing && (
        <CompareView
          payloadA={payload}
          payloadB={comparePayload}
          labelA={periods.find(p => p.id === (selectedId || periods[0]?.id))?.label || 'Periode A'}
          labelB={periods.find(p => p.id === compareId)?.label || 'Periode B'}
        />
      )}

      {/* ── Mode normal (satu periode) ── */}
      {!loading && !isComparing && analysis && (
        <main className="dashboard">
          <p className="period-note">
            Periode data: {analysis.periodLabel} ({analysis.dateKeys.length} hari aktif)
            {payload.savedAt && (
              <> &middot; Diperbarui {new Date(payload.savedAt).toLocaleString('id-ID')}</>
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

          <section><RankingTable data={analysis} /></section>

          {hasAnyCategory && (
            <section><CategorySummary data={analysis} categories={categories} /></section>
          )}
          {hasAnyCategory && (
            <section><CategoryDateDetail data={analysis} categories={categories} /></section>
          )}

          <section><PivotTable data={analysis} /></section>
        </main>
      )}

      <footer className="app-footer">
        <p>Data diperbarui oleh admin toko.</p>
        <Link href="/admin" className="admin-link">Masuk sebagai admin</Link>
      </footer>
    </div>
  )
}
