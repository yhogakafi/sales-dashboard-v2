'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import AuthGate from '@/components/AuthGate'
import ShopeeDashboard from '@/components/affiliate/ShopeeDashboard'
import TikTokDashboard from '@/components/affiliate/TikTokDashboard'
import SemuaDashboard from '@/components/affiliate/SemuaDashboard'

export default function AffiliatePage() {
  const [activePlatform, setActivePlatform] = useState('shopee') // 'shopee' | 'tiktok' | 'semua'

  // Periods and index metadata
  const [months, setMonths] = useState([])
  const [accounts, setAccounts] = useState([])
  const [periodsLoading, setPeriodsLoading] = useState(true)

  // Filters
  const [dateMode, setDateMode] = useState('month') // 'month' | 'range'
  const [selectedMonth, setSelectedMonth] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('ALL')

  // Loaded month data
  const [monthEntries, setMonthEntries] = useState([])
  const [dataLoading, setDataLoading] = useState(false)

  // Toast
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  const showToast = useCallback((msg) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 1800)
  }, [])

  // ─── 1. Fetch available periods / months on mount ────────────────────────────
  const fetchPeriods = useCallback(async () => {
    setPeriodsLoading(true)
    try {
      const res = await fetch('/api/affiliate/periods')
      if (res.ok) {
        const body = await res.json()
        setMonths(body.months || [])
        setAccounts(body.accounts || [])
        // Set default month to last (most recent) month available
        if (body.months && body.months.length > 0) {
          setSelectedMonth(body.months[0].monthKey)
        }
      }
    } catch {
      // ignore
    } finally {
      setPeriodsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPeriods()
  }, [fetchPeriods])

  // ─── 2. Fetch data whenever selectedMonth changes ───────────────────────────
  const fetchMonthData = useCallback(async (mKey) => {
    if (!mKey) {
      setMonthEntries([])
      return
    }
    setDataLoading(true)
    try {
      const res = await fetch(`/api/affiliate/data?month=${encodeURIComponent(mKey)}`)
      if (res.ok) {
        const body = await res.json()
        setMonthEntries(body.entries || [])
      } else {
        setMonthEntries([])
      }
    } catch {
      setMonthEntries([])
    } finally {
      setDataLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedMonth) {
      fetchMonthData(selectedMonth)
      // Set default date range for this month
      const [y, m] = selectedMonth.split('-').map(Number)
      if (y && m) {
        const lastDay = new Date(y, m, 0).getDate()
        setDateFrom(`${y}-${String(m).padStart(2, '0')}-01`)
        setDateTo(`${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`)
      }
    }
  }, [selectedMonth, fetchMonthData])

  // ─── Filter Accounts based on active platform & selected month ──────────────
  const availableAccounts = useMemo(() => {
    const accSet = new Set()
    monthEntries.forEach(entry => {
      if (activePlatform === 'semua' || entry.platform === activePlatform) {
        if (entry.account) accSet.add(entry.account)
      }
    })
    return Array.from(accSet).sort()
  }, [monthEntries, activePlatform])

  // Reset selectedAccount to 'ALL' if the selected account is no longer in availableAccounts
  useEffect(() => {
    if (selectedAccount !== 'ALL' && !availableAccounts.includes(selectedAccount)) {
      setSelectedAccount('ALL')
    }
  }, [availableAccounts, selectedAccount])

  // ─── Filter Shopee rows ─────────────────────────────────────────────────────
  const shopeeRows = useMemo(() => {
    const entries = monthEntries.filter(e => e.platform === 'shopee')
    const filteredEntries = selectedAccount === 'ALL'
      ? entries
      : entries.filter(e => e.account === selectedAccount)

    const rawRows = filteredEntries.flatMap(e => e.rows || [])
    if (dateMode === 'range' && dateFrom && dateTo) {
      const from = new Date(dateFrom + 'T00:00:00')
      const to = new Date(dateTo + 'T23:59:59')
      return rawRows.filter(r => {
        if (!r.dateIso) return true
        const d = new Date(r.dateIso)
        return d >= from && d <= to
      })
    }
    return rawRows
  }, [monthEntries, selectedAccount, dateMode, dateFrom, dateTo])

  // ─── Filter TikTok rows ─────────────────────────────────────────────────────
  const tiktokRows = useMemo(() => {
    const entries = monthEntries.filter(e => e.platform === 'tiktok')
    const filteredEntries = selectedAccount === 'ALL'
      ? entries
      : entries.filter(e => e.account === selectedAccount)

    const rawRows = filteredEntries.flatMap(e => e.rows || [])
    if (dateMode === 'range' && dateFrom && dateTo) {
      const from = new Date(dateFrom + 'T00:00:00')
      const to = new Date(dateTo + 'T23:59:59')
      return rawRows.filter(r => {
        if (!r.waktuKomisiDibayar) return true
        const d = new Date(r.waktuKomisiDibayar)
        return d >= from && d <= to
      })
    }
    return rawRows
  }, [monthEntries, selectedAccount, dateMode, dateFrom, dateTo])

  // ─── Entries for Semua (all stored datasets for this month) ─────────────────
  const shopeeAllEntries = useMemo(() => {
    return monthEntries.filter(e => e.platform === 'shopee')
  }, [monthEntries])

  const tiktokAllEntries = useMemo(() => {
    return monthEntries.filter(e => e.platform === 'tiktok')
  }, [monthEntries])

  const hasData = monthEntries.length > 0

  return (
    <AuthGate title="Affiliate">
      <div className="app-shell aff-page-shell">
        {/* ── Top Header ── */}
        <header className="app-header aff-top-header">
          <div>
            <p className="eyebrow">Dashboard penjualan</p>
            <h1>Affiliate</h1>
            <p className="aff-header-sub">
              {activePlatform === 'shopee'
                ? 'Analitik performa Shopee Affiliate'
                : activePlatform === 'tiktok'
                ? 'Analitik performa TikTok Shop Affiliate'
                : 'Ringkasan komprehensif Shopee & TikTok Shop Affiliate'}
            </p>
          </div>

          <div className="aff-header-actions">
            <Link href="/admin" className="btn-secondary aff-admin-link">
              Kelola Data di Admin →
            </Link>
          </div>
        </header>

        {/* ── Main Platform Switcher Tabs ── */}
        <div className="aff-platform-tabs">
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'shopee' ? 'is-active shopee' : ''}`}
            onClick={() => setActivePlatform('shopee')}
          >
            <span className="dot" style={{ background: '#ea580c' }} />
            Shopee
          </button>
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'tiktok' ? 'is-active tiktok' : ''}`}
            onClick={() => setActivePlatform('tiktok')}
          >
            <span className="dot" style={{ background: '#3B5BDB' }} />
            TikTok
          </button>
          <button
            type="button"
            className={`aff-plat-btn ${activePlatform === 'semua' ? 'is-active semua' : ''}`}
            onClick={() => setActivePlatform('semua')}
          >
            <span className="dot" style={{ background: '#7c3aed' }} />
            Semua
          </button>
        </div>

        {/* ── Filter Controls Bar ── */}
        <div className="aff-control-bar">
          {/* Filter A: Date picker */}
          <div className="aff-filter-group">
            <label className="aff-filter-label">Filter Waktu:</label>
            <div className="aff-toggle-group">
              <button
                type="button"
                className={`aff-toggle-btn ${dateMode === 'month' ? 'active' : ''}`}
                onClick={() => setDateMode('month')}
              >
                Bulan
              </button>
              <button
                type="button"
                className={`aff-toggle-btn ${dateMode === 'range' ? 'active' : ''}`}
                onClick={() => setDateMode('range')}
              >
                Rentang Tanggal
              </button>
            </div>

            {dateMode === 'month' ? (
              <select
                className="category-select aff-month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                disabled={months.length === 0}
              >
                {months.length === 0 ? (
                  <option value="">Belum ada periode tersimpan</option>
                ) : (
                  months.map((m) => (
                    <option key={m.monthKey} value={m.monthKey}>
                      {m.label}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <div className="aff-date-range-inputs">
                <input
                  type="date"
                  className="login-input aff-date-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  title="Dari Tanggal"
                />
                <span className="aff-date-sep">–</span>
                <input
                  type="date"
                  className="login-input aff-date-input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  title="Sampai Tanggal"
                />
              </div>
            )}
          </div>

          {/* Filter B: Akun / Pelanggan picker (only active for Shopee and TikTok tabs) */}
          {activePlatform !== 'semua' && (
            <div className="aff-filter-group">
              <label className="aff-filter-label">Akun / Pelanggan:</label>
              <select
                className="category-select aff-account-select"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
              >
                <option value="ALL">Semua Akun ({availableAccounts.length})</option>
                {availableAccounts.map((acc) => (
                  <option key={acc} value={acc}>
                    {acc}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activePlatform === 'semua' && (
            <div className="aff-filter-hint">
              <span>Agregasi seluruh akun Shopee &amp; TikTok tersimpan pada bulan ini</span>
            </div>
          )}
        </div>

        {/* ── Content View ── */}
        {periodsLoading || dataLoading ? (
          <div className="aff-loading-box">
            <div className="spinner" />
            <p className="loading-text">Memuat data affiliate…</p>
          </div>
        ) : !hasData ? (
          <div className="placeholder-block" style={{ marginTop: '2rem' }}>
            <div className="placeholder-icon">📊</div>
            <h3 className="placeholder-title">Belum ada data affiliate yang diunggah</h3>
            <p className="placeholder-sub">
              Silakan buka menu <strong>Admin → Data Affiliate</strong> untuk mengunggah laporan komisi Shopee atau TikTok Shop.
            </p>
            <Link href="/admin" className="btn-export" style={{ display: 'inline-block', marginTop: '1.25rem' }}>
              Buka Admin Data Affiliate
            </Link>
          </div>
        ) : (
          <>
            {activePlatform === 'shopee' && (
              <ShopeeDashboard rows={shopeeRows} onShowToast={showToast} />
            )}

            {activePlatform === 'tiktok' && (
              <TikTokDashboard rows={tiktokRows} onShowToast={showToast} />
            )}

            {activePlatform === 'semua' && (
              <SemuaDashboard
                shopeeEntries={shopeeAllEntries}
                tiktokEntries={tiktokAllEntries}
                onShowToast={showToast}
              />
            )}
          </>
        )}

        {/* ── Toast Notification for Copy ── */}
        <div className={`kpi-toast ${toastVisible ? 'show' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      </div>
    </AuthGate>
  )
}
