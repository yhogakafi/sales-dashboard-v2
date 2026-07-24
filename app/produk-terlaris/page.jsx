'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ProdukRankingTable from '@/components/ProdukRankingTable'
import { formatNumber } from '@/lib/parseData'

async function fetchData(id) {
  const url = id ? `/api/produk-terlaris/data?id=${encodeURIComponent(id)}` : '/api/produk-terlaris/data'
  const res = await fetch(url, { cache: 'no-store' })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Gagal memuat data.')
  return body
}

export default function ProdukTerlarisPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [periods, setPeriods] = useState([])
  const [selectedId, setSelectedId] = useState('') // '' = terbaru

  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadPeriods = useCallback(async () => {
    const res = await fetch('/api/produk-terlaris/periods', { cache: 'no-store' })
    if (res.ok) setPeriods(await res.json())
  }, [])

  const loadData = useCallback(async (id) => {
    setLoading(true)
    setError(null)
    try {
      const body = await fetchData(id)
      setPayload(body)
    } catch (err) {
      setError(err.message)
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then(async (res) => {
        setLoggedIn(res.ok)
        setCheckingSession(false)
        if (res.ok) {
          await loadPeriods()
          await loadData('')
        }
      })
      .catch(() => setCheckingSession(false))
  }, [loadPeriods, loadData])

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
      await loadData('')
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }, [password, loadPeriods, loadData])

  const handlePeriodChange = useCallback((newId) => {
    setSelectedId(newId)
    loadData(newId)
  }, [loadData])

  const analysis = payload?.analysis

  if (checkingSession) {
    return <div className="app-shell admin-login-shell"><p className="loading-text">Memeriksa sesi…</p></div>
  }

  if (!loggedIn) {
    return (
      <div className="app-shell admin-login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <p className="eyebrow">Produk Terlaris</p>
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
          <h1>Produk Terlaris</h1>
        </div>
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
        </div>
      )}

      {loading && <p className="loading-text">Memuat data…</p>}

      {!loading && error && (
        <div className="upload-zone has-error">
          <p className="upload-title">Belum ada data untuk ditampilkan</p>
          <p className="upload-sub">{error}</p>
        </div>
      )}

      {!loading && !error && analysis && (
        <main className="dashboard">
          <p className="period-note">
            {analysis.dateRangeRaw ? `Periode data: ${analysis.dateRangeRaw}` : 'Periode data tidak terdeteksi otomatis dari file.'}
            {payload.savedAt && (
              <> &middot; Diperbarui {new Date(payload.savedAt).toLocaleString('id-ID')}</>
            )}
          </p>

          <div className="card-grid">
            <div className="metric-card">
              <p className="metric-label">Total qty terjual</p>
              <p className="metric-value">{formatNumber(analysis.totalQtyAll)}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Produk unik</p>
              <p className="metric-value">{formatNumber(analysis.products.length)}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Toko</p>
              <p className="metric-value">{analysis.tokoList.length}</p>
            </div>
          </div>

          {analysis.unmatchedCount > 0 && (
            <p className="upload-error" style={{ marginBottom: '1.5rem' }}>
              {analysis.unmatchedCount} kode barang di periode ini tidak ditemukan di master barang saat
              diunggah, jadi tampil sebagai kode saja tanpa nama produk.
            </p>
          )}

          <section><ProdukRankingTable data={analysis} /></section>
        </main>
      )}

      <footer className="app-footer">
        <p>Data diperbarui oleh admin toko.</p>
        <Link href="/admin" className="admin-link">Masuk sebagai admin</Link>
      </footer>
    </div>
  )
}
