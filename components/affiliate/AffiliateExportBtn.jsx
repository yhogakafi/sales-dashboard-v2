'use client'

import { useState, useRef, useEffect } from 'react'
import { exportAffiliateExcel, exportAffiliatePdf } from '@/lib/exportAffiliate'

export default function AffiliateExportBtn({
  platform = 'shopee',
  allRows = [],
  filteredRows = null,
  periodLabel = '',
  account = 'Semua Akun',
  filterDesc = '',
  size = 'md', // 'sm' | 'md'
  onShowToast,
  shopeeEntries = [],
  tiktokEntries = [],
  label = 'Unduh Laporan',
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const wrapRef = useRef(null)

  const isFiltered =
    Array.isArray(filteredRows) &&
    filteredRows.length > 0 &&
    filteredRows.length !== allRows.length

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleExportExcel = (targetRows, isTargetFiltered = false) => {
    try {
      exportAffiliateExcel({
        platform,
        rows: targetRows,
        periodLabel,
        account,
        filterDesc: isTargetFiltered ? filterDesc : '',
        shopeeRows: platform === 'semua' ? allRows.filter((r) => r.platform === 'Shopee') : [],
        tiktokRows: platform === 'semua' ? allRows.filter((r) => r.platform === 'TikTok') : [],
        shopeeEntries,
        tiktokEntries,
      })
      onShowToast?.('File Excel berhasil diunduh!')
    } catch (err) {
      console.error(err)
      alert('Gagal mengekspor Excel: ' + (err.message || 'Terjadi kesalahan.'))
    } finally {
      setOpen(false)
    }
  }

  const handleExportPdf = async (targetRows, isTargetFiltered = false) => {
    if (loading) return
    setLoading(true)
    setProgress('Menyiapkan…')
    try {
      await exportAffiliatePdf({
        platform,
        rows: targetRows,
        periodLabel,
        account,
        filterDesc: isTargetFiltered ? filterDesc : '',
        onProgress: setProgress,
      })
      onShowToast?.('File PDF berhasil dibuat & diunduh!')
    } catch (err) {
      console.error(err)
      alert('Gagal membuat PDF: ' + (err.message || 'Terjadi kesalahan.'))
    } finally {
      setLoading(false)
      setProgress('')
      setOpen(false)
    }
  }

  return (
    <div className="export-split-wrap aff-export-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`btn-export-main ${size === 'sm' ? 'sm' : ''}`}
        disabled={loading || allRows.length === 0}
        onClick={() => setOpen((v) => !v)}
        title="Klik untuk memilih format ekspor"
      >
        {loading ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span className="spinner-sm" style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
            {progress || 'Memproses…'}
          </span>
        ) : (
          <span>↓ {label}</span>
        )}
      </button>

      <button
        type="button"
        className={`btn-export-caret ${size === 'sm' ? 'sm' : ''}`}
        disabled={loading || allRows.length === 0}
        onClick={() => setOpen((v) => !v)}
        aria-label="Pilih format ekspor"
      >
        ▾
      </button>

      {open && (
        <div className="export-dropdown-menu aff-export-menu">
          <div className="aff-export-menu-header">
            <span>Pilih Format Ekspor</span>
          </div>

          {/* ── EXCEL OPTIONS ── */}
          <div className="aff-export-section-title">📊 Format Excel (.xlsx)</div>

          <button
            type="button"
            className="export-dropdown-item"
            onClick={() => handleExportExcel(allRows, false)}
          >
            <span className="export-item-label">
              📗 Laporan Lengkap Excel ({allRows.length.toLocaleString('id-ID')} baris)
            </span>
            <span className="export-item-sub">
              Ringkasan KPI, analisa performa &amp; semua data transaksi
            </span>
          </button>

          {isFiltered && (
            <button
              type="button"
              className="export-dropdown-item"
              onClick={() => handleExportExcel(filteredRows, true)}
            >
              <span className="export-item-label">
                🔍 Data Terfilter Excel ({filteredRows.length.toLocaleString('id-ID')} baris)
              </span>
              <span className="export-item-sub">
                Sesuai pencarian &amp; filter yang sedang aktif di layar
              </span>
            </button>
          )}

          <div className="aff-export-divider" />

          {/* ── PDF OPTIONS ── */}
          <div className="aff-export-section-title">📄 Format PDF (.pdf)</div>

          <button
            type="button"
            className="export-dropdown-item"
            disabled={loading}
            onClick={() => handleExportPdf(allRows, false)}
          >
            <span className="export-item-label">
              📑 Laporan Grafis &amp; Transaksi Lengkap
            </span>
            <span className="export-item-sub">
              Visual grafik tren, distribusi status &amp; {allRows.length.toLocaleString('id-ID')} baris transaksi
            </span>
          </button>

          {isFiltered && (
            <button
              type="button"
              className="export-dropdown-item"
              disabled={loading}
              onClick={() => handleExportPdf(filteredRows, true)}
            >
              <span className="export-item-label">
                🔍 Laporan Grafis &amp; Data Terfilter
              </span>
              <span className="export-item-sub">
                Visual grafik &amp; {filteredRows.length.toLocaleString('id-ID')} baris transaksi sesuai filter
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
