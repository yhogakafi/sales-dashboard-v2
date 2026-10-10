'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  parseLiveWorkbook,
  mergeLiveSessions,
  summarizeSessions,
  slugifyCustomerId,
  slugifyPeriodId,
} from '@/lib/parseLaporanLive'

const COMMON_CUSTOMER_PRESETS = [
  'SHOPEE / SCELTA',
  'SHOPEE / GRAPE',
  'SHOPEE / GROSIR DALAMANKU',
  'SHOPEE / TAFT',
  'SHOPEE / RASENDRIYA',
  'SHOPEE / INSPORT IDN',
  'TIKTOK SHOP / SCELTA',
  'TIKTOK SHOP / GRAPE',
  'LAZADA / SCELTA',
]

function fmtRp(n) {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
}

export default function LaporanLiveTab() {
  const [indexData, setIndexData] = useState({ customers: [] })
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [deletingKey, setDeletingKey] = useState(null)

  // Step 1: Customer
  const [customerName, setCustomerName] = useState('SHOPEE / SCELTA')

  // Step 2: Period Mode ('new' | 'overwrite')
  const [saveMode, setSaveMode] = useState('new')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [newPeriodLabel, setNewPeriodLabel] = useState('')

  // Step 3: Files & Preview
  const [selectedFiles, setSelectedFiles] = useState([])
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState(null)
  const [previewData, setPreviewData] = useState(null)

  // Step 4: Publish
  const [publishing, setPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(null)
  const [publishError, setPublishError] = useState(null)

  const fileInputRef = useRef(null)

  const fetchIndex = useCallback(async () => {
    setLoadingIndex(true)
    try {
      const res = await fetch('/api/laporan-live/index')
      if (res.ok) {
        const body = await res.json()
        setIndexData(body)
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

  // Get current customer's existing periods
  const currentCustId = slugifyCustomerId(customerName)
  const currentCustObj = indexData.customers?.find((c) => c.id === currentCustId)
  const existingPeriods = currentCustObj?.periods || []

  // If customer changes and saveMode is overwrite, reset or select first existing period
  useEffect(() => {
    if (saveMode === 'overwrite') {
      if (existingPeriods.length > 0 && !existingPeriods.some((p) => p.id === selectedPeriodId)) {
        setSelectedPeriodId(existingPeriods[0].id)
      } else if (existingPeriods.length === 0) {
        setSelectedPeriodId('')
      }
    }
  }, [customerName, existingPeriods, saveMode, selectedPeriodId])

  // Handle files selection
  const handleFilesChosen = async (files) => {
    if (!files || files.length === 0) return
    const fileList = Array.from(files)
    setSelectedFiles(fileList)
    setParseError(null)
    setPublishSuccess(null)
    setPublishError(null)
    setParsing(true)

    try {
      const fileResults = []
      for (const f of fileList) {
        const buffer = await f.arrayBuffer()
        const rows = parseLiveWorkbook(buffer, f.name)
        fileResults.push({ name: f.name, rows })
      }

      const mergedRows = mergeLiveSessions(fileResults)
      if (mergedRows.length === 0) {
        throw new Error('Tidak ada baris data sesi livestream yang valid ditemukan di file yang dipilih.')
      }

      const sorted = [...mergedRows].sort((a, b) => a.startTimestamp - b.startTimestamp)
      const dateRange = `${sorted[0].dateKey} – ${sorted[sorted.length - 1].dateKey}`

      const periodeSet = Array.from(new Set(mergedRows.map((r) => r.periode).filter(Boolean)))
      const detectedPeriod = periodeSet.length > 0 ? periodeSet[0] : `Periode ${dateRange}`

      const summary = summarizeSessions(mergedRows)
      const astridRows = mergedRows.filter((r) => r.host === 'Astrid')
      const fifiRows = mergedRows.filter((r) => r.host === 'Fifi')

      setPreviewData({
        rows: mergedRows,
        count: mergedRows.length,
        dateRange,
        detectedPeriod,
        summary,
        astridCount: astridRows.length,
        fifiCount: fifiRows.length,
        sourceFiles: fileList.map((f) => f.name),
      })

      // Suggest period label if not already typed
      if (!newPeriodLabel) {
        setNewPeriodLabel(detectedPeriod)
      }
    } catch (err) {
      setParseError(err.message || 'Gagal memproses file Excel.')
      setPreviewData(null)
    } finally {
      setParsing(false)
    }
  }

  // Handle Publish / Save
  const handlePublish = async () => {
    if (!previewData || !previewData.rows?.length) {
      setPublishError('Pilih dan proses file Excel terlebih dahulu.')
      return
    }

    if (!customerName.trim()) {
      setPublishError('Nama pelanggan wajib diisi atau dipilih.')
      return
    }

    let finalPeriodLabel = ''
    let finalPeriodId = ''

    if (saveMode === 'overwrite') {
      const target = existingPeriods.find((p) => p.id === selectedPeriodId)
      if (!target) {
        setPublishError('Pilih periode yang ingin ditimpa/diganti.')
        return
      }
      finalPeriodLabel = target.label
      finalPeriodId = target.id
    } else {
      if (!newPeriodLabel.trim()) {
        setPublishError('Nama / label periode baru tidak boleh kosong.')
        return
      }
      finalPeriodLabel = newPeriodLabel.trim()
      finalPeriodId = slugifyPeriodId(finalPeriodLabel)
    }

    setPublishing(true)
    setPublishError(null)
    setPublishSuccess(null)

    try {
      const res = await fetch('/api/laporan-live/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          periodId: finalPeriodId,
          periodLabel: finalPeriodLabel,
          dateRange: previewData.dateRange,
          rows: previewData.rows,
          sourceFiles: previewData.sourceFiles,
          dayOverrides: {},
          sessionOverrides: {},
        }),
      })

      const body = await res.json()
      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Gagal menyimpan dan mempublikasikan data.')
      }

      setPublishSuccess(`Berhasil! Data periode "${finalPeriodLabel}" untuk pelanggan "${customerName}" telah tersimpan & siap dilihat di menu Laporan Live.`)
      setSelectedFiles([])
      setPreviewData(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchIndex()
    } catch (err) {
      setPublishError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  // Handle Delete period
  const handleDeletePeriod = async (cust, period) => {
    if (!confirm(`Hapus periode "${period.label}" milik pelanggan "${cust.name}"? Data yang sudah dihapus tidak dapat dikembalikan.`)) {
      return
    }

    const key = `${cust.id}__${period.id}`
    setDeletingKey(key)

    try {
      const res = await fetch(`/api/laporan-live/period?customerId=${encodeURIComponent(cust.id)}&periodId=${encodeURIComponent(period.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Gagal menghapus periode.')
      }
      await fetchIndex()
    } catch (err) {
      alert(err.message)
    } finally {
      setDeletingKey(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Block 1: Saved Periods Table ── */}
      <div className="table-block period-list-block">
        <div className="table-block-header">
          <div>
            <h3 className="block-title" style={{ margin: 0 }}>Periode Laporan Live Tersimpan</h3>
            <p className="assign-hint" style={{ marginTop: '4px', marginBottom: 0 }}>
              Daftar periode live streaming per pelanggan yang telah disimpan di database/storage.
            </p>
          </div>
          <button
            type="button"
            className="pill-btn"
            onClick={fetchIndex}
            disabled={loadingIndex}
          >
            {loadingIndex ? 'Memuat…' : 'Perbarui Daftar'}
          </button>
        </div>

        {loadingIndex && <p className="loading-text">Memuat data periode tersimpan…</p>}

        {!loadingIndex && (!indexData.customers || indexData.customers.length === 0) && (
          <div
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              color: '#92400E',
              marginTop: '1rem',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>Belum ada data periode laporan live.</p>
            <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
              Silakan unggah file Excel live streaming pada formulir di bawah ini.
            </p>
          </div>
        )}

        {!loadingIndex && indexData.customers?.length > 0 && (
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nama Pelanggan</th>
                  <th>Label Periode</th>
                  <th>Rentang Tanggal</th>
                  <th>Total Sesi</th>
                  <th>Total Penjualan</th>
                  <th>Terakhir Diperbarui</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {indexData.customers.map((cust) =>
                  cust.periods?.map((p) => {
                    const isDeleting = deletingKey === `${cust.id}__${p.id}`
                    return (
                      <tr key={`${cust.id}__${p.id}`}>
                        <td>
                          <span
                            style={{
                              background: '#FEF9C3',
                              color: '#854D0E',
                              border: '1px solid #FEF08A',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            {cust.name}
                          </span>
                        </td>
                        <td>
                          <strong>{p.label}</strong>
                        </td>
                        <td className="muted">{p.dateRange || '—'}</td>
                        <td className="mono">{p.totalSessions} sesi</td>
                        <td className="mono" style={{ fontWeight: 600, color: '#15803D' }}>
                          {fmtRp(p.totalPenjualan)}
                        </td>
                        <td className="muted mono" style={{ fontSize: '11.5px' }}>
                          {p.updatedAt ? new Date(p.updatedAt).toLocaleString('id-ID') : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <a
                              href={`/laporan-live?cust=${encodeURIComponent(cust.id)}&p=${encodeURIComponent(p.id)}`}
                              className="pill-btn"
                              style={{
                                textDecoration: 'none',
                                fontSize: '11.5px',
                                padding: '4px 8px',
                                color: '#854D0E',
                              }}
                            >
                              Lihat ↗
                            </a>
                            <button
                              type="button"
                              className="btn-delete"
                              onClick={() => handleDeletePeriod(cust, p)}
                              disabled={isDeleting}
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                            >
                              {isDeleting ? 'Menghapus…' : 'Hapus'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Block 2: Upload Zone Form ── */}
      <div className="table-block">
        <h3 className="block-title">Unggah Data Laporan Live Streaming Baru</h3>
        <p className="assign-hint" style={{ marginBottom: '1.25rem' }}>
          Tentukan pelanggan dan pilih apakah ingin membuat periode baru atau menimpa periode yang sudah ada, lalu unggah file Excel live streaming (format <code>.xlsx</code> atau <code>.xls</code>).
        </p>

        {/* Step 1: Customer Name */}
        <div style={{ marginBottom: '1.5rem', background: '#FFFDF0', padding: '16px', borderRadius: '10px', border: '1px solid #FEF08A' }}>
          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#451A03', marginBottom: '8px' }}>
            1. Tentukan Nama Pelanggan (Marketplace / Brand)
          </label>
          <p className="assign-hint" style={{ marginBottom: '8px', fontSize: '12.5px' }}>
            Pilih preset cepat atau ketik nama pelanggan secara bebas:
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {COMMON_CUSTOMER_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCustomerName(preset)}
                style={{
                  background: customerName === preset ? '#FEF08A' : '#FFFFFF',
                  border: customerName === preset ? '1.5px solid #EAB308' : '1px solid #E2E8F0',
                  color: customerName === preset ? '#713F12' : '#4B5563',
                  fontWeight: customerName === preset ? 700 : 500,
                  fontSize: '12px',
                  padding: '5px 11px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Contoh: SHOPEE / SCELTA"
              className="login-input"
              style={{ width: '100%', maxWidth: '420px', padding: '8px 12px', fontSize: '13.5px' }}
            />
            <span style={{ fontSize: '12px', color: '#78716C' }}>
              {existingPeriods.length > 0
                ? `● Ada ${existingPeriods.length} periode tersimpan untuk pelanggan ini`
                : '○ Belum ada periode untuk pelanggan ini'}
            </span>
          </div>
        </div>

        {/* Step 2: Choose Period Mode */}
        <div style={{ marginBottom: '1.5rem', background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#451A03', marginBottom: '8px' }}>
            2. Tentukan Mode Periode
          </label>

          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 600 }}>
              <input
                type="radio"
                name="liveSaveMode"
                value="new"
                checked={saveMode === 'new'}
                onChange={() => setSaveMode('new')}
              />
              <span>Buat Periode Baru</span>
            </label>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: existingPeriods.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: '13.5px',
                fontWeight: 600,
                opacity: existingPeriods.length > 0 ? 1 : 0.5,
              }}
            >
              <input
                type="radio"
                name="liveSaveMode"
                value="overwrite"
                disabled={existingPeriods.length === 0}
                checked={saveMode === 'overwrite'}
                onChange={() => setSaveMode('overwrite')}
              />
              <span>Ganti / Timpa Periode Yang Sudah Ada {existingPeriods.length === 0 ? '(Belum ada periode)' : ''}</span>
            </label>
          </div>

          {saveMode === 'new' ? (
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', color: '#78716C', marginBottom: '4px' }}>
                Nama / Label Periode Baru:
              </label>
              <input
                type="text"
                value={newPeriodLabel}
                onChange={(e) => setNewPeriodLabel(e.target.value)}
                placeholder="Contoh: September 2026 atau 01-09-2026 - 30-09-2026"
                className="login-input"
                style={{ width: '100%', maxWidth: '420px', padding: '8px 12px', fontSize: '13.5px' }}
              />
              <p className="assign-hint" style={{ marginTop: '4px', marginBottom: 0 }}>
                Jika dikosongkan saat memilih file, sistem akan otomatis mendeteksi dari kolom Periode Data di Excel.
              </p>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', color: '#78716C', marginBottom: '4px' }}>
                Pilih Periode Yang Akan Diganti / Ditimpa:
              </label>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="category-select"
                style={{ width: '100%', maxWidth: '420px', padding: '8px 12px', fontSize: '13.5px' }}
              >
                <option value="">— Pilih Periode —</option>
                {existingPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {p.dateRange ? `(${p.dateRange})` : ''} — {p.totalSessions} sesi
                  </option>
                ))}
              </select>
              <p className="assign-hint" style={{ marginTop: '4px', marginBottom: 0 }}>
                Data periode yang dipilih akan diganti seluruhnya dengan data file yang baru saja diupload.
              </p>
            </div>
          )}
        </div>

        {/* Step 3: File Upload Zone */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: '#451A03', marginBottom: '8px' }}>
            3. Pilih File Excel Live Streaming (Bisa Lebih Dari Satu File)
          </label>

          <div
            className={`upload-zone ${selectedFiles.length > 0 ? 'is-dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            style={{ cursor: 'pointer' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls"
              onChange={(e) => handleFilesChosen(e.target.files)}
              className="upload-input"
            />
            <div className="upload-stack">
              <div className="sheet sheet-3" />
              <div className="sheet sheet-2" />
              <div className="sheet sheet-1" />
            </div>
            <p className="upload-title">
              {selectedFiles.length > 0
                ? `${selectedFiles.length} file dipilih: ${selectedFiles.map((f) => f.name).join(', ')}`
                : 'Klik untuk pilih file Excel Live (.xlsx, .xls)'}
            </p>
            <p className="upload-sub">
              {selectedFiles.length > 0
                ? 'Klik kembali jika ingin mengganti file'
                : 'Mendukung multi-file ekspor Shopee Live. Sesi ganda/tumpang tindih otomatis digabungkan tanpa duplikasi.'}
            </p>
          </div>
        </div>

        {parsing && <p className="loading-text">Membaca dan memproses file Excel…</p>}
        {parseError && <p className="upload-error">⚠️ {parseError}</p>}
        {publishError && <p className="upload-error">⚠️ {publishError}</p>}
        {publishSuccess && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: '#DCFCE7',
              border: '1px solid #BBF7D0',
              color: '#15803D',
              fontSize: '13.5px',
              marginBottom: '1rem',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>✅ {publishSuccess}</p>
            <div style={{ marginTop: '8px' }}>
              <a
                href="/laporan-live"
                className="btn-export"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  fontSize: '12px',
                  padding: '5px 12px',
                }}
              >
                Buka Menu Laporan Live ↗
              </a>
            </div>
          </div>
        )}

        {/* Step 4: Preview Data & Publish */}
        {previewData && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#1C1917', fontWeight: 700 }}>
                Pratinjau Hasil Pembacaan Data
              </h4>
              <span
                style={{
                  fontSize: '12px',
                  background: '#FEF9C3',
                  border: '1px solid #FEF08A',
                  color: '#854D0E',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  fontWeight: 600,
                }}
              >
                Rentang: {previewData.dateRange}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="metric-card">
                <p className="metric-label">Total Sesi Live</p>
                <p className="metric-value">{previewData.count} sesi</p>
              </div>
              <div className="metric-card" style={{ background: '#FFFDF5', borderColor: '#FDE68A' }}>
                <p className="metric-label">Shift Astrid (Siang)</p>
                <p className="metric-value" style={{ color: '#B45309' }}>
                  {previewData.astridCount} sesi
                </p>
              </div>
              <div className="metric-card" style={{ background: '#F5F3FF', borderColor: '#DDD6FE' }}>
                <p className="metric-label">Shift Fifi (Malam)</p>
                <p className="metric-value" style={{ color: '#6D28D9' }}>
                  {previewData.fifiCount} sesi
                </p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Pesanan Dibuat</p>
                <p className="metric-value">{previewData.summary.pesananDibuat.toLocaleString('id-ID')}</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Produk Terjual</p>
                <p className="metric-value">{previewData.summary.produkDibuat.toLocaleString('id-ID')}</p>
              </div>
              <div className="metric-card" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
                <p className="metric-label">Total Omzet Dibuat</p>
                <p className="metric-value" style={{ color: '#15803D' }}>
                  {fmtRp(previewData.summary.penjualanDibuat)}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-export"
                onClick={handlePublish}
                disabled={publishing}
                style={{ padding: '9px 18px', fontSize: '13.5px' }}
              >
                {publishing
                  ? 'Menyimpan & Mempublikasikan…'
                  : saveMode === 'overwrite'
                  ? 'Ganti / Timpa Periode & Publikasikan'
                  : 'Simpan Periode Baru & Publikasikan'}
              </button>

              <button
                type="button"
                className="pill-btn"
                onClick={() => {
                  setSelectedFiles([])
                  setPreviewData(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                disabled={publishing}
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
