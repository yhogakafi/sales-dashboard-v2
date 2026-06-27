'use client'

import { useCallback, useRef, useState } from 'react'

export default function UploadZone({ onFile, error, fileName }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleFiles = useCallback(
    (files) => {
      const file = files?.[0]
      if (!file) return
      onFile(file)
    },
    [onFile]
  )

  return (
    <div className="upload-wrap">
      <div
        className={`upload-zone ${dragOver ? 'is-dragover' : ''} ${error ? 'has-error' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        <div className="upload-stack" aria-hidden="true">
          <span className="sheet sheet-3" />
          <span className="sheet sheet-2" />
          <span className="sheet sheet-1" />
        </div>
        <p className="upload-title">
          {fileName ? fileName : 'Letakkan file faktur di sini'}
        </p>
        <p className="upload-sub">
          {fileName
            ? 'Klik atau seret file lain untuk mengganti'
            : 'atau klik untuk pilih file .xlsx dari komputer'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="upload-input"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <p className="upload-error">{error}</p>}
    </div>
  )
}
