// Ekspor PDF dari apa yang tampil di layar (termasuk grafik canvas Chart.js).
//
// Pendekatan: render elemen DOM yang diberikan ke <canvas> lewat html2canvas
// (ini otomatis "memotret" isi <canvas> chart.js juga, karena html2canvas
// membaca ulang pixel dari elemen <canvas> yang sudah dirender), lalu potong
// gambar itu jadi beberapa halaman PDF ukuran A4 lewat jsPDF.
//
// html2canvas & jsPDF sengaja di-import secara dinamis (bukan di top-level)
// supaya tidak ikut ke server bundle -- keduanya murni library browser.

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const PAGE_MARGIN_MM = 8

/**
 * Beberapa blok di dashboard (tabel pivot, tabel peringkat, dll.) dibungkus
 * container dengan `overflow-x: auto` (dan pivot juga `max-height` +
 * `overflow-y: auto`) supaya bisa di-scroll di layar. html2canvas hanya
 * memotret apa yang kelihatan di dalam kotak yang di-clip itu -- jadi tanpa
 * langkah ini, kolom/baris yang "tersembunyi" di balik scrollbar akan
 * terpotong di PDF. Fungsi ini mencari semua elemen yang kontennya lebih
 * besar dari kotaknya (scrollWidth/Height > clientWidth/Height), lalu
 * melebarkan/mentinggikannya sementara supaya seluruh isinya kelihatan,
 * baru dipotret. `restore()` mengembalikan style aslinya setelah selesai.
 */
function expandScrollableRegions(root) {
  const changed = []
  const all = [root, ...root.querySelectorAll('*')]

  for (const el of all) {
    if (!(el instanceof HTMLElement)) continue
    const style = window.getComputedStyle(el)
    const overflowsX = el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(style.overflowX)
    const overflowsY = el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(style.overflowY)
    if (!overflowsX && !overflowsY) continue

    changed.push({
      el,
      overflow: el.style.overflow,
      overflowX: el.style.overflowX,
      overflowY: el.style.overflowY,
      maxHeight: el.style.maxHeight,
      maxWidth: el.style.maxWidth,
      width: el.style.width,
    })

    if (overflowsX) {
      el.style.overflowX = 'visible'
      el.style.maxWidth = 'none'
      el.style.width = `${el.scrollWidth}px`
    }
    if (overflowsY) {
      el.style.overflowY = 'visible'
      el.style.maxHeight = 'none'
    }
  }

  return function restore() {
    for (const rec of changed) {
      rec.el.style.overflow = rec.overflow
      rec.el.style.overflowX = rec.overflowX
      rec.el.style.overflowY = rec.overflowY
      rec.el.style.maxHeight = rec.maxHeight
      rec.el.style.maxWidth = rec.maxWidth
      rec.el.style.width = rec.width
    }
  }
}

/**
 * @param {HTMLElement} element - elemen yang mau di-screenshot (mis. seluruh area dashboard)
 * @param {string} fileName - nama file PDF, tanpa ekstensi
 * @param {{ title?: string, subtitle?: string, onProgress?: (msg: string) => void }} [opts]
 */
export async function exportElementToPdf(element, fileName, opts = {}) {
  if (!element) throw new Error('Tidak ada elemen untuk diekspor.')
  const { title, subtitle, onProgress } = opts

  onProgress?.('Menyiapkan tampilan…')
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  onProgress?.('Mengambil gambar dashboard…')

  // Render pada lebar tetap (desktop-like) supaya tabel lebar tidak terpotong
  // oleh viewport asli device (mis. saat dibuka dari HP), dan sementara
  // "buka" semua container yang di-scroll supaya tidak ada baris/kolom tabel
  // yang kepotong di hasil PDF.
  const restoreScrollables = expandScrollableRegions(element)
  const targetWidth = Math.max(element.scrollWidth, 1080)

  let canvas
  try {
    canvas = await html2canvas(element, {
      scale: Math.min(2, window.devicePixelRatio > 1 ? 2 : 1.5),
      useCORS: true,
      backgroundColor: '#FAFAF8',
      windowWidth: targetWidth,
      width: targetWidth,
      scrollX: 0,
      scrollY: 0,
    })
  } finally {
    restoreScrollables()
  }

  onProgress?.('Menyusun halaman PDF…')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const usableWidth = A4_WIDTH_MM - PAGE_MARGIN_MM * 2
  const usableHeight = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2

  const pxPerMm = canvas.width / usableWidth
  const pageHeightPx = Math.floor(usableHeight * pxPerMm)

  let headerOffsetMm = 0
  let firstPage = true

  if (title) {
    pdf.setFontSize(14)
    pdf.setFont(undefined, 'bold')
    pdf.text(title, PAGE_MARGIN_MM, PAGE_MARGIN_MM + 4)
    headerOffsetMm += 6
  }
  if (subtitle) {
    pdf.setFontSize(10)
    pdf.setFont(undefined, 'normal')
    pdf.setTextColor(110, 110, 110)
    pdf.text(subtitle, PAGE_MARGIN_MM, PAGE_MARGIN_MM + 4 + headerOffsetMm)
    headerOffsetMm += 6
    pdf.setTextColor(0, 0, 0)
  }
  if (headerOffsetMm > 0) headerOffsetMm += 4

  let renderedPx = 0
  const totalPx = canvas.height
  let pageIndex = 0

  while (renderedPx < totalPx) {
    const sliceHeightPx = Math.min(
      pageHeightPx - (firstPage ? Math.round(headerOffsetMm * pxPerMm) : 0),
      totalPx - renderedPx
    )
    if (sliceHeightPx <= 0) break

    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = canvas.width
    sliceCanvas.height = sliceHeightPx
    const ctx = sliceCanvas.getContext('2d')
    ctx.drawImage(
      canvas,
      0, renderedPx, canvas.width, sliceHeightPx,
      0, 0, canvas.width, sliceHeightPx
    )

    const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92)
    const imgHeightMm = sliceHeightPx / pxPerMm

    if (pageIndex > 0) pdf.addPage()
    const yPos = firstPage ? PAGE_MARGIN_MM + headerOffsetMm : PAGE_MARGIN_MM
    pdf.addImage(imgData, 'JPEG', PAGE_MARGIN_MM, yPos, usableWidth, imgHeightMm)

    renderedPx += sliceHeightPx
    firstPage = false
    pageIndex += 1
  }

  onProgress?.('Menyimpan file…')
  pdf.save(`${fileName}.pdf`)
}
