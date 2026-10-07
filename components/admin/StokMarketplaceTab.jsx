'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  parseMarketplaceStockFile,
  mergeMarketplaceStockItems,
} from '@/lib/parseMarketplaceStock'

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

export default function StokMarketplaceTab() {
  const [indexList, setIndexList] = useState([])
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  // Upload form state
  const [customerName, setCustomerName] = useState('SHOPEE / SCELTA')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [parsing, setParsing] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [syncingSample, setSyncingSample] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const fileInputRef = useRef(null)

  // Fetch registered marketplace customers
  const fetchIndex = useCallback(async () => {
    setLoadingIndex(true)
    try {
      const res = await fetch('/api/stok-marketplace/index')
      if (res.ok) {
        const body = await res.json()
        setIndexList(body.customers || [])
      }
    } catch (err) {
      console.error('Error fetching marketplace stock index:', err)
    } finally {
      setLoadingIndex(false)
    }
  }, [])

  useEffect(() => {
    fetchIndex()
  }, [fetchIndex])

  // Handle multi-file selection
  const handleFilesChosen = async (files) => {
    if (!files || files.length === 0) return

    const newFiles = Array.from(files)
    // Combine with already selected files if any, avoiding duplicates by name
    const existingNames = new Set(selectedFiles.map((f) => f.name))
    const combined = [...selectedFiles]
    for (const file of newFiles) {
      if (!existingNames.has(file.name)) {
        combined.push(file)
        existingNames.add(file.name)
      }
    }

    setSelectedFiles(combined)
    setErrorMsg(null)
    setSuccessMsg(null)
    setParsing(true)

    try {
      const parsedLists = []
      for (const file of combined) {
        const buffer = await file.arrayBuffer()
        const items = parseMarketplaceStockFile(buffer, file.name)
        parsedLists.push(items)
      }
      const merged = mergeMarketplaceStockItems(parsedLists)
      setPreviewData(merged)
    } catch (err) {
      setErrorMsg(err.message || 'Gagal membaca atau memproses file Excel.')
      setPreviewData(null)
    } finally {
      setParsing(false)
    }
  }

  // Remove a single file from the selected list
  const removeFile = async (indexToRemove) => {
    const updated = selectedFiles.filter((_, idx) => idx !== indexToRemove)
    setSelectedFiles(updated)
    if (updated.length === 0) {
      setPreviewData(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setParsing(true)
    try {
      const parsedLists = []
      for (const file of updated) {
        const buffer = await file.arrayBuffer()
        const items = parseMarketplaceStockFile(buffer, file.name)
        parsedLists.push(items)
      }
      const merged = mergeMarketplaceStockItems(parsedLists)
      setPreviewData(merged)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setParsing(false)
    }
  }

  // Handle upload to Blob
  const handleUploadAndPublish = async () => {
    if (!customerName.trim()) {
      setErrorMsg('Nama pelanggan wajib diisi.')
      return
    }
    if (selectedFiles.length === 0) {
      setErrorMsg('Pilih minimal satu file Excel untuk diunggah.')
      return
    }

    setUploading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const formData = new FormData()
      formData.append('customerName', customerName.trim())
      for (const file of selectedFiles) {
        formData.append('files', file)
      }

      const res = await fetch('/api/stok-marketplace/upload', {
        method: 'POST',
        body: formData,
      })

      const body = await res.json()
      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Gagal mengunggah file ke storage.')
      }

      setSuccessMsg(body.message || 'Data stok marketplace berhasil disimpan!')
      setSelectedFiles([])
      setPreviewData(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchIndex()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setUploading(false)
    }
  }

  // Quick sync directly from the local sample folder "stok shopee scelta"
  const handleSyncSample = async () => {
    if (!customerName.trim()) {
      setErrorMsg('Nama pelanggan wajib diisi.')
      return
    }

    setSyncingSample(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await fetch('/api/stok-marketplace/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync-sample',
          customerName: customerName.trim(),
        }),
      })

      const body = await res.json()
      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Gagal memuat file sampel.')
      }

      setSuccessMsg(body.message || 'File sampel berhasil dimuat!')
      await fetchIndex()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSyncingSample(false)
    }
  }

  // Delete customer stock
  const handleDeleteCustomer = async (id, name) => {
    if (!confirm(`Hapus data stok marketplace untuk "${name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return
    }

    setDeletingId(id)
    try {
      const res = await fetch(`/api/stok-marketplace/data?customer=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Gagal menghapus data pelanggan.')
      }
      await fetchIndex()
    } catch (err) {
      alert(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Block 1: Saved Marketplace Customers ── */}
      <div className="table-block">
        <div className="table-block-header">
          <div>
            <h3 className="block-title" style={{ margin: 0 }}>
              Daftar Stok Marketplace Tersimpan
            </h3>
            <p className="assign-hint" style={{ marginTop: '4px', marginBottom: 0 }}>
              Data stok yang telah diunggah dan siap ditampilkan di menu{' '}
              <strong>Stok Marketplace</strong> berdasarkan tab masing-masing pelanggan.
            </p>
          </div>
          <button
            type="button"
            className="pill-btn"
            onClick={fetchIndex}
            disabled={loadingIndex}
          >
            {loadingIndex ? 'Memeriksa…' : 'Perbarui Daftar'}
          </button>
        </div>

        {loadingIndex ? (
          <p className="loading-text">Memeriksa daftar stok marketplace…</p>
        ) : indexList.length === 0 ? (
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
            <p style={{ margin: 0, fontWeight: 600 }}>Belum ada data stok marketplace yang diunggah.</p>
            <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
              Silakan unggah satu atau beberapa file Excel di bawah ini atau klik tombol &ldquo;⚡ Muat Sampel dari Folder stok shopee scelta&rdquo;.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '1rem' }}>
            {indexList.map((cust) => {
              const sm = cust.summary || {}
              return (
                <div
                  key={cust.id}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #FEF08A',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    boxShadow: '0 2px 6px rgba(234, 179, 8, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          background: '#FEF08A',
                          color: '#713F12',
                          fontWeight: 800,
                          fontSize: '12px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        PELANGGAN
                      </span>
                      <strong style={{ fontSize: '15px', color: '#1C1917' }}>{cust.name}</strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <a
                        href={`/stok-marketplace?customer=${cust.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pill-btn"
                        style={{
                          textDecoration: 'none',
                          fontSize: '12px',
                          padding: '4px 10px',
                          color: '#0369A1',
                          borderColor: '#BAE6FD',
                          background: '#F0F9FF',
                        }}
                      >
                        Buka Halaman ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomer(cust.id, cust.name)}
                        disabled={deletingId === cust.id}
                        style={{
                          background: '#FEF2F2',
                          color: '#B91C1C',
                          border: '1px solid #FECACA',
                          fontSize: '12px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        {deletingId === cust.id ? 'Menghapus…' : 'Hapus'}
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Chips */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '8px',
                      background: '#FFFDF5',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #FEF9C3',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716C', fontWeight: 600 }}>Total SKU</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#1C1917' }}>
                        {(sm.totalItems || 0).toLocaleString('id-ID')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716C', fontWeight: 600 }}>Total Stok</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0369A1' }}>
                        {(sm.totalStock || 0).toLocaleString('id-ID')} pcs
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716C', fontWeight: 600 }}>Stok Tersedia</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#15803D' }}>
                        {(sm.availableStockCount || 0).toLocaleString('id-ID')}{' '}
                        <span style={{ fontSize: '11px' }}>({sm.availableStockPct || 0}%)</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716C', fontWeight: 600 }}>Stok Kosong</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#DC2626' }}>
                        {(sm.emptyStockCount || 0).toLocaleString('id-ID')}{' '}
                        <span style={{ fontSize: '11px' }}>({sm.emptyStockPct || 0}%)</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716C', fontWeight: 600 }}>Stok Menipis (1-5)</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#D97706' }}>
                        {(sm.lowStockCount || 0).toLocaleString('id-ID')}{' '}
                        <span style={{ fontSize: '11px' }}>({sm.lowStockPct || 0}%)</span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      fontSize: '11.5px',
                      color: '#78716C',
                    }}
                  >
                    <span>
                      File:{' '}
                      <strong style={{ color: '#451A03' }}>
                        {Array.isArray(cust.fileNames) ? cust.fileNames.join(', ') : 'File Excel'}
                      </strong>
                    </span>
                    <span>
                      Diperbarui:{' '}
                      {cust.savedAt ? new Date(cust.savedAt).toLocaleString('id-ID') : '-'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Block 2: Upload Zone ── */}
      <div className="table-block">
        <h3 className="block-title">Unggah Data Stok Marketplace Baru</h3>
        <p className="assign-hint" style={{ marginBottom: '1.25rem' }}>
          Pilih nama pelanggan (misalnya <code>SHOPEE / SCELTA</code> atau <code>SHOPEE / GRAPE</code>) dan unggah satu atau
          beberapa file Excel ekspor massal stok. Sistem hanya akan mengambil kolom{' '}
          <strong>Nama Produk</strong>, <strong>SKU</strong>, dan <strong>Stok</strong>.
        </p>

        {/* Step 1: Customer Name */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#451A03', marginBottom: '6px' }}>
            1. Tentukan Nama Pelanggan (Marketplace / Brand)
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {COMMON_CUSTOMER_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCustomerName(preset)}
                style={{
                  background: customerName === preset ? '#FEF08A' : '#FFFDF5',
                  border: customerName === preset ? '1.5px solid #EAB308' : '1px solid #E2E8F0',
                  color: customerName === preset ? '#713F12' : '#4B5563',
                  fontWeight: customerName === preset ? 700 : 500,
                  fontSize: '12px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Contoh: SHOPEE / SCELTA atau SHOPEE / GRAPE"
            className="login-input"
            style={{ width: '100%', maxWidth: '420px', padding: '8px 12px', fontSize: '13.5px' }}
          />
        </div>

        {/* Step 2: Multiple Files Upload */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#451A03', marginBottom: '6px' }}>
            2. Pilih File Excel (Bisa Memilih Beberapa File Sekaligus)
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
              accept=".xls,.xlsx"
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
                ? `${selectedFiles.length} file dipilih`
                : 'Klik untuk pilih satu atau beberapa file Excel (.xlsx, .xls)'}
            </p>
            <p className="upload-sub">
              {selectedFiles.length > 0
                ? 'Klik untuk menambah file lain atau seret & lepas ke area ini'
                : 'Dapat memilih beberapa file batch sekaligus (contoh: 1.xlsx, 2.xlsx, 3.xlsx)'}
            </p>
          </div>

          {/* Selected Files Chip List */}
          {selectedFiles.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#57534E', marginBottom: '6px' }}>
                File yang dipilih ({selectedFiles.length}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      color: '#713F12',
                    }}
                  >
                    <span>📄 {file.name}</span>
                    <span style={{ fontSize: '11px', color: '#A8A29E' }}>
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile(idx)
                      }}
                      title="Hapus file ini"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#DC2626',
                        fontWeight: 800,
                        cursor: 'pointer',
                        padding: '0 2px',
                        fontSize: '13px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {parsing && <p className="loading-text">Membaca dan memproses file Excel…</p>}
        {errorMsg && <p className="upload-error" style={{ marginTop: '8px' }}>⚠️ {errorMsg}</p>}
        {successMsg && <p className="publish-success" style={{ marginTop: '8px' }}>✅ {successMsg}</p>}

        {/* Data Preview */}
        {previewData && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '1.25rem',
              background: '#FFFDF5',
              border: '1.5px solid #FEF08A',
              borderRadius: '10px',
            }}
          >
            <h4 style={{ margin: '0 0 10px', fontSize: '14px', color: '#451A03' }}>
              Pratinjau Hasil Gabungan ({selectedFiles.length} file untuk {customerName}):
            </h4>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px',
                marginBottom: '1rem',
              }}
            >
              <div className="metric-card">
                <p className="metric-label">Total SKU Unik</p>
                <p className="metric-value">{previewData.summary.totalItems.toLocaleString('id-ID')}</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Total Stok</p>
                <p className="metric-value" style={{ color: '#0369A1' }}>
                  {previewData.summary.totalStock.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Stok Tersedia</p>
                <p className="metric-value" style={{ color: '#15803D' }}>
                  {previewData.summary.availableStockCount.toLocaleString('id-ID')}{' '}
                  <span style={{ fontSize: '11px' }}>({previewData.summary.availableStockPct}%)</span>
                </p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Stok Kosong</p>
                <p className="metric-value" style={{ color: '#DC2626' }}>
                  {previewData.summary.emptyStockCount.toLocaleString('id-ID')}{' '}
                  <span style={{ fontSize: '11px' }}>({previewData.summary.emptyStockPct}%)</span>
                </p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Stok Menipis (1-5)</p>
                <p className="metric-value" style={{ color: '#D97706' }}>
                  {previewData.summary.lowStockCount.toLocaleString('id-ID')}{' '}
                  <span style={{ fontSize: '11px' }}>({previewData.summary.lowStockPct}%)</span>
                </p>
              </div>
            </div>

            {/* Sample Rows Table */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#78716C', marginBottom: '6px' }}>
                Sampel 5 Produk Pertama:
              </div>
              <div style={{ overflowX: 'auto', background: '#FFFFFF', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '6px 10px' }}>No</th>
                      <th style={{ padding: '6px 10px' }}>Nama Produk</th>
                      <th style={{ padding: '6px 10px' }}>SKU</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.items.slice(0, 5).map((it, idx) => (
                      <tr key={it.sku || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '6px 10px', color: '#94A3B8' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 500, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.namaProduk}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#334155' }}>
                          {it.sku}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: it.stok === 0 ? '#DC2626' : '#15803D' }}>
                          {it.stok}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-export"
                onClick={handleUploadAndPublish}
                disabled={uploading}
              >
                {uploading ? 'Menyimpan ke Storage Blob…' : `Simpan Data untuk ${customerName}`}
              </button>
              <button
                type="button"
                className="pill-btn"
                onClick={() => {
                  setSelectedFiles([])
                  setPreviewData(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                disabled={uploading}
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Quick Testing Shortcut */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <strong style={{ fontSize: '13px', color: '#713F12' }}>⚡ Pintasan Sampel Folder Lokal</strong>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#78716C' }}>
                Langsung muat 3 file sampel dari folder <code>stok shopee scelta</code> (1.xlsx, 2.xlsx, 3.xlsx) ke pelanggan di atas.
              </p>
            </div>
            <button
              type="button"
              className="btn-export"
              onClick={handleSyncSample}
              disabled={syncingSample}
              style={{ background: '#713F12', color: '#FEF08A' }}
            >
              {syncingSample ? 'Menyinkronkan…' : `⚡ Muat Sampel ke ${customerName}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
