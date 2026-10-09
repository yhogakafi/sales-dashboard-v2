'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  parseMarketplaceStockFile,
  mergeMarketplaceStockItems,
  slugifyCustomerId,
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
  const [errorMsg, setErrorMsg] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const fileInputRef = useRef(null)

  // Image upload form state (Foto Sampul per customer)
  const [imgCustomerName, setImgCustomerName] = useState('SHOPEE / SCELTA')
  const [selectedImgFile, setSelectedImgFile] = useState(null)
  const [parsingImg, setParsingImg] = useState(false)
  const [previewImgData, setPreviewImgData] = useState(null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [imgErrorMsg, setImgErrorMsg] = useState(null)
  const [imgSuccessMsg, setImgSuccessMsg] = useState(null)
  const imgFileInputRef = useRef(null)

  // In-browser parse for Excel image links (Foto Sampul on column E, Kode Produk on column A)
  const handleImgFileChosen = async (file) => {
    if (!file) return
    setSelectedImgFile(file)
    setImgErrorMsg(null)
    setImgSuccessMsg(null)
    setParsingImg(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

      let headerIdx = -1
      let kodeCol = 0
      let fotoCol = 4 // Column E

      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const r = rows[i] || []
        const kIdx = r.findIndex((c) => String(c).trim().toLowerCase() === 'kode produk')
        const fIdx = r.findIndex((c) => String(c).trim().toLowerCase() === 'foto sampul')
        if (kIdx !== -1 && fIdx !== -1) {
          headerIdx = i
          kodeCol = kIdx
          fotoCol = fIdx
          break
        }
      }

      const images = {}
      const startRow = headerIdx !== -1 ? headerIdx + 1 : 1
      for (let i = startRow; i < rows.length; i++) {
        const r = rows[i] || []
        const kode = String(r[kodeCol] || '').trim()
        const url = String(r[fotoCol] || '').trim()
        if (kode && url && url.startsWith('http')) {
          images[kode] = url
        }
      }

      const count = Object.keys(images).length
      if (count === 0) {
        throw new Error('Tidak ditemukan link foto sampul (Kolom E) yang valid dalam file Excel ini.')
      }

      setPreviewImgData({
        images,
        count,
        sampleEntries: Object.entries(images).slice(0, 8),
      })
    } catch (err) {
      setImgErrorMsg(err.message || 'Gagal membaca file gambar Excel.')
      setPreviewImgData(null)
    } finally {
      setParsingImg(false)
    }
  }

  const handleUploadImagesAndPublish = async () => {
    if (!imgCustomerName.trim()) {
      setImgErrorMsg('Nama pelanggan wajib diisi.')
      return
    }
    if (!previewImgData || previewImgData.count === 0) {
      setImgErrorMsg('Pilih file Excel gambar yang valid.')
      return
    }

    setUploadingImg(true)
    setImgErrorMsg(null)
    setImgSuccessMsg(null)

    try {
      const matchedCustomer = indexList.find(
        (c) =>
          c.name?.trim().toLowerCase() === imgCustomerName.trim().toLowerCase() ||
          c.id === slugifyCustomerId(imgCustomerName)
      )
      const customerId = matchedCustomer?.id || slugifyCustomerId(imgCustomerName)

      const res = await fetch('/api/stok-marketplace/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: imgCustomerName.trim(),
          customerId,
          images: previewImgData.images,
          count: previewImgData.count,
          fileName: selectedImgFile?.name || 'gambar.xlsx',
        }),
      })

      const body = await res.json()
      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Gagal menyimpan gambar produk.')
      }

      setImgSuccessMsg(body.message || 'Gambar produk berhasil disimpan!')
      setSelectedImgFile(null)
      setPreviewImgData(null)
      if (imgFileInputRef.current) imgFileInputRef.current.value = ''
      await fetchIndex()
    } catch (err) {
      setImgErrorMsg(err.message)
    } finally {
      setUploadingImg(false)
    }
  }


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
              Silakan unggah satu atau beberapa file Excel di bawah ini.
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
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716C', fontWeight: 600 }}>Foto Sampul</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: cust.imageSummary?.totalImages ? '#7C3AED' : '#9CA3AF' }}>
                        {cust.imageSummary?.totalImages ? `${cust.imageSummary.totalImages.toLocaleString('id-ID')} foto` : '0 foto'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '11.5px',
                      color: '#78716C',
                    }}
                  >
                    <span>
                      File Stok:{' '}
                      <strong style={{ color: '#451A03' }}>
                        {Array.isArray(cust.fileNames) ? cust.fileNames.join(', ') : 'File Excel'}
                      </strong>
                    </span>
                    {cust.imageSummary?.fileName && (
                      <span>
                        File Foto:{' '}
                        <strong style={{ color: '#6D28D9' }}>{cust.imageSummary.fileName}</strong>
                      </span>
                    )}
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
                      <th style={{ padding: '6px 10px' }}>Kode Produk</th>
                      <th style={{ padding: '6px 10px' }}>Kode Variasi</th>
                      <th style={{ padding: '6px 10px' }}>Nama Produk</th>
                      <th style={{ padding: '6px 10px' }}>SKU</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Stok</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Harga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.items.slice(0, 5).map((it, idx) => (
                      <tr key={it.sku || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '6px 10px', color: '#94A3B8' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '11px', color: '#1E293B' }}>
                          {it.kodeProduk || '-'}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '11px', color: '#475569' }}>
                          {it.kodeVariasi || '-'}
                        </td>
                        <td style={{ padding: '6px 10px', fontWeight: 500, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.namaProduk}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#334155' }}>
                          {it.sku}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: it.stok === 0 ? '#DC2626' : '#15803D' }}>
                          {it.stok}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#0F766E' }}>
                          {it.harga ? `Rp ${it.harga.toLocaleString('id-ID')}` : '-'}
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

      </div>

      {/* ── Block 3: Upload Foto Sampul / Gambar Produk Marketplace ── */}
      <div className="table-block">
        <div className="table-block-header">
          <div>
            <h3 className="block-title" style={{ margin: 0 }}>
              Unggah Gambar Produk Marketplace (Foto Sampul)
            </h3>
            <p className="assign-hint" style={{ marginTop: '4px', marginBottom: 0 }}>
              Unggah file Excel berisi link foto produk (menggunakan <code>gambar-shopee-scelta.xlsx</code> sebagai panduan).
              Sistem akan membaca link foto dari kolom <strong>Foto Sampul</strong> (Kolom E) dan mencocokkan ke varian stok menggunakan <strong>Kode Produk</strong> (Kolom A).
            </p>
          </div>
        </div>

        {/* Step 1: Customer Selector for Images */}
        <div style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#451A03', marginBottom: '6px' }}>
            1. Tentukan Nama Pelanggan (Marketplace / Brand)
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {COMMON_CUSTOMER_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setImgCustomerName(preset)}
                style={{
                  background: imgCustomerName === preset ? '#EDE9FE' : '#FFFDF5',
                  border: imgCustomerName === preset ? '1.5px solid #8B5CF6' : '1px solid #E2E8F0',
                  color: imgCustomerName === preset ? '#5B21B6' : '#4B5563',
                  fontWeight: imgCustomerName === preset ? 700 : 500,
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
            value={imgCustomerName}
            onChange={(e) => setImgCustomerName(e.target.value)}
            placeholder="Contoh: SHOPEE / SCELTA"
            className="login-input"
            style={{ width: '100%', maxWidth: '420px', padding: '8px 12px', fontSize: '13.5px' }}
          />
        </div>

        {/* Step 2: Upload Excel File for Images */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#451A03', marginBottom: '6px' }}>
            2. Pilih File Excel Gambar (Foto Sampul Kolom E)
          </label>

          <div
            className={`upload-zone ${selectedImgFile ? 'is-dragover' : ''}`}
            onClick={() => imgFileInputRef.current?.click()}
            style={{ cursor: 'pointer', borderColor: '#8B5CF6' }}
          >
            <input
              ref={imgFileInputRef}
              type="file"
              accept=".xls,.xlsx"
              onChange={(e) => handleImgFileChosen(e.target.files?.[0])}
              className="upload-input"
              style={{ display: 'none' }}
            />
            <div className="upload-zone-content">
              <span className="upload-icon" style={{ fontSize: '32px' }}>🖼️</span>
              <p className="upload-primary-text">
                {selectedImgFile ? (
                  <strong>{selectedImgFile.name}</strong>
                ) : (
                  <>Klik atau seret file <strong>Excel Gambar (.xlsx / .xls)</strong> ke sini</>
                )}
              </p>
              <p className="upload-sub-text">
                Contoh format: <code>gambar-shopee-scelta.xlsx</code> (Kolom A: Kode Produk, Kolom E: Foto Sampul)
              </p>
            </div>
          </div>
        </div>

        {/* Parsing state */}
        {parsingImg && (
          <p className="loading-text" style={{ color: '#7C3AED' }}>
            ⏳ Membaca dan mengekstrak link foto sampul dari Excel…
          </p>
        )}

        {/* Alerts */}
        {imgErrorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#B91C1C',
              fontSize: '13px',
              marginBottom: '1rem',
            }}
          >
            ❌ {imgErrorMsg}
          </div>
        )}

        {imgSuccessMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              color: '#15803D',
              fontSize: '13px',
              marginBottom: '1rem',
            }}
          >
            ✓ {imgSuccessMsg}
          </div>
        )}

        {/* Preview of Parsed Images */}
        {previewImgData && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              borderRadius: '10px',
              background: '#FAF5FF',
              border: '1.5px solid #DDD6FE',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <div>
                <strong style={{ color: '#5B21B6', fontSize: '15px' }}>
                  Pratinjau Foto Produk: {previewImgData.count.toLocaleString('id-ID')} Kode Produk Teridentifikasi
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6B7280' }}>
                  Target Pelanggan: <strong>{imgCustomerName}</strong> (File: {selectedImgFile?.name})
                </p>
              </div>
            </div>

            {/* Thumbnail grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: '10px',
                maxHeight: '260px',
                overflowY: 'auto',
                padding: '8px',
                background: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E9D5FF',
                marginBottom: '1rem',
              }}
            >
              {(previewImgData.sampleEntries || []).map(([kode, url]) => (
                <div
                  key={kode}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '6px',
                    borderRadius: '6px',
                    border: '1px solid #F3E8FF',
                    background: '#FAFAFA',
                    fontSize: '11px',
                    textAlign: 'center',
                  }}
                >
                  <img
                    src={url}
                    alt={kode}
                    referrerPolicy="no-referrer"
                    style={{
                      width: '64px',
                      height: '64px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      border: '1px solid #E5E7EB',
                      marginBottom: '4px',
                      background: '#F3F4F6',
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: '#4B5563',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                    title={kode}
                  >
                    {kode}
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-export"
                onClick={handleUploadImagesAndPublish}
                disabled={uploadingImg}
                style={{ background: '#7C3AED', color: '#FFFFFF' }}
              >
                {uploadingImg ? 'Menyimpan Foto ke Storage Blob…' : `Simpan Foto untuk ${imgCustomerName}`}
              </button>
              <button
                type="button"
                className="pill-btn"
                onClick={() => {
                  setSelectedImgFile(null)
                  setPreviewImgData(null)
                  if (imgFileInputRef.current) imgFileInputRef.current.value = ''
                }}
                disabled={uploadingImg}
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
