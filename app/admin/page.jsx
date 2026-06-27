'use client'

import { useCallback, useState } from 'react'
import UploadZone from '@/components/UploadZone'
import SummaryCards from '@/components/SummaryCards'
import CategoryAssign from '@/components/CategoryAssign'
import { buildDefaultCategories } from '@/lib/defaultCategories'

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [analysis, setAnalysis] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [categories, setCategories] = useState({})
  const [uploadError, setUploadError] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  const [publishState, setPublishState] = useState('idle') // idle | saving | done | error
  const [publishError, setPublishError] = useState(null)

  const handleLogin = useCallback(
    async (e) => {
      e.preventDefault()
      setLoginError(null)
      setLoginLoading(true)
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Password salah.')
        }
        setLoggedIn(true)
      } catch (err) {
        setLoginError(err.message)
      } finally {
        setLoginLoading(false)
      }
    },
    [password]
  )

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
    setCategories((prev) => {
      const next = { ...prev }
      if (category) next[customer] = category
      else delete next[customer]
      return next
    })
  }, [])

  const handlePublish = useCallback(async () => {
    setPublishState('saving')
    setPublishError(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, categories, fileName }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Gagal mempublikasikan data.')
      setPublishState('done')
    } catch (err) {
      setPublishError(err.message)
      setPublishState('error')
    }
  }, [analysis, categories, fileName])

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
            onChange={(e) => setPassword(e.target.value)}
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
          <h1>Unggah &amp; publikasikan data penjualan</h1>
        </div>
      </header>

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
                Tersimpan. Dashboard publik sudah memperlihatkan data terbaru ini.
              </p>
            )}
            {publishState === 'error' && <p className="upload-error">{publishError}</p>}
          </div>
        </main>
      )}
    </div>
  )
}
