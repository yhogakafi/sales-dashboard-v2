'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { parsePelangganWorkbook } from '@/lib/parsePelanggan'

export default function PelangganTab() {
  const [status, setStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)

  // Upload state
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef(null)

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await fetch('/api/pelanggan/status')
      if (res.ok) {
        const body = await res.json()
        setStatus(body.status)
      }
    } catch {
      // ignore
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleFileSelect = async (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    setFile(selected)
    setError(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      const buffer = await selected.arrayBuffer()
      const parsed = parsePelangganWorkbook(buffer)
      setPreview(parsed)
    } catch (err) {
      setError(err.message || 'Gagal membaca atau memproses file Excel.')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  const handlePublishUpload = async () => {
    if (!file) return

    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/pelanggan/upload', {
        method: 'POST',
        body: formData,
      })

      const body = await res.json()
      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Gagal mengunggah dan menyimpan file pelanggan.')
      }

      setSuccessMsg(`Berhasil! ${body.message}`)
      setFile(null)
      setPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchStatus()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Current Blob Status Block */}
      <div className="table-block">
        <div className="table-block-header">
          <div>
            <h3 className="block-title" style={{ margin: 0 }}>Status Data Pelanggan (Storage Blob)</h3>
            <p className="assign-hint" style={{ marginTop: '4px', marginBottom: 0 }}>
              Data ini menjadi sumber informasi untuk halaman menu <strong>Pelanggan</strong>.
            </p>
          </div>
          <button
            type="button"
            className="pill-btn"
            onClick={fetchStatus}
            disabled={statusLoading}
          >
            {statusLoading ? 'Memeriksa…' : 'Perbarui Status'}
          </button>
        </div>

        {statusLoading ? (
          <p className="loading-text">Memeriksa status penyimpanan…</p>
        ) : status?.exists ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginTop: '1rem',
            }}
          >
            <div className="metric-card" style={{ background: '#FFFDF0', borderColor: '#FEF08A' }}>
              <p className="metric-label">Status Storage</p>
              <p className="metric-value" style={{ color: '#15803D', fontSize: '15px', fontWeight: 600 }}>
                ● Aktif &amp; Siap Digunakan
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Nama File Sumber</p>
              <p className="metric-value" style={{ fontSize: '14px', wordBreak: 'break-all' }}>
                {status.sourceFileName}
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Total Baris Pesanan</p>
              <p className="metric-value">
                {status.totalOrders.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Pelanggan Unik</p>
              <p className="metric-value">
                {status.uniqueCustomers.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Pelanggan Repeat</p>
              <p className="metric-value" style={{ color: '#B45309' }}>
                {status.repeatCustomers.toLocaleString('id-ID')}{' '}
                <span style={{ fontSize: '12px', color: '#713F12' }}>({status.repeatCustomerRate}%)</span>
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Terakhir Disimpan</p>
              <p className="metric-value" style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                {new Date(status.savedAt).toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        ) : (
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
            <p style={{ margin: 0, fontWeight: 600 }}>Belum ada data pelanggan di storage.</p>
            <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
              Silakan unggah file Excel di bawah ini.
            </p>
          </div>
        )}

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <a
            href="/pelanggan"
            target="_blank"
            rel="noopener noreferrer"
            className="pill-btn"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Buka Halaman Pelanggan ↗
          </a>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="table-block">
        <h3 className="block-title">Unggah Data Excel Pelanggan Baru</h3>
        <p className="assign-hint" style={{ marginBottom: '1.25rem' }}>
          Unggah file Excel (format <code>.xls</code> atau <code>.xlsx</code>) yang berisi data pelanggan.
          Sistem akan membaca kolom tanggal order (Kolom A), channel / marketplace (Kolom B), nama pelanggan / username (Kolom C), dan No. Resi (Kolom D) untuk menghitung statistik repeat order secara otomatis.
        </p>

        <div
          className={`upload-zone ${file ? 'is-dragover' : ''}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleFileSelect}
            className="upload-input"
          />
          <div className="upload-stack">
            <div className="sheet sheet-3" />
            <div className="sheet sheet-2" />
            <div className="sheet sheet-1" />
          </div>
          <p className="upload-title">
            {file ? file.name : 'Klik untuk pilih file Excel (.xls, .xlsx)'}
          </p>
          <p className="upload-sub">
            {file ? `${(file.size / 1024).toFixed(1)} KB — Siap untuk diproses` : 'atau seret dan lepas file ke sini'}
          </p>
        </div>

        {loading && <p className="loading-text" style={{ marginTop: '1rem' }}>Menganalisis file Excel…</p>}
        {error && <p className="upload-error" style={{ marginTop: '1rem' }}>⚠️ {error}</p>}
        {successMsg && (
          <p className="publish-success" style={{ marginTop: '1rem' }}>
            ✅ {successMsg}
          </p>
        )}

        {/* Upload Preview */}
        {preview && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '14px', color: 'var(--ink)' }}>
              Pratinjau Data: {file?.name}
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="metric-card">
                <p className="metric-label">Total Pesanan</p>
                <p className="metric-value">{preview.summary.totalOrders.toLocaleString('id-ID')}</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Pelanggan Unik</p>
                <p className="metric-value">{preview.summary.uniqueCustomers.toLocaleString('id-ID')}</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Pelanggan Repeat</p>
                <p className="metric-value" style={{ color: '#B45309' }}>
                  {preview.summary.repeatCustomers.toLocaleString('id-ID')}{' '}
                  <span style={{ fontSize: '11px', color: '#713F12' }}>({preview.summary.repeatCustomerRate}%)</span>
                </p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Top Repeat</p>
                <p className="metric-value" style={{ fontSize: '13px' }}>
                  {preview.summary.topCustomer?.username} ({preview.summary.topCustomer?.count}x)
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-export"
                onClick={handlePublishUpload}
                disabled={saving}
              >
                {saving ? 'Menyimpan ke Storage Blob…' : 'Simpan & Publikasikan ke Blob'}
              </button>
              <button
                type="button"
                className="pill-btn"
                onClick={() => {
                  setFile(null)
                  setPreview(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                disabled={saving}
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
