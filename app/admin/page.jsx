'use client'

import { useCallback, useEffect, useState } from 'react'
import UploadZone from '@/components/UploadZone'
import SummaryCards from '@/components/SummaryCards'
import CategoryAssign from '@/components/CategoryAssign'
import { buildDefaultCategories } from '@/lib/defaultCategories'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function labelToId(label) {
  return label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ─── Sales data tab (unchanged logic) ────────────────────────────────────────

function SalesTab({ periods, periodsLoading, fetchPeriods }) {
  const [analysis, setAnalysis]         = useState(null)
  const [fileName, setFileName]         = useState(null)
  const [categories, setCategories]     = useState({})
  const [uploadError, setUploadError]   = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  const [saveMode, setSaveMode]           = useState('new')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [newPeriodLabel, setNewPeriodLabel]     = useState('')

  const [publishState, setPublishState]   = useState('idle')
  const [publishError, setPublishError]   = useState(null)
  const [publishedLabel, setPublishedLabel] = useState(null)
  const [deletingId, setDeletingId]       = useState(null)

  const handleFile = useCallback(async (file) => {
    setUploadError(null)
    setUploadLoading(true)
    setPublishState('idle')
    setFileName(file.name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal memproses file.')
      setAnalysis(body.analysis)
      setCategories(buildDefaultCategories(body.analysis.rankedCustomers))
    } catch (err) {
      setUploadError(err.message)
      setAnalysis(null)
    } finally {
      setUploadLoading(false)
    }
  }, [])

  const handleCategoryChange = useCallback((customer, category) => {
    setCategories(prev => {
      const next = { ...prev }
      if (category) next[customer] = category
      else delete next[customer]
      return next
    })
  }, [])

  const handlePublish = useCallback(async () => {
    const label = saveMode === 'overwrite'
      ? periods.find(p => p.id === selectedPeriodId)?.label
      : newPeriodLabel.trim()
    const id = saveMode === 'overwrite' ? selectedPeriodId : labelToId(newPeriodLabel.trim())

    if (!label || !id) {
      setPublishError('Nama periode tidak boleh kosong.')
      setPublishState('error')
      return
    }

    setPublishState('saving')
    setPublishError(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, categories, fileName, periodId: id, periodLabel: label }),
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
  }, [analysis, categories, fileName, saveMode, selectedPeriodId, newPeriodLabel, periods, fetchPeriods])

  const handleDelete = useCallback(async (id, label) => {
    if (!confirm(`Hapus periode "${label}"? Data yang sudah dihapus tidak bisa dikembalikan.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/periods?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus.')
      await fetchPeriods()
    } catch (err) {
      alert(err.message)
    } finally {
      setDeletingId(null)
    }
  }, [fetchPeriods])

  return (
    <>
      {/* ── Saved periods ── */}
      <div className="table-block period-list-block">
        <div className="table-block-header">
          <h3 className="block-title">Periode tersimpan</h3>
          {periodsLoading && <span className="assign-progress">Memuat…</span>}
        </div>
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
                {periods.map(p => (
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

      {/* ── Upload ── */}
      <UploadZone onFile={handleFile} error={uploadError} fileName={fileName} />
      {uploadLoading && <p className="loading-text">Memproses file…</p>}

      {analysis && (
        <main className="dashboard">
          <p className="period-note">
            Periode data: {analysis.periodLabel} ({analysis.dateKeys.length} hari aktif)
          </p>

          <SummaryCards data={analysis} />

          <section>
            <CategoryAssign data={analysis} categories={categories} onChange={handleCategoryChange} />
          </section>

          {/* Period save options */}
          <div className="table-block period-save-block">
            <h3 className="block-title">Simpan sebagai periode</h3>
            <div className="period-save-options">
              <label className={`period-save-option ${saveMode === 'new' ? 'is-selected' : ''}`}>
                <input type="radio" name="saveMode" value="new"
                  checked={saveMode === 'new'} onChange={() => setSaveMode('new')} />
                <span>Periode baru</span>
              </label>
              <label className={`period-save-option ${saveMode === 'overwrite' ? 'is-selected' : ''}`}>
                <input type="radio" name="saveMode" value="overwrite"
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
                  placeholder="Contoh: Juni 2026, Q2 2026, Minggu 1 Juli…"
                  value={newPeriodLabel}
                  onChange={e => setNewPeriodLabel(e.target.value)}
                />
              </div>
            )}

            {saveMode === 'overwrite' && periods.length > 0 && (
              <div className="period-input-row">
                <select
                  className="category-select"
                  value={selectedPeriodId}
                  onChange={e => setSelectedPeriodId(e.target.value)}
                >
                  <option value="">— Pilih periode yang akan diperbarui —</option>
                  {periods.map(p => (
                    <option key={p.id} value={p.id}>{p.label} ({p.dateRange})</option>
                  ))}
                </select>
                <p className="assign-hint" style={{ marginTop: 8 }}>
                  Data periode yang dipilih akan diganti dengan data file yang baru saja diupload.
                </p>
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
                Tersimpan sebagai &ldquo;{publishedLabel}&rdquo;. Periode ini sudah bisa dipilih di dashboard.
              </p>
            )}
            {publishState === 'error' && <p className="upload-error">{publishError}</p>}
          </div>
        </main>
      )}
    </>
  )
}

// ─── Barang Terlaris upload tab ────────────────────────────────────────────────

function BarangTerlarisTab({ btPeriods, btPeriodsLoading, fetchBTPeriods }) {
  const [analysis, setAnalysis]         = useState(null)  // preview only (no rawRows)
  const [draftId, setDraftId]           = useState(null)  // blob key of the full draft
  const [fileName, setFileName]         = useState(null)
  const [uploadError, setUploadError]   = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  const [saveMode, setSaveMode]               = useState('new')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [newPeriodLabel, setNewPeriodLabel]     = useState('')

  const [publishState, setPublishState]     = useState('idle')
  const [publishError, setPublishError]     = useState(null)
  const [publishedLabel, setPublishedLabel] = useState(null)
  const [deletingId, setDeletingId]         = useState(null)

  const handleFile = useCallback(async (file) => {
    setUploadError(null)
    setUploadLoading(true)
    setPublishState('idle')
    setDraftId(null)
    setFileName(file.name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/barang-terlaris-upload', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal memproses file.')
      // Server already saved to blob — we only keep the preview + draftId
      setAnalysis(body.analysis)
      setDraftId(body.draftId)
    } catch (err) {
      setUploadError(err.message)
      setAnalysis(null)
    } finally {
      setUploadLoading(false)
    }
  }, [])

  const handlePublish = useCallback(async () => {
    const label = saveMode === 'overwrite'
      ? btPeriods.find(p => p.id === selectedPeriodId)?.label
      : newPeriodLabel.trim()
    const id = saveMode === 'overwrite' ? selectedPeriodId : labelToId(newPeriodLabel.trim())

    if (!label || !id) {
      setPublishError('Nama periode tidak boleh kosong.')
      setPublishState('error')
      return
    }

    setPublishState('saving')
    setPublishError(null)
    try {
      // Only send draftId — analysis stays in blob, never re-sent through the browser
      const res = await fetch('/api/barang-terlaris-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, fileName, periodId: id, periodLabel: label }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal mempublikasikan data.')
      setPublishState('done')
      setPublishedLabel(label)
      await fetchBTPeriods()
    } catch (err) {
      setPublishError(err.message)
      setPublishState('error')
    }
  }, [draftId, fileName, saveMode, selectedPeriodId, newPeriodLabel, btPeriods, fetchBTPeriods])

  const handleDelete = useCallback(async (id, label) => {
    if (!confirm(`Hapus periode barang terlaris "${label}"? Tidak bisa dikembalikan.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/barang-terlaris-periods?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus.')
      await fetchBTPeriods()
    } catch (err) {
      alert(err.message)
    } finally {
      setDeletingId(null)
    }
  }, [fetchBTPeriods])

  return (
    <>
      {/* ── Saved periods ── */}
      <div className="table-block period-list-block">
        <div className="table-block-header">
          <h3 className="block-title">Periode barang terlaris tersimpan</h3>
          {btPeriodsLoading && <span className="assign-progress">Memuat…</span>}
        </div>
        {!btPeriodsLoading && btPeriods.length === 0 && (
          <p className="assign-hint">Belum ada data barang terlaris yang tersimpan.</p>
        )}
        {btPeriods.length > 0 && (
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
                {btPeriods.map(p => (
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

      {/* Upload hint */}
      <div className="assign-hint" style={{ marginBottom: 8 }}>
        Upload file ekspor data barang terlaris (format: Tgl DO, Nama Pelanggan, Nama Barang, Kuantitas, Harga Satuan, Diskon).
        File <strong>.xls</strong> dan <strong>.xlsx</strong> didukung.
      </div>

      <UploadZone onFile={handleFile} error={uploadError} fileName={fileName} />
      {uploadLoading && <p className="loading-text">Memproses file barang terlaris…</p>}

      {analysis && (
        <main className="dashboard">
          <p className="period-note">
            Periode data: {analysis.periodLabel} · {analysis.rowCount?.toLocaleString('id-ID') || 0} baris ·{' '}
            {analysis.rankedBarang?.length || 0} produk unik
          </p>

          {/* Preview top 10 */}
          <div className="table-block" style={{ marginBottom: '1.5rem' }}>
            <div className="table-block-header">
              <h3 className="block-title">Preview — 10 produk teratas (berdasarkan kuantitas)</h3>
            </div>
            <div className="table-scroll">
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nama Barang</th>
                    <th style={{ textAlign: 'right' }}>Kuantitas</th>
                    <th style={{ textAlign: 'right' }}>Harga Produk</th>
                  </tr>
                </thead>
                <tbody>
                  {(analysis.rankedBarang || []).slice(0, 10).map((row, i) => (
                    <tr key={row.namaBarang}>
                      <td className="muted mono">{i + 1}</td>
                      <td>{row.namaBarang}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {row.kuantitas.toLocaleString('id-ID')}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        Rp{Math.round(row.hargaProduk).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Period save options */}
          <div className="table-block period-save-block">
            <h3 className="block-title">Simpan sebagai periode barang terlaris</h3>
            <div className="period-save-options">
              <label className={`period-save-option ${saveMode === 'new' ? 'is-selected' : ''}`}>
                <input type="radio" name="btSaveMode" value="new"
                  checked={saveMode === 'new'} onChange={() => setSaveMode('new')} />
                <span>Periode baru</span>
              </label>
              <label className={`period-save-option ${saveMode === 'overwrite' ? 'is-selected' : ''}`}>
                <input type="radio" name="btSaveMode" value="overwrite"
                  checked={saveMode === 'overwrite'} onChange={() => setSaveMode('overwrite')}
                  disabled={btPeriods.length === 0} />
                <span>Perbarui periode yang sudah ada</span>
              </label>
            </div>

            {saveMode === 'new' && (
              <div className="period-input-row">
                <input
                  type="text"
                  className="login-input period-label-input"
                  placeholder="Contoh: Juni 2026, Q2 2026, Minggu 1 Juli…"
                  value={newPeriodLabel}
                  onChange={e => setNewPeriodLabel(e.target.value)}
                />
              </div>
            )}

            {saveMode === 'overwrite' && btPeriods.length > 0 && (
              <div className="period-input-row">
                <select
                  className="category-select"
                  value={selectedPeriodId}
                  onChange={e => setSelectedPeriodId(e.target.value)}
                >
                  <option value="">— Pilih periode yang akan diperbarui —</option>
                  {btPeriods.map(p => (
                    <option key={p.id} value={p.id}>{p.label} ({p.dateRange})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="publish-bar">
            <button
              className="btn-export btn-publish"
              onClick={handlePublish}
              disabled={publishState === 'saving'}
            >
              {publishState === 'saving' ? 'Menyimpan…' : 'Simpan & Publikasikan'}
            </button>
            {publishState === 'done' && (
              <p className="publish-success">
                Tersimpan sebagai &ldquo;{publishedLabel}&rdquo;. Siap dilihat di halaman Produk Terlaris.
              </p>
            )}
            {publishState === 'error' && <p className="upload-error">{publishError}</p>}
          </div>
        </main>
      )}
    </>
  )
}

// ─── Admin page root ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [loggedIn, setLoggedIn]     = useState(false)
  const [password, setPassword]     = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [activeTab, setActiveTab] = useState('sales') // 'sales' | 'barang-terlaris'

  // Sales periods
  const [periods, setPeriods]             = useState([])
  const [periodsLoading, setPeriodsLoading] = useState(false)

  // Barang terlaris periods
  const [btPeriods, setBTPeriods]               = useState([])
  const [btPeriodsLoading, setBTPeriodsLoading] = useState(false)

  const fetchPeriods = useCallback(async () => {
    setPeriodsLoading(true)
    try {
      const res = await fetch('/api/periods')
      if (res.ok) setPeriods(await res.json())
    } finally {
      setPeriodsLoading(false)
    }
  }, [])

  const fetchBTPeriods = useCallback(async () => {
    setBTPeriodsLoading(true)
    try {
      const res = await fetch('/api/barang-terlaris-periods')
      if (res.ok) setBTPeriods(await res.json())
    } finally {
      setBTPeriodsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (loggedIn) {
      fetchPeriods()
      fetchBTPeriods()
    }
  }, [loggedIn, fetchPeriods, fetchBTPeriods])

  const handleLogin = useCallback(async (e) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Password salah.')
      setLoggedIn(true)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }, [password])

  if (!loggedIn) {
    return (
      <div className="app-shell admin-login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <p className="eyebrow">Halaman admin</p>
          <h1>Masuk untuk unggah data</h1>
          <input
            type="password"
            placeholder="Password admin"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="login-input"
            autoFocus
          />
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
          <p className="eyebrow">Halaman admin</p>
          <h1>Unggah &amp; publikasikan data</h1>
        </div>
      </header>

      {/* ── Tab switcher ── */}
      <div className="admin-tab-bar">
        <button
          className={`admin-tab-btn ${activeTab === 'sales' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          Data penjualan
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'barang-terlaris' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('barang-terlaris')}
        >
          Data barang terlaris
        </button>
      </div>

      {activeTab === 'sales' && (
        <SalesTab
          periods={periods}
          periodsLoading={periodsLoading}
          fetchPeriods={fetchPeriods}
        />
      )}

      {activeTab === 'barang-terlaris' && (
        <BarangTerlarisTab
          btPeriods={btPeriods}
          btPeriodsLoading={btPeriodsLoading}
          fetchBTPeriods={fetchBTPeriods}
        />
      )}
    </div>
  )
}
