'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

// Helper format Rupiah
function formatRupiah(num) {
  if (num == null || isNaN(num)) return '-'
  return `Rp ${Number(num).toLocaleString('id-ID')}`
}

// Convert image URL to Base64 via proxy to prevent tainted canvas in html2canvas
async function urlToBase64ViaProxy(url) {
  if (!url) return null
  if (url.startsWith('data:')) return url
  try {
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export default function CetakJadwalPromoModal({ isOpen, onClose, mpStockItems = [] }) {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState('upload') // 'upload' | 'preview'
  const [fileName, setFileName] = useState('')
  const [docTitle, setDocTitle] = useState('JADWAL PROMO CAMPAIGN')
  const [docSubtitle, setDocSubtitle] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [loadingSample, setLoadingSample] = useState(false)
  const [parsingFile, setParsingFile] = useState(false)
  const [parseError, setParseError] = useState(null)
  const [generatingJpg, setGeneratingJpg] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(0.5) // Preview scale in modal (1080 * 0.5 = 540px)
  const [previewZoomImage, setPreviewZoomImage] = useState(null)

  // Local fallback marketplace items if parent passed empty
  const [internalMpItems, setInternalMpItems] = useState([])
  const [loadingMp, setLoadingMp] = useState(false)

  const fileInputRef = useRef(null)
  const sheetContainerRef = useRef(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Load marketplace stock if not available
  useEffect(() => {
    if (!isOpen) return
    if (mpStockItems && mpStockItems.length > 0) return

    setLoadingMp(true)
    fetch('/api/stok-marketplace/data?customer=all', { cache: 'no-store' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          if (data.data?.items) {
            setInternalMpItems(data.data.items)
          }
        }
      })
      .catch((err) => console.error('[CetakJadwalPromo] Error loading MP stock:', err))
      .finally(() => setLoadingMp(false))
  }, [isOpen, mpStockItems])

  const allMpItems = mpStockItems && mpStockItems.length > 0 ? mpStockItems : internalMpItems

  // Lookup map for matching items from Stok Marketplace
  const mpLookup = useMemo(() => {
    const byVarCode = new Map()
    const byProdAndVar = new Map()
    const bySku = new Map()

    for (const it of allMpItems) {
      if (!it) continue
      const varCode = it.kodeVariasi != null ? String(it.kodeVariasi).trim() : ''
      const prodCode = it.kodeProduk != null ? String(it.kodeProduk).trim() : ''
      const sku = it.sku != null ? String(it.sku).trim().toLowerCase() : ''

      if (varCode && !byVarCode.has(varCode)) {
        byVarCode.set(varCode, it)
      }
      if (prodCode && varCode) {
        const composite = `${prodCode}_${varCode}`
        if (!byProdAndVar.has(composite)) {
          byProdAndVar.set(composite, it)
        }
      }
      if (sku && !bySku.has(sku)) {
        bySku.set(sku, it)
      }
    }

    return { byVarCode, byProdAndVar, bySku }
  }, [allMpItems])

  // Parse Excel Buffer and match with Stok Marketplace
  const processExcelBuffer = useCallback(
    async (buffer, originalFileName = 'Periode.xlsx') => {
      setParsingFile(true)
      setParseError(null)

      try {
        const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          throw new Error('File Excel tidak memiliki lembar kerja (sheet).')
        }

        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawGrid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (!rawGrid || rawGrid.length === 0) {
          throw new Error('File Excel kosong atau tidak memiliki baris data.')
        }

        // Find header row: Look for row containing "Kode Produk" or "Kode Variasi" or "Harga diskon"
        let headerRowIdx = -1
        let colKodeProduk = -1
        let colKodeVariasi = -1
        let colHargaDiskon = -1
        let colSku = -1
        let colHargaNormal = -1

        for (let r = 0; r < Math.min(rawGrid.length, 12); r++) {
          const row = rawGrid[r]
          if (!Array.isArray(row)) continue

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').trim().toLowerCase()
            if (val === 'kode produk' || val === 'kodeproduk' || val === 'kode_produk') {
              colKodeProduk = c
            }
            if (val === 'kode variasi' || val === 'kodevariasi' || val === 'kode_variasi' || val === 'kode var') {
              colKodeVariasi = c
            }
            if (
              val === 'harga diskon' ||
              val === 'hargadiskon' ||
              val === 'harga_diskon' ||
              val === 'harga promo' ||
              val === 'diskon'
            ) {
              colHargaDiskon = c
            }
            if (val === 'sku' || val === 'nama variasi' || val === 'variasi' || val === 'nama barang') {
              colSku = c
            }
            if (val === 'harga normal' || val === 'harganormal' || val === 'harga_normal' || val === 'harga') {
              colHargaNormal = c
            }
          }

          if (colKodeVariasi !== -1 || (colKodeProduk !== -1 && colHargaDiskon !== -1)) {
            headerRowIdx = r
            break
          }
        }

        if (headerRowIdx === -1) {
          if (rawGrid[0]?.length >= 3 && !isNaN(Number(rawGrid[1]?.[2]))) {
            headerRowIdx = 0
            colKodeProduk = 0
            colKodeVariasi = 1
            colHargaDiskon = 2
          } else {
            throw new Error(
              'Format header Excel tidak dikenali. Pastikan terdapat kolom "Kode Produk", "Kode Variasi", dan "Harga diskon".'
            )
          }
        }

        const dataRows = []
        for (let r = headerRowIdx + 1; r < rawGrid.length; r++) {
          const row = rawGrid[r]
          if (!Array.isArray(row) || row.length === 0) continue

          const rawKp = colKodeProduk !== -1 ? String(row[colKodeProduk] || '').trim() : ''
          const rawKv = colKodeVariasi !== -1 ? String(row[colKodeVariasi] || '').trim() : ''
          const rawHrgDiskon = colHargaDiskon !== -1 ? row[colHargaDiskon] : null
          const rawSku = colSku !== -1 ? String(row[colSku] || '').trim() : ''
          const rawHrgNormal = colHargaNormal !== -1 ? row[colHargaNormal] : null

          if (!rawKp && !rawKv && !rawSku && rawHrgDiskon == null) continue

          let hargaDiskon = 0
          if (typeof rawHrgDiskon === 'number') {
            hargaDiskon = rawHrgDiskon
          } else if (rawHrgDiskon) {
            const clean = String(rawHrgDiskon).replace(/[^0-9.-]+/g, '')
            hargaDiskon = Number(clean) || 0
          }

          let excelHargaNormal = null
          if (typeof rawHrgNormal === 'number') {
            excelHargaNormal = rawHrgNormal
          } else if (rawHrgNormal) {
            const clean = String(rawHrgNormal).replace(/[^0-9.-]+/g, '')
            excelHargaNormal = Number(clean) || null
          }

          // Match with Stok-Marketplace
          let matchedMp = null
          if (rawKp && rawKv) {
            matchedMp = mpLookup.byProdAndVar.get(`${rawKp}_${rawKv}`)
          }
          if (!matchedMp && rawKv) {
            matchedMp = mpLookup.byVarCode.get(rawKv)
          }
          if (!matchedMp && rawSku) {
            matchedMp = mpLookup.bySku.get(rawSku.toLowerCase())
          }

          const sku = matchedMp?.sku || rawSku || '-'
          const gambar = matchedMp?.gambar || ''
          const hargaNormal = matchedMp?.harga != null ? matchedMp.harga : excelHargaNormal || 0
          const namaProduk = matchedMp?.namaProduk || ''

          // Calculate Diskon %: ((hargaNormal - hargaDiskon) / hargaNormal) * 100
          let diskonPct = 0
          if (hargaNormal > 0 && hargaDiskon > 0) {
            diskonPct = ((hargaNormal - hargaDiskon) / hargaNormal) * 100
          }

          dataRows.push({
            id: `row-${r}`,
            no: dataRows.length + 1,
            kodeProduk: rawKp || matchedMp?.kodeProduk || '-',
            kodeVariasi: rawKv || matchedMp?.kodeVariasi || '-',
            sku,
            namaProduk,
            gambar,
            hargaNormal,
            hargaDiskon,
            diskonPct,
            hasMatch: !!matchedMp,
          })
        }

        if (dataRows.length === 0) {
          throw new Error('Tidak ada baris data promo yang ditemukan dalam file Excel.')
        }

        const cleanBaseName = originalFileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
        const titleUpper = cleanBaseName.toUpperCase()
        const derivedTitle = titleUpper.includes('PERIODE')
          ? `JADWAL PROMO CAMPAIGN - ${titleUpper}`
          : `JADWAL PROMO CAMPAIGN ${titleUpper}`

        setFileName(originalFileName)
        setDocTitle(derivedTitle)
        setDocSubtitle(`Daftar Harga & Diskon Promo Produk (${dataRows.length} SKU)`)
        setParsedRows(dataRows)
        setStep('preview')
      } catch (err) {
        console.error('[CetakJadwalPromo] Error processing Excel:', err)
        setParseError(err.message || 'Gagal memproses file Excel.')
      } finally {
        setParsingFile(false)
      }
    },
    [mpLookup]
  )

  // Handle file input selection
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    await processExcelBuffer(buffer, file.name)
  }

  // Load sample file directly (.data/Periode-1.xlsx)
  const handleLoadSample = async () => {
    setLoadingSample(true)
    setParseError(null)
    try {
      const res = await fetch('/api/stok-marketplace/sample-periode')
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal mengambil file sampel.')
      }

      const binaryString = atob(data.base64)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      await processExcelBuffer(bytes.buffer, data.fileName || 'Periode 1.xlsx')
    } catch (err) {
      console.error('[CetakJadwalPromo] Error loading sample:', err)
      setParseError(err.message || 'Gagal memuat sampel Periode 1.xlsx.')
    } finally {
      setLoadingSample(false)
    }
  }

  // Calculate dynamic document height so NO row is cropped!
  // Width is strictly 1080px. Minimum height is 1920px.
  // Each row has generous ~76px height for big clear elements.
  const dynamicDocumentHeight = useMemo(() => {
    const basePaddingAndHeader = 360 // padding + header banner + table header + footer
    const rowsHeight = parsedRows.length * 76
    const totalNeeded = basePaddingAndHeader + rowsHeight
    return Math.max(1920, Math.ceil(totalNeeded))
  }, [parsedRows.length])

  // Track rendered sheet height dynamically to match scrollHeight exactly
  const [renderedSheetHeight, setRenderedSheetHeight] = useState(1920)

  useEffect(() => {
    if (step === 'preview' && sheetContainerRef.current) {
      const scrollH = sheetContainerRef.current.scrollHeight
      if (scrollH && scrollH > 100) {
        setRenderedSheetHeight(Math.max(1920, scrollH))
      }
    }
  }, [step, parsedRows, docTitle, docSubtitle, dynamicDocumentHeight])

  const effectiveSheetHeight = Math.max(dynamicDocumentHeight, renderedSheetHeight)

  // Summary statistics
  const stats = useMemo(() => {
    const total = parsedRows.length
    const matched = parsedRows.filter((r) => r.hasMatch).length
    const hasImage = parsedRows.filter((r) => !!r.gambar).length
    const sumNormal = parsedRows.reduce((s, r) => s + (r.hargaNormal || 0), 0)
    const sumDiskon = parsedRows.reduce((s, r) => s + (r.hargaDiskon || 0), 0)
    const avgDiskonPct = total > 0 ? parsedRows.reduce((s, r) => s + (r.diskonPct || 0), 0) / total : 0
    return { total, matched, hasImage, sumNormal, sumDiskon, avgDiskonPct }
  }, [parsedRows])

  // Export full document to JPG (strictly 1080px width, height >= 1920px to fit all rows)
  const exportSheetToJpg = async () => {
    if (!sheetContainerRef.current) return
    setGeneratingJpg(true)

    try {
      const sheetEl = sheetContainerRef.current

      // 1. Pre-convert all images within the sheet to base64 Data URLs so canvas doesn't get tainted
      const imgElements = Array.from(sheetEl.querySelectorAll('img[data-original-src]'))
      await Promise.all(
        imgElements.map(async (img) => {
          const originalSrc = img.getAttribute('data-original-src')
          if (originalSrc && !img.src.startsWith('data:')) {
            const b64 = await urlToBase64ViaProxy(originalSrc)
            if (b64) {
              img.src = b64
            }
          }
        })
      )

      await new Promise((r) => setTimeout(r, 120))

      // 2. Measure actual content height when transform is unscaled
      const prevTransform = sheetEl.style.transform
      const prevTransformOrigin = sheetEl.style.transformOrigin
      const prevMinHeight = sheetEl.style.minHeight
      const prevHeight = sheetEl.style.height

      // Temporarily remove transform to measure exact unscaled dimensions
      sheetEl.style.transform = 'none'
      const exportWidth = 1080
      const contentHeight = Math.ceil(sheetEl.scrollHeight)
      const exportHeight = Math.max(1920, contentHeight)

      sheetEl.style.minHeight = `${exportHeight}px`
      sheetEl.style.height = `${exportHeight}px`

      const canvas = await html2canvas(sheetEl, {
        width: exportWidth,
        height: exportHeight,
        scale: 1, // Exact 1:1 pixel mapping at 1080 x H
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#FFFFFF',
        logging: false,
        windowWidth: exportWidth,
        windowHeight: exportHeight,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        onclone: (clonedDoc) => {
          const clonedSheet = clonedDoc.getElementById('cetak-jadwal-sheet')
          if (clonedSheet) {
            clonedSheet.style.transform = 'none'
            clonedSheet.style.transformOrigin = 'top left'
            clonedSheet.style.width = '1080px'
            clonedSheet.style.minHeight = `${exportHeight}px`
            clonedSheet.style.height = `${exportHeight}px`
          }
        },
      })

      // Restore style
      sheetEl.style.transform = prevTransform
      sheetEl.style.transformOrigin = prevTransformOrigin
      sheetEl.style.minHeight = prevMinHeight
      sheetEl.style.height = prevHeight

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)

      // Download file
      const safeTitle = (docTitle || 'Jadwal-Promo')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const fileNameJpg = `${safeTitle}-1080x${exportHeight}.jpg`

      const link = document.createElement('a')
      link.download = fileNameJpg
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('[CetakJadwalPromo] Error generating JPG:', err)
      alert(`Gagal membuat gambar JPG: ${err.message}`)
    } finally {
      setGeneratingJpg(false)
    }
  }

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface, #ffffff)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          width: '100%',
          maxWidth: step === 'preview' ? '1220px' : '620px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'max-width 0.25s ease',
        }}
      >
        {/* ── Modal Header ── */}
        <div
          style={{
            padding: '1rem 1.4rem',
            borderBottom: '1px solid var(--border, #e5e3dc)',
            background: 'var(--bg, #fafaf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🖨️</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink, #1C1B19)' }}>
                  Cetak Jadwal Promo
                </h2>
                <span
                  style={{
                    background: '#047857',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 4,
                    letterSpacing: '0.04em',
                  }}
                >
                  POTRAIT 1080 × {effectiveSheetHeight} px
                </span>
              </div>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                {step === 'upload'
                  ? 'Unggah file Excel promo untuk mencocokkan stok & gambar dari database Stok Marketplace.'
                  : `Pratinjau lembar cetak potret 1080px (${parsedRows.length} baris produk, tidak ada yang terpotong).`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              width: 32,
              height: 32,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-muted, #6B6A66)',
            }}
          >
            ×
          </button>
        </div>

        {/* ── STEP 1: UPLOAD EXCEL ── */}
        {step === 'upload' && (
          <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                padding: '11px 15px',
                fontSize: 13,
                color: '#166534',
                lineHeight: 1.5,
              }}
            >
              ℹ️ <strong>Format Panduan:</strong> File Excel seperti <code>Periode 1.xlsx</code> yang memiliki kolom{' '}
              <strong>Kode Produk</strong>, <strong>Kode Variasi</strong>, dan <strong>Harga diskon</strong>. Sistem
              otomatis menggabungkan Harga Normal & Harga Diskon, serta menarik foto produk dan nama SKU dari Stok Marketplace.
            </div>

            {/* Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--primary, #3B3A8C)',
                borderRadius: 12,
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                background: 'rgba(59, 58, 140, 0.03)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.currentTarget.style.background = 'rgba(59, 58, 140, 0.08)'
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.currentTarget.style.background = 'rgba(59, 58, 140, 0.03)'
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.style.background = 'rgba(59, 58, 140, 0.03)'
                const f = e.dataTransfer.files?.[0]
                if (f) {
                  f.arrayBuffer().then((buf) => processExcelBuffer(buf, f.name))
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: 42, display: 'block', marginBottom: 8 }}>📊</span>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink, #1C1B19)' }}>
                Klik atau Seret File Excel (.xlsx / .xls) ke Sini
              </p>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
                Mendukung file ekspor dari Pembagian Promo atau format template Shopee
              </p>
            </div>

            {/* Quick Sample Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>Ingin mencoba langsung data sampel?</span>
              <button
                type="button"
                onClick={handleLoadSample}
                disabled={loadingSample || parsingFile}
                className="btn-export"
                style={{
                  background: '#3B3A8C',
                  fontSize: 13,
                  padding: '7px 16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                }}
              >
                {loadingSample ? 'Memuat sampel…' : '⚡ Muat Contoh (.data/Periode 1.xlsx)'}
              </button>
            </div>

            {/* Parsing or loading indicator */}
            {(parsingFile || loadingMp) && (
              <p className="loading-text" style={{ margin: 0, textAlign: 'center' }}>
                ⏳ Membaca file dan mencocokkan data dengan database Stok Marketplace…
              </p>
            )}

            {/* Error alert */}
            {parseError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#b91c1c',
                  fontSize: 13,
                }}
              >
                ❌ {parseError}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: PREVIEW & CUSTOMIZE DOCUMENT ── */}
        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Toolbar: Configuration Controls */}
            <div
              style={{
                padding: '0.85rem 1.4rem',
                borderBottom: '1px solid var(--border, #e5e3dc)',
                background: '#fbfbfa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                flexShrink: 0,
              }}
            >
              {/* Document Title Input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: '320px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--ink-muted)', marginBottom: 2 }}>
                    JUDUL DOKUMEN CETAK (DIATAS LEMBAR)
                  </label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Contoh: JADWAL PROMO CAMPAIGN SHOPEE - PERIODE 1"
                    className="login-input"
                    style={{
                      width: '100%',
                      padding: '6px 12px',
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: 'var(--ink, #111)',
                    }}
                  />
                </div>
                <div style={{ width: '220px' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--ink-muted)', marginBottom: 2 }}>
                    SUBTITLE / KETERANGAN
                  </label>
                  <input
                    type="text"
                    value={docSubtitle}
                    onChange={(e) => setDocSubtitle(e.target.value)}
                    placeholder="Contoh: Periode 10 - 15 Oktober 2026"
                    className="login-input"
                    style={{
                      width: '100%',
                      padding: '6px 12px',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* View / Zoom Controls & Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Zoom control */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '3px 8px' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', fontWeight: 600 }}>Zoom Preview:</span>
                  <select
                    value={zoomLevel}
                    onChange={(e) => setZoomLevel(Number(e.target.value))}
                    style={{ border: 'none', background: 'transparent', fontSize: 12, cursor: 'pointer', outline: 'none', fontWeight: 600 }}
                  >
                    <option value={0.35}>35%</option>
                    <option value={0.45}>45%</option>
                    <option value={0.5}>50% (Pas Layar)</option>
                    <option value={0.65}>65%</option>
                    <option value={1.0}>100% (Ukuran Asli 1080px)</option>
                  </select>
                </div>

                {/* Change file */}
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="pill-btn"
                  style={{ fontSize: 12.5, padding: '6px 12px' }}
                >
                  🔄 Ganti File
                </button>

                {/* Export JPG Button */}
                <button
                  type="button"
                  onClick={exportSheetToJpg}
                  disabled={generatingJpg}
                  className="btn-export"
                  style={{
                    background: '#047857',
                    fontSize: 13.5,
                    padding: '7px 16px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title="Generate dokumen ini menjadi gambar JPG berukuran lebar 1080px tanpa ada baris terpotong"
                >
                  <span>{generatingJpg ? '⏳ Merender Dokumen…' : `🖼️ Unduh JPG (1080 × ${effectiveSheetHeight} px)`}</span>
                </button>
              </div>
            </div>

            {/* Scrollable Preview Viewport */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'auto',
                padding: '1.5rem',
                background: '#cbd5e1',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
              }}
            >
              {/* Scaled Preview Wrapper */}
              <div
                style={{
                  width: `${1080 * zoomLevel}px`,
                  height: `${effectiveSheetHeight * zoomLevel}px`,
                  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.28)',
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#fff',
                  transformOrigin: 'top left',
                  marginBottom: '2rem',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                {/* ── THE PRINTABLE DOCUMENT CANVAS (Strictly 1080px Width, Height >= 1920px) ── */}
                <div
                  ref={sheetContainerRef}
                  id="cetak-jadwal-sheet"
                  style={{
                    width: '1080px',
                    minHeight: `${effectiveSheetHeight}px`,
                    background: '#FFFFFF',
                    color: '#0f172a',
                    padding: '36px 28px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    transform: `scale(${zoomLevel})`,
                    transformOrigin: 'top left',
                    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {/* Document Header Banner */}
                  <div
                    style={{
                      borderBottom: '3.5px solid #0f172a',
                      paddingBottom: '18px',
                      marginBottom: '18px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 24,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span
                          style={{
                            background: '#047857',
                            color: '#ffffff',
                            fontWeight: 900,
                            fontSize: '13.5px',
                            padding: '4px 11px',
                            borderRadius: '5px',
                            letterSpacing: '0.05em',
                          }}
                        >
                          PROMO CAMPAIGN
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#64748b' }}>
                          TMS Online · Marketplace Jadwal
                        </span>
                      </div>
                      <h1
                        style={{
                          margin: 0,
                          fontSize: '34px',
                          fontWeight: 900,
                          color: '#0f172a',
                          letterSpacing: '-0.02em',
                          lineHeight: 1.15,
                          wordBreak: 'break-word',
                        }}
                      >
                        {docTitle || 'JADWAL PROMO CAMPAIGN'}
                      </h1>
                      {docSubtitle && (
                        <p style={{ margin: '6px 0 0', fontSize: '16px', color: '#475569', fontWeight: 600 }}>
                          {docSubtitle}
                        </p>
                      )}
                    </div>

                    {/* Header Metadata Chips */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          background: '#f8fafc',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: 8,
                          padding: '7px 16px',
                          fontSize: '15px',
                          fontWeight: 700,
                          color: '#334155',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span>📦 Total:</span>
                        <strong style={{ color: '#0f172a', fontSize: '16px' }}>{parsedRows.length} SKU</strong>
                        <span style={{ color: '#94a3b8' }}>·</span>
                        <span>Rata-rata Diskon:</span>
                        <strong style={{ color: '#dc2626', fontSize: '16px' }}>{stats.avgDiskonPct.toFixed(0)}%</strong>
                      </div>
                      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                        Format Cetak Potret 1080 × {effectiveSheetHeight} px · {new Date().toLocaleDateString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {/* ── Main Data Table (ALL Rows Included - NEVER Cropped) ── */}
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '15px',
                        lineHeight: 1.3,
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            textAlign: 'left',
                            fontSize: '15px',
                            fontWeight: 900,
                            letterSpacing: '0.04em',
                            height: '50px',
                          }}
                        >
                          <th style={{ padding: '10px 6px', textAlign: 'center', width: '54px', borderRight: '1.5px solid #334155' }}>
                            NO.
                          </th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', width: '96px', borderRight: '1.5px solid #334155' }}>
                            GAMBAR
                          </th>
                          <th style={{ padding: '10px 10px', width: '180px', borderRight: '1.5px solid #334155' }}>
                            KODE VARIASI
                          </th>
                          <th style={{ padding: '10px 12px', width: '380px', borderRight: '1.5px solid #334155' }}>
                            SKU
                          </th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', width: '184px', borderRight: '1.5px solid #334155' }}>
                            HARGA
                          </th>
                          <th style={{ padding: '10px 10px', textAlign: 'center', width: '130px' }}>
                            DISKON
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.map((r, idx) => {
                          const isEven = idx % 2 === 1
                          return (
                            <tr
                              key={r.id || idx}
                              style={{
                                background: isEven ? '#f8fafc' : '#ffffff',
                                borderBottom: '1.5px solid #e2e8f0',
                                height: '76px',
                              }}
                            >
                              {/* No. */}
                              <td
                                style={{
                                  padding: '8px 6px',
                                  textAlign: 'center',
                                  fontFamily: 'monospace',
                                  fontWeight: 800,
                                  fontSize: '18px',
                                  color: '#475569',
                                  borderRight: '1.5px solid #e2e8f0',
                                }}
                              >
                                {r.no}
                              </td>

                              {/* Gambar (Large 64x64 Thumbnail) */}
                              <td
                                style={{
                                  padding: '6px 8px',
                                  textAlign: 'center',
                                  verticalAlign: 'middle',
                                  borderRight: '1.5px solid #e2e8f0',
                                }}
                              >
                                {r.gambar ? (
                                  <div
                                    style={{
                                      width: 64,
                                      height: 64,
                                      borderRadius: 8,
                                      overflow: 'hidden',
                                      border: '1.5px solid #cbd5e1',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      background: '#f8fafc',
                                      cursor: 'pointer',
                                    }}
                                    onClick={() => setPreviewZoomImage({ url: r.gambar, title: r.sku })}
                                    title="Klik untuk melihat gambar besar"
                                  >
                                    <img
                                      src={r.gambar}
                                      data-original-src={r.gambar}
                                      alt={r.sku}
                                      referrerPolicy="no-referrer"
                                      crossOrigin="anonymous"
                                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    />
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      width: 64,
                                      height: 64,
                                      borderRadius: 8,
                                      border: '1.5px dashed #cbd5e1',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      background: '#f8fafc',
                                    }}
                                  >
                                    <span style={{ fontSize: 26, color: '#94a3b8' }}>📦</span>
                                  </div>
                                )}
                              </td>

                              {/* Kode Variasi */}
                              <td
                                style={{
                                  padding: '8px 10px',
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                  fontSize: '15px',
                                  fontWeight: 700,
                                  color: '#1e293b',
                                  borderRight: '1.5px solid #e2e8f0',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {r.kodeVariasi}
                              </td>

                              {/* SKU */}
                              <td
                                style={{
                                  padding: '8px 12px',
                                  fontWeight: 800,
                                  color: '#0f172a',
                                  fontSize: '17.5px',
                                  lineHeight: 1.25,
                                  borderRight: '1.5px solid #e2e8f0',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {r.sku}
                              </td>

                              {/* Combined HARGA: Normal (Strikethrough) on top, Diskon below */}
                              <td
                                style={{
                                  padding: '8px 12px',
                                  textAlign: 'right',
                                  borderRight: '1.5px solid #e2e8f0',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-end',
                                    justifyContent: 'center',
                                    gap: 2,
                                  }}
                                >
                                  {r.diskonPct > 0 && r.hargaNormal > 0 && (
                                    <span
                                      style={{
                                        fontSize: '15px',
                                        color: '#64748b',
                                        textDecoration: 'line-through',
                                        fontFamily: 'ui-monospace, monospace',
                                        fontWeight: 650,
                                        lineHeight: 1.15,
                                      }}
                                    >
                                      {formatRupiah(r.hargaNormal)}
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: '20px',
                                      fontWeight: 900,
                                      color: '#047857',
                                      fontFamily: 'ui-monospace, monospace',
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {formatRupiah(r.hargaDiskon)}
                                  </span>
                                </div>
                              </td>

                              {/* Diskon % Badge */}
                              <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {r.diskonPct > 0 ? (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      background: '#fee2e2',
                                      color: '#dc2626',
                                      fontWeight: 900,
                                      fontSize: '17px',
                                      padding: '5px 14px',
                                      borderRadius: '7px',
                                      border: '1.5px solid #f87171',
                                      letterSpacing: '0.02em',
                                    }}
                                  >
                                    {r.diskonPct.toFixed(0)}%
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: 16 }}>—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Document Footer Bar */}
                  <div
                    style={{
                      borderTop: '2.5px solid #e2e8f0',
                      paddingTop: '18px',
                      marginTop: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '14px',
                      color: '#475569',
                      fontWeight: 650,
                    }}
                  >
                    <span>
                      Dokumen Resmi Jadwal Promo · TMS Online Dashboard · Format Potret 1080 × {effectiveSheetHeight} px
                    </span>
                    <span>
                      Total: <strong>{parsedRows.length} Produk SKU</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal Footer ── */}
        <div
          style={{
            padding: '0.75rem 1.4rem',
            borderTop: '1px solid var(--border, #e5e3dc)',
            background: 'var(--bg, #fafaf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>
            {step === 'preview' && (
              <span>
                File: <strong>{fileName}</strong> · {stats.matched} dari {stats.total} SKU cocok dengan database Stok Marketplace
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              className="pill-btn"
              style={{ padding: '6px 16px', fontSize: 13 }}
            >
              Tutup
            </button>
          </div>
        </div>
      </div>

      {/* Image Zoom Modal */}
      {previewZoomImage && (
        <div
          onClick={() => setPreviewZoomImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '1.25rem',
              maxWidth: '520px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <img
              src={previewZoomImage.url}
              alt={previewZoomImage.title}
              referrerPolicy="no-referrer"
              style={{ maxWidth: '100%', maxHeight: '460px', objectFit: 'contain', borderRadius: 8 }}
            />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111', textAlign: 'center' }}>
              {previewZoomImage.title}
            </p>
            <button
              type="button"
              onClick={() => setPreviewZoomImage(null)}
              className="pill-btn"
              style={{ fontSize: 13, padding: '5px 16px' }}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
