'use client'

import { useCallback, useEffect, useState } from 'react'
import UploadZone from '@/components/UploadZone'

export default function MasterBarangAdminPanel() {
  const [status, setStatus] = useState(null) // { exists, count, fileName, updatedAt }
  const [statusLoading, setStatusLoading] = useState(true)

  const [preview, setPreview] = useState(null) // { map, count, fileName }
  const [fileName, setFileName] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  const [publishState, setPublishState] = useState('idle') // idle | saving | done | error
  const [publishError, setPublishError] = useState(null)

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await fetch('/api/master-barang')
      if (res.ok) setStatus(await res.json())
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleFile = useCallback(async (file) => {
    setUploadError(null)
    setUploadLoading(true)
    setPublishState('idle')
    setPreview(null)
    setFileName(file.name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/master-barang/upload', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal memproses file.')
      setPreview({ map: body.map, count: body.count, fileName: body.fileName })
    } catch (err) {
      setUploadError(err.message)
      setPreview(null)
    } finally {
      setUploadLoading(false)
    }
  }, [])

  const handleConfirmPublish = useCallback(async () => {
    if (!preview) return
    const proceed = confirm(
      status?.exists
        ? `Timpa master barang lama (${status.count} kode) dengan file baru ini (${preview.count} kode)? Data lama tidak bisa dikembalikan.`
        : `Simpan ${preview.count} kode barang sebagai master barang?`
    )
    if (!proceed) return

    setPublishState('saving')
    setPublishError(null)
    try {
      const res = await fetch('/api/master-barang/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: preview.map, count: preview.count, fileName: preview.fileName }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal menyimpan.')
      setPublishState('done')
      setPreview(null)
      setFileName(null)
      await fetchStatus()
    } catch (err) {
      setPublishError(err.message)
      setPublishState('error')
    }
  }, [preview, status, fetchStatus])

  const sampleEntries = preview ? Object.entries(preview.map).slice(0, 6) : []

  return (
    <>
      <div className="table-block period-list-block">
        <div className="table-block-header">
          <h3 className="block-title">Master barang saat ini</h3>
          {statusLoading && <span className="assign-progress">Memuat…</span>}
        </div>
        {!statusLoading && !status?.exists && (
          <p className="assign-hint">
            Belum ada master barang yang diunggah. Nama produk di halaman Produk Terlaris tidak akan
            bisa ditampilkan sampai file ini diunggah.
          </p>
        )}
        {!statusLoading && status?.exists && (
          <p className="assign-hint">
            <strong>{status.count.toLocaleString('id-ID')}</strong> kode barang tersimpan
            {status.fileName && <> &middot; dari file <em>{status.fileName}</em></>}
            {status.updatedAt && <> &middot; diperbarui {new Date(status.updatedAt).toLocaleString('id-ID')}</>}
          </p>
        )}
        <p className="assign-hint" style={{ marginTop: status?.exists ? '10px' : 0 }}>
          Master barang bukan data per periode — file ini dipakai sebagai kamus kode → nama produk
          untuk semua periode Produk Terlaris. Upload file baru akan <strong>menimpa seluruh data lama</strong>,
          bukan menambah periode baru. Format file: kolom A kode barang, kolom B nama produk (tanpa header).
        </p>
      </div>

      <UploadZone onFile={handleFile} error={uploadError} fileName={fileName} />
      {uploadLoading && <p className="loading-text">Memproses file…</p>}

      {preview && (
        <div className="table-block period-save-block">
          <h3 className="block-title">Preview file baru</h3>
          <p className="assign-hint">
            <strong>{preview.count.toLocaleString('id-ID')}</strong> kode barang terbaca dari{' '}
            <em>{preview.fileName}</em>.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>Kode barang</th><th>Nama produk</th></tr>
              </thead>
              <tbody>
                {sampleEntries.map(([kode, nama]) => (
                  <tr key={kode}><td className="mono">{kode}</td><td>{nama}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="assign-hint muted" style={{ marginTop: '8px' }}>
            Menampilkan {sampleEntries.length} dari {preview.count.toLocaleString('id-ID')} baris.
          </p>

          <div className="publish-bar">
            <button className="btn-export btn-publish" onClick={handleConfirmPublish}
              disabled={publishState === 'saving'}>
              {publishState === 'saving' ? 'Menyimpan…' : 'Simpan & Timpa Master Barang'}
            </button>
            {publishState === 'error' && <p className="upload-error">{publishError}</p>}
          </div>
        </div>
      )}

      {publishState === 'done' && (
        <p className="publish-success">Master barang berhasil diperbarui.</p>
      )}
    </>
  )
}
