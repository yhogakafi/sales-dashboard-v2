'use client'

import { useCallback, useEffect, useState } from 'react'
import UploadZone from '@/components/UploadZone'
import { formatNumber } from '@/lib/parseData'

function labelToId(label) {
  return label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export default function ProdukTerlarisAdminPanel() {
  const [analysis, setAnalysis] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [masterAvailable, setMasterAvailable] = useState(true)
  const [uploadError, setUploadError] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  const [periods, setPeriods] = useState([])
  const [periodsLoading, setPeriodsLoading] = useState(false)
  const [saveMode, setSaveMode] = useState('new')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [newPeriodLabel, setNewPeriodLabel] = useState('')

  const [publishState, setPublishState] = useState('idle')
  const [publishError, setPublishError] = useState(null)
  const [publishedLabel, setPublishedLabel] = useState(null)

  const [deletingId, setDeletingId] = useState(null)

  const fetchPeriods = useCallback(async () => {
    setPeriodsLoading(true)
    try {
      const res = await fetch('/api/produk-terlaris/periods')
      if (res.ok) setPeriods(await res.json())
    } finally {
      setPeriodsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPeriods()
  }, [fetchPeriods])

  const handleFile = useCallback(async (file) => {
    setUploadError(null)
    setUploadLoading(true)
    setPublishState('idle')
    setFileName(file.name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/produk-terlaris/upload', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal memproses file.')
      setAnalysis(body.analysis)
      setMasterAvailable(body.masterAvailable)
      // Prefill nama periode dari rentang tanggal yang terdeteksi di file, kalau ada.
      setNewPeriodLabel(body.analysis.dateRangeRaw || '')
    } catch (err) {
      setUploadError(err.message)
      setAnalysis(null)
    } finally {
      setUploadLoading(false)
    }
  }, [])

  const handlePublish = useCallback(async () => {
    const label = saveMode === 'overwrite' ? periods.find(p => p.id === selectedPeriodId)?.label : newPeriodLabel.trim()
    const id = saveMode === 'overwrite' ? selectedPeriodId : labelToId(newPeriodLabel.trim())

    if (!label || !id) {
      setPublishError('Nama periode tidak boleh kosong.')
      setPublishState('error')
      return
    }

    setPublishState('saving')
    setPublishError(null)
    try {
      const res = await fetch('/api/produk-terlaris/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, fileName, periodId: id, periodLabel: label }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal mempublikasikan data.')
      setPublishState('done')
      setPublishedLabel(label)
      await fetchPeriods()
    } catch (err) {
      setPublishError(err.message)
      setPublishState('error')
    }
  }, [analysis, fileName, saveMode, selectedPeriodId, newPeriodLabel, periods, fetchPeriods])

  const handleDelete = useCallback(async (id, label) => {
    if (!confirm(`Hapus periode "${label}"? Data yang sudah dihapus tidak bisa dikembalikan.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/produk-terlaris/periods?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus.')
      await fetchPeriods()
    } catch (err) {
      alert(err.message)
    } finally {
      setDeletingId(null)
    }
  }, [fetchPeriods])

  const topProducts = analysis ? analysis.products.slice(0, 10) : []

  return (
    <>
      <div className="table-block period-list-block">
        <div className="table-block-header">
          <h3 className="block-title">Periode produk terlaris tersimpan</h3>
          {periodsLoading && <span className="assign-progress">Memuat…</span>}
        </div>
        <p className="assign-hint">
          Periode di sini terpisah dari periode data penjualan — rentang tanggalnya bisa berbeda.
        </p>
        {!periodsLoading && periods.length === 0 && (
          <p className="assign-hint">Belum ada periode yang tersimpan.</p>
        )}
        {periods.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label periode</th>
                  <th>Rentang data</th>
                  <th>Terakhir diperbarui</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.label}</strong></td>
                    <td className="muted">{p.dateRange}</td>
                    <td className="muted mono">{new Date(p.uploadedAt).toLocaleString('id-ID')}</td>
                    <td>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(p.id, p.label)}
                        disabled={deletingId === p.id}
                      >
                        {deletingId === p.id ? 'Menghapus…' : 'Hapus'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UploadZone onFile={handleFile} error={uploadError} fileName={fileName} />
      {uploadLoading && <p className="loading-text">Memproses file…</p>}

      {analysis && !masterAvailable && (
        <p className="upload-error">
          Master barang belum diunggah — nama produk tidak akan tampil (hanya kode). Upload master
          barang dulu di tab "Master Barang", lalu unggah ulang file ini.
        </p>
      )}

      {analysis && (
        <main className="dashboard">
          <p className="period-note">
            {analysis.dateRangeRaw ? `Rentang terdeteksi: ${analysis.dateRangeRaw} · ` : ''}
            {formatNumber(analysis.products.length)} produk unik &middot; {formatNumber(analysis.totalQtyAll)} qty
            terjual &middot; {analysis.tokoList.length} toko
            {analysis.unmatchedCount > 0 && (
              <> &middot; <strong>{analysis.unmatchedCount} kode</strong> tidak ditemukan di master barang</>
            )}
          </p>

          <div className="table-block">
            <h3 className="block-title">Preview 10 produk teratas</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Kode</th>
                    <th>Nama produk</th>
                    <th className="num">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.kode}>
                      <td className="num muted">{i + 1}</td>
                      <td className="mono">{p.kode}</td>
                      <td>{p.nama || <span className="muted">— tidak ditemukan di master —</span>}</td>
                      <td className="num mono">{formatNumber(p.totalQty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="table-block period-save-block">
            <h3 className="block-title">Simpan sebagai periode</h3>
            <div className="period-save-options">
              <label className={`period-save-option ${saveMode === 'new' ? 'is-selected' : ''}`}>
                <input type="radio" name="saveModeProduk" value="new"
                  checked={saveMode === 'new'} onChange={() => setSaveMode('new')} />
                <span>Periode baru</span>
              </label>
              <label className={`period-save-option ${saveMode === 'overwrite' ? 'is-selected' : ''}`}>
                <input type="radio" name="saveModeProduk" value="overwrite"
                  checked={saveMode === 'overwrite'} onChange={() => setSaveMode('overwrite')}
                  disabled={periods.length === 0} />
                <span>Perbarui periode yang sudah ada</span>
              </label>
            </div>

            {saveMode === 'new' && (
              <div className="period-input-row">
                <input
                  type="text"
                  className="login-input period-label-input"
                  placeholder="Contoh: 23-24 Juli 2026, Minggu 4 Juli…"
                  value={newPeriodLabel}
                  onChange={(e) => setNewPeriodLabel(e.target.value)}
                />
              </div>
            )}

            {saveMode === 'overwrite' && periods.length > 0 && (
              <div className="period-input-row">
                <select
                  className="category-select"
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                >
                  <option value="">— Pilih periode yang akan diperbarui —</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({p.dateRange})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="publish-bar">
            <button className="btn-export btn-publish" onClick={handlePublish}
              disabled={publishState === 'saving'}>
              {publishState === 'saving' ? 'Menyimpan…' : 'Simpan & Publikasikan'}
            </button>
            {publishState === 'done' && (
              <p className="publish-success">
                Tersimpan sebagai "{publishedLabel}". Periode ini sudah bisa dipilih di halaman Produk Terlaris.
              </p>
            )}
            {publishState === 'error' && <p className="upload-error">{publishError}</p>}
          </div>
        </main>
      )}
    </>
  )
}
