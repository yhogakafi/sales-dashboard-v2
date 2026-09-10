'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  normalizeShopeeData,
  normalizeTikTokData,
  filterTikTokRowsByMonth,
  labelToId,
  formatRupiah,
} from '@/lib/parseAffiliate'

export default function AffiliateTab() {
  // ─── Stored affiliate list state ────────────────────────────────────────────
  const [indexList, setIndexList] = useState([])
  const [loadingIndex, setLoadingIndex] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  // ─── Shopee Upload State ───────────────────────────────────────────────────
  const [shFile, setShFile] = useState(null)
  const [shLoading, setShLoading] = useState(false)
  const [shError, setShError] = useState(null)
  const [shParsed, setShParsed] = useState(null) // { rows, stats, detectedMonth }

  // Shopee Save options
  const [shPeriodMode, setShPeriodMode] = useState('new') // 'new' | 'existing'
  const [shNewPeriodLabel, setShNewPeriodLabel] = useState('')
  const [shSelectedPeriodKey, setShSelectedPeriodKey] = useState('')
  const [shAccountMode, setShAccountMode] = useState('new') // 'new' | 'existing'
  const [shNewAccount, setShNewAccount] = useState('')
  const [shSelectedAccount, setShSelectedAccount] = useState('')
  const [shSaveStatus, setShSaveStatus] = useState('idle') // 'idle' | 'saving' | 'done' | 'error'
  const [shSaveMessage, setShSaveMessage] = useState(null)

  // ─── TikTok Upload State ───────────────────────────────────────────────────
  const [ttFile, setTtFile] = useState(null)
  const [ttLoading, setTtLoading] = useState(false)
  const [ttError, setTtError] = useState(null)
  const [ttRawParsed, setTtRawParsed] = useState(null) // { rows, detectedMonths }
  const [ttSelectedMonthKey, setTtSelectedMonthKey] = useState('')

  // TikTok Save options
  const [ttPeriodMode, setTtPeriodMode] = useState('new') // 'new' | 'existing'
  const [ttNewPeriodLabel, setTtNewPeriodLabel] = useState('')
  const [ttSelectedPeriodKey, setTtSelectedPeriodKey] = useState('')
  const [ttAccountMode, setTtAccountMode] = useState('new') // 'new' | 'existing'
  const [ttNewAccount, setTtNewAccount] = useState('')
  const [ttSelectedAccount, setTtSelectedAccount] = useState('')
  const [ttSaveStatus, setTtSaveStatus] = useState('idle')
  const [ttSaveMessage, setTtSaveMessage] = useState(null)

  const shInputRef = useRef(null)
  const ttInputRef = useRef(null)

  // ─── Fetch Stored Datasets ─────────────────────────────────────────────────
  const fetchIndex = useCallback(async () => {
    setLoadingIndex(true)
    try {
      const res = await fetch('/api/affiliate/periods')
      if (res.ok) {
        const body = await res.json()
        setIndexList(body.index || [])
      }
    } catch {
      // ignore
    } finally {
      setLoadingIndex(false)
    }
  }, [])

  useEffect(() => {
    fetchIndex()
  }, [fetchIndex])

  // ─── Derived unique periods and accounts from index ─────────────────────────
  const existingPeriods = useMemo(() => {
    const map = new Map()
    indexList.forEach(item => {
      const key = item.periodLabel || item.periodId
      if (key && !map.has(key)) {
        map.set(key, {
          periodId: item.periodId,
          periodLabel: item.periodLabel,
          monthKey: item.monthKey,
        })
      }
    })
    return Array.from(map.values())
  }, [indexList])

  const existingAccounts = useMemo(() => {
    const accs = new Set()
    indexList.forEach(item => {
      if (item.account) accs.add(item.account)
    })
    return Array.from(accs).sort()
  }, [indexList])

  // ─── Shopee File Handler ───────────────────────────────────────────────────
  const handleShopeeFile = async (file) => {
    if (!file) return
    setShFile(file)
    setShError(null)
    setShLoading(true)
    setShSaveStatus('idle')
    setShSaveMessage(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const firstSheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })

      if (!data || data.length === 0) {
        throw new Error('File tidak memiliki data atau format tidak sesuai.')
      }

      const parsed = normalizeShopeeData(data)
      setShParsed(parsed)

      // Auto pre-fill period label from detected month
      if (parsed.detectedMonth) {
        setShNewPeriodLabel(parsed.detectedMonth.label)
      } else {
        setShNewPeriodLabel('')
      }
    } catch (err) {
      setShError(err.message || 'Gagal membaca file Shopee.')
      setShParsed(null)
    } finally {
      setShLoading(false)
    }
  }

  // ─── Shopee Save Handler ───────────────────────────────────────────────────
  const handleSaveShopee = async () => {
    if (!shParsed || !shParsed.rows.length) return
    setShSaveStatus('saving')
    setShSaveMessage(null)

    const periodLabel = shPeriodMode === 'existing'
      ? shSelectedPeriodKey
      : shNewPeriodLabel.trim()

    const account = shAccountMode === 'existing'
      ? shSelectedAccount
      : shNewAccount.trim()

    if (!periodLabel) {
      setShSaveStatus('error')
      setShSaveMessage('Nama periode bulanan tidak boleh kosong.')
      return
    }

    if (!account) {
      setShSaveStatus('error')
      setShSaveMessage('Nama akun / pelanggan tidak boleh kosong.')
      return
    }

    const periodId = labelToId(periodLabel)
    const monthKey = shParsed.detectedMonth?.monthKey || periodId

    try {
      const payload = {
        platform: 'shopee',
        periodId,
        periodLabel,
        monthKey,
        account,
        fileName: shFile?.name || 'shopee.xlsx',
        rows: shParsed.rows,
        stats: shParsed.stats,
      }

      const res = await fetch('/api/affiliate/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal menyimpan data ke Vercel.')

      setShSaveStatus('done')
      setShSaveMessage(`Berhasil menyimpan data Shopee untuk periode "${periodLabel}" (Akun: ${account})!`)
      await fetchIndex()
    } catch (err) {
      setShSaveStatus('error')
      setShSaveMessage(err.message || 'Gagal menyimpan data.')
    }
  }

  // ─── TikTok File Handler ───────────────────────────────────────────────────
  const handleTikTokFile = async (file) => {
    if (!file) return
    setTtFile(file)
    setTtError(null)
    setTtLoading(true)
    setTtSaveStatus('idle')
    setTtSaveMessage(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const firstSheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })

      if (!data || data.length === 0) {
        throw new Error('File tidak memiliki data atau format tidak sesuai.')
      }

      const normalized = normalizeTikTokData(data)
      setTtRawParsed(normalized)

      // Detect first month available from Waktu Komisi Dibayar
      if (normalized.detectedMonths && normalized.detectedMonths.length > 0) {
        const firstMonth = normalized.detectedMonths[0]
        setTtSelectedMonthKey(firstMonth.monthKey)
        setTtNewPeriodLabel(firstMonth.label)
      } else {
        setTtSelectedMonthKey('')
        setTtNewPeriodLabel('')
      }
    } catch (err) {
      setTtError(err.message || 'Gagal membaca file TikTok.')
      setTtRawParsed(null)
    } finally {
      setTtLoading(false)
    }
  }

  // When selected month dropdown changes in TikTok:
  const handleTikTokMonthChange = (mKey) => {
    setTtSelectedMonthKey(mKey)
    const found = ttRawParsed?.detectedMonths?.find(m => m.monthKey === mKey)
    if (found) {
      setTtNewPeriodLabel(found.label)
    }
  }

  // Filter TikTok rows for preview & saving based on selected month
  const ttFilteredData = useMemo(() => {
    if (!ttRawParsed || !ttRawParsed.rows.length) return null
    return filterTikTokRowsByMonth(ttRawParsed.rows, ttSelectedMonthKey)
  }, [ttRawParsed, ttSelectedMonthKey])

  // ─── TikTok Save Handler ───────────────────────────────────────────────────
  const handleSaveTikTok = async () => {
    if (!ttFilteredData || !ttFilteredData.filteredRows.length) return
    setTtSaveStatus('saving')
    setTtSaveMessage(null)

    const periodLabel = ttPeriodMode === 'existing'
      ? ttSelectedPeriodKey
      : ttNewPeriodLabel.trim()

    const account = ttAccountMode === 'existing'
      ? ttSelectedAccount
      : ttNewAccount.trim()

    if (!periodLabel) {
      setTtSaveStatus('error')
      setTtSaveMessage('Nama periode bulanan tidak boleh kosong.')
      return
    }

    if (!account) {
      setTtSaveStatus('error')
      setTtSaveMessage('Nama akun / pelanggan tidak boleh kosong.')
      return
    }

    const periodId = labelToId(periodLabel)
    const monthKey = ttSelectedMonthKey || periodId

    try {
      const payload = {
        platform: 'tiktok',
        periodId,
        periodLabel,
        monthKey,
        account,
        fileName: ttFile?.name || 'tiktok.xlsx',
        rows: ttFilteredData.filteredRows,
        stats: ttFilteredData.stats,
      }

      const res = await fetch('/api/affiliate/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal menyimpan data TikTok ke Vercel.')

      setTtSaveStatus('done')
      setTtSaveMessage(`Berhasil menyimpan data TikTok untuk periode "${periodLabel}" (Akun: ${account})!`)
      await fetchIndex()
    } catch (err) {
      setTtSaveStatus('error')
      setTtSaveMessage(err.message || 'Gagal menyimpan data TikTok.')
    }
  }

  // ─── Delete dataset handler ────────────────────────────────────────────────
  const handleDelete = async (id, periodLabel, account, platform) => {
    if (!confirm(`Hapus data ${platform.toUpperCase()} untuk "${periodLabel}" (Akun: ${account})? Data yang sudah dihapus tidak bisa dikembalikan.`)) {
      return
    }
    setDeletingId(id)
    try {
      const res = await fetch(`/api/affiliate/data?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus data.')
      await fetchIndex()
    } catch (err) {
      alert(err.message || 'Gagal menghapus data.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="aff-admin-wrap">
      {/* ── 1. Stored Data Table ── */}
      <div className="table-block period-list-block" style={{ marginBottom: '2rem' }}>
        <div className="table-block-header">
          <div>
            <h3 className="block-title">Data Affiliate Tersimpan di Vercel</h3>
            <p className="aff-card-sub" style={{ margin: '2px 0 0' }}>
              Data ini akan ditampilkan di menu Affiliate utama berdasarkan bulan dan akun/pelanggan.
            </p>
          </div>
          {loadingIndex && <span className="assign-progress">Memuat data…</span>}
        </div>

        {!loadingIndex && indexList.length === 0 && (
          <p className="assign-hint">Belum ada data affiliate yang tersimpan. Silakan upload file Shopee atau TikTok di bawah.</p>
        )}

        {indexList.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Periode Bulan</th>
                  <th>Nama Akun / Pelanggan</th>
                  <th style={{ textAlign: 'right' }}>Jumlah Baris</th>
                  <th style={{ textAlign: 'right' }}>Total GMV</th>
                  <th style={{ textAlign: 'right' }}>Pengeluaran</th>
                  <th>Nama File</th>
                  <th>Diunggah</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {indexList.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className={`aff-badge ${item.platform === 'shopee' ? 'aff-badge-shopee' : 'aff-badge-tiktok'}`}>
                        {item.platform === 'shopee' ? 'Shopee' : 'TikTok'}
                      </span>
                    </td>
                    <td><strong>{item.periodLabel}</strong></td>
                    <td style={{ fontWeight: 600 }}>{item.account}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {(item.rowCount || item.stats?.orders || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatRupiah(item.stats?.gmv || 0)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {formatRupiah(item.stats?.expense || 0)}
                    </td>
                    <td className="muted" style={{ fontSize: '12px' }}>{item.fileName || '—'}</td>
                    <td className="muted mono" style={{ fontSize: '11px' }}>
                      {item.uploadedAt ? new Date(item.uploadedAt).toLocaleString('id-ID') : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-delete"
                        disabled={deletingId === item.id}
                        onClick={() => handleDelete(item.id, item.periodLabel, item.account, item.platform)}
                      >
                        {deletingId === item.id ? 'Menghapus…' : 'Hapus'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 2. Two Upload Cards: Shopee & TikTok ── */}
      <div className="aff-upload-cards-grid">
        {/* ─── CARD 1: SHOPEE UPLOAD ─── */}
        <div className="aff-upload-card aff-card-border-shopee">
          <div className="aff-upload-card-top">
            <div className="aff-upload-badge aff-badge-shopee">Shopee Affiliate</div>
            <h3 className="aff-upload-card-title">Unggah Laporan Shopee</h3>
            <p className="aff-upload-card-desc">
              Unggah file ekspor laporan komisi Shopee (.xlsx, .xls, .csv).
            </p>
          </div>

          <div
            className="aff-dropzone"
            onClick={() => shInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (e.dataTransfer.files?.[0]) handleShopeeFile(e.dataTransfer.files[0])
            }}
          >
            <input
              type="file"
              ref={shInputRef}
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleShopeeFile(e.target.files[0])
              }}
            />
            <div className="aff-dropzone-icon">📁</div>
            <p className="aff-dropzone-text">
              {shFile ? shFile.name : 'Klik atau seret file laporan Shopee ke sini'}
            </p>
            <span className="aff-dropzone-hint">Format didukung: .xlsx, .xls, .csv</span>
          </div>

          {shLoading && <p className="loading-text" style={{ marginTop: '1rem' }}>Menganalisis file Shopee…</p>}
          {shError && <p className="upload-error" style={{ marginTop: '1rem' }}>{shError}</p>}

          {/* Shopee Preview & Options */}
          {shParsed && (
            <div className="aff-preview-box">
              <h4 className="aff-preview-title">Ringkasan Data Shopee:</h4>
              <div className="aff-mini-metrics">
                <div><span>Total Pesanan:</span> <strong>{shParsed.stats.orders.toLocaleString('id-ID')}</strong></div>
                <div><span>Total GMV:</span> <strong>{formatRupiah(shParsed.stats.gmv)}</strong></div>
                <div><span>Pengeluaran:</span> <strong>{formatRupiah(shParsed.stats.expense)}</strong></div>
                <div><span>Expense Ratio:</span> <strong>{shParsed.stats.ratio}%</strong></div>
                <div><span>Jumlah Baris:</span> <strong>{shParsed.rows.length.toLocaleString('id-ID')} baris</strong></div>
              </div>

              {/* Option: Monthly period name */}
              <div className="aff-form-group" style={{ marginTop: '1rem' }}>
                <label className="aff-form-label">Simpan ke Periode Bulanan:</label>
                <div className="period-save-options">
                  <label className={`period-save-option ${shPeriodMode === 'new' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="shPeriodMode"
                      value="new"
                      checked={shPeriodMode === 'new'}
                      onChange={() => setShPeriodMode('new')}
                    />
                    <span>Periode baru</span>
                  </label>
                  <label className={`period-save-option ${shPeriodMode === 'existing' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="shPeriodMode"
                      value="existing"
                      checked={shPeriodMode === 'existing'}
                      onChange={() => setShPeriodMode('existing')}
                      disabled={existingPeriods.length === 0}
                    />
                    <span>Perbarui periode yang ada</span>
                  </label>
                </div>

                {shPeriodMode === 'new' ? (
                  <input
                    type="text"
                    className="login-input"
                    placeholder="Contoh: Juni 2026, Juli 2026…"
                    value={shNewPeriodLabel}
                    onChange={(e) => setShNewPeriodLabel(e.target.value)}
                  />
                ) : (
                  <select
                    className="category-select"
                    value={shSelectedPeriodKey}
                    onChange={(e) => setShSelectedPeriodKey(e.target.value)}
                  >
                    <option value="">Pilih periode…</option>
                    {existingPeriods.map(p => (
                      <option key={p.periodLabel} value={p.periodLabel}>
                        {p.periodLabel}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Option: Nama Akun / Pelanggan */}
              <div className="aff-form-group" style={{ marginTop: '1rem' }}>
                <label className="aff-form-label">Nama Akun / Pelanggan:</label>
                <div className="period-save-options">
                  <label className={`period-save-option ${shAccountMode === 'new' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="shAccountMode"
                      value="new"
                      checked={shAccountMode === 'new'}
                      onChange={() => setShAccountMode('new')}
                    />
                    <span>Akun baru</span>
                  </label>
                  <label className={`period-save-option ${shAccountMode === 'existing' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="shAccountMode"
                      value="existing"
                      checked={shAccountMode === 'existing'}
                      onChange={() => setShAccountMode('existing')}
                      disabled={existingAccounts.length === 0}
                    />
                    <span>Gunakan akun yang sudah ada</span>
                  </label>
                </div>

                {shAccountMode === 'new' ? (
                  <input
                    type="text"
                    className="login-input"
                    placeholder="Contoh: Toko Scelta Utama, Akun 2…"
                    value={shNewAccount}
                    onChange={(e) => setShNewAccount(e.target.value)}
                  />
                ) : (
                  <select
                    className="category-select"
                    value={shSelectedAccount}
                    onChange={(e) => setShSelectedAccount(e.target.value)}
                  >
                    <option value="">Pilih akun…</option>
                    {existingAccounts.map(acc => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Submit button */}
              <button
                type="button"
                className="btn-export"
                style={{ width: '100%', marginTop: '1.25rem', background: '#ea580c' }}
                disabled={shSaveStatus === 'saving'}
                onClick={handleSaveShopee}
              >
                {shSaveStatus === 'saving' ? 'Menyimpan ke Vercel…' : 'Simpan Data Shopee'}
              </button>

              {shSaveStatus === 'done' && <p className="assign-progress" style={{ color: '#16a34a', marginTop: '8px' }}>{shSaveMessage}</p>}
              {shSaveStatus === 'error' && <p className="upload-error" style={{ marginTop: '8px' }}>{shSaveMessage}</p>}
            </div>
          )}
        </div>

        {/* ─── CARD 2: TIKTOK UPLOAD ─── */}
        <div className="aff-upload-card aff-card-border-tiktok">
          <div className="aff-upload-card-top">
            <div className="aff-upload-badge aff-badge-tiktok">TikTok Shop Affiliate</div>
            <h3 className="aff-upload-card-title">Unggah Laporan TikTok</h3>
            <p className="aff-upload-card-desc">
              Sistem akan mendeteksi bulan transaksi dari kolom <strong>Waktu Komisi Dibayar</strong>.
            </p>
          </div>

          <div
            className="aff-dropzone"
            onClick={() => ttInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (e.dataTransfer.files?.[0]) handleTikTokFile(e.dataTransfer.files[0])
            }}
          >
            <input
              type="file"
              ref={ttInputRef}
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleTikTokFile(e.target.files[0])
              }}
            />
            <div className="aff-dropzone-icon">📁</div>
            <p className="aff-dropzone-text">
              {ttFile ? ttFile.name : 'Klik atau seret file laporan TikTok ke sini'}
            </p>
            <span className="aff-dropzone-hint">Format didukung: .xlsx, .xls, .csv</span>
          </div>

          {ttLoading && <p className="loading-text" style={{ marginTop: '1rem' }}>Menganalisis file TikTok…</p>}
          {ttError && <p className="upload-error" style={{ marginTop: '1rem' }}>{ttError}</p>}

          {/* TikTok Month Selection & Preview */}
          {ttRawParsed && (
            <div className="aff-preview-box">
              {/* Detected months selector */}
              <div className="aff-form-group">
                <label className="aff-form-label" style={{ color: '#3B5BDB', fontWeight: 700 }}>
                  Bulan Terdeteksi di File (Pilih yang Ingin Disimpan):
                </label>
                <select
                  className="category-select"
                  value={ttSelectedMonthKey}
                  onChange={(e) => handleTikTokMonthChange(e.target.value)}
                  style={{ borderColor: '#3B5BDB', fontWeight: 600 }}
                >
                  {ttRawParsed.detectedMonths.map((m, idx) => (
                    <option key={m.monthKey} value={m.monthKey}>
                      {idx === 0 ? `★ [Bulan Pertama] ${m.label} (${m.count.toLocaleString('id-ID')} transaksi)` : `${m.label} (${m.count.toLocaleString('id-ID')} transaksi)`}
                    </option>
                  ))}
                </select>
                <span className="aff-form-hint">
                  Otomatis mendeteksi bulan pertama yang tersedia dari kolom Waktu Komisi Dibayar.
                </span>
              </div>

              {/* Preview metrics for chosen month */}
              {ttFilteredData && (
                <div className="aff-mini-metrics" style={{ marginTop: '10px' }}>
                  <div><span>Total Orders:</span> <strong>{ttFilteredData.stats.orders.toLocaleString('id-ID')}</strong></div>
                  <div><span>GMV:</span> <strong>{formatRupiah(ttFilteredData.stats.gmv)}</strong></div>
                  <div><span>Expenses:</span> <strong>{formatRupiah(ttFilteredData.stats.expense)}</strong></div>
                  <div><span>Expense Ratio:</span> <strong>{ttFilteredData.stats.ratio}%</strong></div>
                  <div><span>Jumlah Baris:</span> <strong>{ttFilteredData.filteredRows.length.toLocaleString('id-ID')} baris</strong></div>
                </div>
              )}

              {/* Option: Monthly period name */}
              <div className="aff-form-group" style={{ marginTop: '1rem' }}>
                <label className="aff-form-label">Simpan ke Periode Bulanan:</label>
                <div className="period-save-options">
                  <label className={`period-save-option ${ttPeriodMode === 'new' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="ttPeriodMode"
                      value="new"
                      checked={ttPeriodMode === 'new'}
                      onChange={() => setTtPeriodMode('new')}
                    />
                    <span>Periode baru</span>
                  </label>
                  <label className={`period-save-option ${ttPeriodMode === 'existing' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="ttPeriodMode"
                      value="existing"
                      checked={ttPeriodMode === 'existing'}
                      onChange={() => setTtPeriodMode('existing')}
                      disabled={existingPeriods.length === 0}
                    />
                    <span>Perbarui periode yang ada</span>
                  </label>
                </div>

                {ttPeriodMode === 'new' ? (
                  <input
                    type="text"
                    className="login-input"
                    placeholder="Contoh: Juni 2026, Juli 2026…"
                    value={ttNewPeriodLabel}
                    onChange={(e) => setTtNewPeriodLabel(e.target.value)}
                  />
                ) : (
                  <select
                    className="category-select"
                    value={ttSelectedPeriodKey}
                    onChange={(e) => setTtSelectedPeriodKey(e.target.value)}
                  >
                    <option value="">Pilih periode…</option>
                    {existingPeriods.map(p => (
                      <option key={p.periodLabel} value={p.periodLabel}>
                        {p.periodLabel}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Option: Nama Akun / Pelanggan */}
              <div className="aff-form-group" style={{ marginTop: '1rem' }}>
                <label className="aff-form-label">Nama Akun / Pelanggan:</label>
                <div className="period-save-options">
                  <label className={`period-save-option ${ttAccountMode === 'new' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="ttAccountMode"
                      value="new"
                      checked={ttAccountMode === 'new'}
                      onChange={() => setTtAccountMode('new')}
                    />
                    <span>Akun baru</span>
                  </label>
                  <label className={`period-save-option ${ttAccountMode === 'existing' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="ttAccountMode"
                      value="existing"
                      checked={ttAccountMode === 'existing'}
                      onChange={() => setTtAccountMode('existing')}
                      disabled={existingAccounts.length === 0}
                    />
                    <span>Gunakan akun yang sudah ada</span>
                  </label>
                </div>

                {ttAccountMode === 'new' ? (
                  <input
                    type="text"
                    className="login-input"
                    placeholder="Contoh: Toko Scelta TikTok, Akun 2…"
                    value={ttNewAccount}
                    onChange={(e) => setTtNewAccount(e.target.value)}
                  />
                ) : (
                  <select
                    className="category-select"
                    value={ttSelectedAccount}
                    onChange={(e) => setTtSelectedAccount(e.target.value)}
                  >
                    <option value="">Pilih akun…</option>
                    {existingAccounts.map(acc => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Submit button */}
              <button
                type="button"
                className="btn-export"
                style={{ width: '100%', marginTop: '1.25rem', background: '#3B5BDB' }}
                disabled={ttSaveStatus === 'saving'}
                onClick={handleSaveTikTok}
              >
                {ttSaveStatus === 'saving' ? 'Menyimpan ke Vercel…' : 'Simpan Data TikTok'}
              </button>

              {ttSaveStatus === 'done' && <p className="assign-progress" style={{ color: '#16a34a', marginTop: '8px' }}>{ttSaveMessage}</p>}
              {ttSaveStatus === 'error' && <p className="upload-error" style={{ marginTop: '8px' }}>{ttSaveMessage}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
