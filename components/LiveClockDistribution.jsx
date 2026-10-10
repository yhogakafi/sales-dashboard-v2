'use client'

import React, { useMemo } from 'react'

/**
 * 12-Hour Analog Clock helper to plot sessions on a clock face (1 - 12)
 */
function ClockFace12({
  hostName,
  hostBadge,
  hostIcon,
  shiftLabel,
  sessions,
  accentColor,
  bgGradient,
  arcConfig, // { startHour: 6, spanHours: 11 }
  fmtRp,
  fmtInt,
  formatDurationHM,
}) {
  const size = 280
  const cx = size / 2
  const cy = size / 2
  const radius = 118
  const rNumbers = 92

  // Generate 60 ticks (12 major hours, 48 minor minutes)
  const ticks = useMemo(() => {
    const list = []
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * 2 * Math.PI - Math.PI / 2
      const isMajor = i % 5 === 0
      const r1 = isMajor ? radius - 8 : radius - 4
      const r2 = radius
      list.push({
        x1: (cx + r1 * Math.cos(angle)).toFixed(1),
        y1: (cy + r1 * Math.sin(angle)).toFixed(1),
        x2: (cx + r2 * Math.cos(angle)).toFixed(1),
        y2: (cy + r2 * Math.sin(angle)).toFixed(1),
        isMajor,
      })
    }
    return list
  }, [cx, cy, radius])

  // Numbers 1 to 12 around clock
  const numbers = useMemo(() => {
    const nums = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    return nums.map((num) => {
      const angle = (num / 12) * 2 * Math.PI - Math.PI / 2
      const x = cx + rNumbers * Math.cos(angle)
      const y = cy + rNumbers * Math.sin(angle)
      return { num, x: x.toFixed(1), y: y.toFixed(1) }
    })
  }, [cx, cy, rNumbers])

  // Shift window sector/arc
  const shiftArcPath = useMemo(() => {
    if (!arcConfig) return ''
    const { startHour, spanHours } = arcConfig
    const rOuter = radius - 2
    const rInner = 28
    const a1 = (startHour / 12) * 2 * Math.PI - Math.PI / 2
    const a2 = ((startHour + spanHours) / 12) * 2 * Math.PI - Math.PI / 2
    const x1_out = cx + rOuter * Math.cos(a1)
    const y1_out = cy + rOuter * Math.sin(a1)
    const x2_out = cx + rOuter * Math.cos(a2)
    const y2_out = cy + rOuter * Math.sin(a2)
    const x2_in = cx + rInner * Math.cos(a2)
    const y2_in = cy + rInner * Math.sin(a2)
    const x1_in = cx + rInner * Math.cos(a1)
    const y1_in = cy + rInner * Math.sin(a1)
    const largeArc = spanHours > 6 ? 1 : 0
    return `M ${x1_in} ${y1_in} L ${x1_out} ${y1_out} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2_out} ${y2_out} L ${x2_in} ${y2_in} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x1_in} ${y1_in} Z`
  }, [arcConfig, cx, cy, radius])

  // Plotted session dots
  const sessionDots = useMemo(() => {
    return sessions.map((s, idx) => {
      const startDate = new Date(s.startTimestamp)
      const hour24 = isNaN(startDate.getTime())
        ? 0
        : startDate.getHours() + startDate.getMinutes() / 60
      const hour12 = hour24 % 12 || 12
      const angle = (hour12 / 12) * 2 * Math.PI - Math.PI / 2
      // Distribute radially in 3 bands (58, 67, 76) so overlapping times are visible
      const rDot = 58 + ((idx % 3) * 9)
      const x = cx + rDot * Math.cos(angle)
      const y = cy + rDot * Math.sin(angle)
      return {
        id: s.id || idx,
        x: x.toFixed(1),
        y: y.toFixed(1),
        time: s.startTime || '',
        name: s.nama || '',
        day: s.dayName || '',
        sales: s.penjualanDibuat || 0,
        orders: s.pesananDibuat || 0,
        durSec: s.durSec || 0,
      }
    })
  }, [sessions, cx, cy])

  // Calculate stats
  const totalSessions = sessions.length
  const totalDurSec = useMemo(
    () => sessions.reduce((acc, s) => acc + (s.durSec || 0), 0),
    [sessions]
  )
  const avgDurMins = totalSessions > 0 ? Math.round(totalDurSec / totalSessions / 60) : 0

  // Peak hour
  const peakHourStr = useMemo(() => {
    if (sessions.length === 0) return '-'
    const hourCounts = {}
    sessions.forEach((s) => {
      const d = new Date(s.startTimestamp)
      if (!isNaN(d.getTime())) {
        const h = d.getHours()
        hourCounts[h] = (hourCounts[h] || 0) + 1
      }
    })
    let maxH = -1
    let maxC = 0
    Object.entries(hourCounts).forEach(([h, c]) => {
      if (c > maxC) {
        maxC = c
        maxH = +h
      }
    })
    if (maxH === -1) return '-'
    const nextH = (maxH + 1) % 24
    return `${String(maxH).padStart(2, '0')}:00 – ${String(nextH).padStart(2, '0')}:00 (${maxC}x)`
  }, [sessions])

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1.5px solid #FEF08A',
        padding: '20px 22px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Header */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '18px', color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
              {hostName}
            </h4>
            <span
              style={{
                background: hostBadge.bg,
                color: hostBadge.color,
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                border: `1px solid ${hostBadge.border}`,
              }}
            >
              {hostIcon}
              {hostBadge.label}
            </span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#78716C', fontFamily: 'IBM Plex Mono, monospace' }}>
            {shiftLabel}
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color: accentColor, fontFamily: 'IBM Plex Mono, monospace' }}>
            {totalSessions}
          </span>
          <span style={{ fontSize: '11px', color: '#78716C', display: 'block' }}>sesi live</span>
        </div>
      </div>

      {/* 12-Hour Analog Clock SVG */}
      <div style={{ margin: '6px 0 12px', position: 'relative' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <radialGradient id={`clock-grad-${hostName}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={bgGradient.stop0} />
              <stop offset="85%" stopColor={bgGradient.stop85} />
              <stop offset="100%" stopColor={bgGradient.stop100} />
            </radialGradient>
            <filter id={`glow-${hostName}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={accentColor} floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Clock Outer Rim */}
          <circle
            cx={cx}
            cy={cy}
            r={radius + 4}
            fill="#FFFFFF"
            stroke="#FEF08A"
            strokeWidth="3"
            filter="drop-shadow(0 4px 10px rgba(0,0,0,0.04))"
          />

          {/* Clock Dial Face */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill={`url(#clock-grad-${hostName})`}
            stroke="#FDE047"
            strokeWidth="1.2"
          />

          {/* Shift Window Sector (Highlighted Range) */}
          {shiftArcPath && (
            <path
              d={shiftArcPath}
              fill={arcConfig.fill}
              stroke={arcConfig.stroke}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {/* Minute & Hour Ticks */}
          {ticks.map((t, idx) => (
            <line
              key={idx}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.isMajor ? '#A16207' : '#D4D4D8'}
              strokeWidth={t.isMajor ? '2' : '1'}
              strokeLinecap="round"
            />
          ))}

          {/* Clock Numbers (1 – 12) */}
          {numbers.map(({ num, x, y }) => (
            <text
              key={num}
              x={x}
              y={y}
              fontFamily="Fraunces, serif"
              fontSize={num === 12 || num === 3 || num === 6 || num === 9 ? '15' : '13'}
              fontWeight="700"
              fill={num === 12 || num === 3 || num === 6 || num === 9 ? '#713F12' : '#854D0E'}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {num}
            </text>
          ))}

          {/* Inner Decorative Dial Ring */}
          <circle cx={cx} cy={cy} r="32" fill="none" stroke="#FEF08A" strokeWidth="1" strokeDasharray="2 2" />

          {/* Plotted Live Streaming Session Markers */}
          {sessionDots.map((d) => (
            <g key={d.id} className="live-clock-dot" style={{ cursor: 'pointer' }}>
              <title>{`${hostName} · ${d.day}, ${d.time}\nJudul: ${d.name}\nOmzet: ${fmtRp(d.sales)} (${d.orders} pesanan)\nDurasi: ${formatDurationHM(d.durSec)}`}</title>
              <circle
                cx={d.x}
                cy={d.y}
                r="4.2"
                fill={accentColor}
                stroke="#FFFFFF"
                strokeWidth="1.6"
                filter={`url(#glow-${hostName})`}
              />
            </g>
          ))}

          {/* Center Pivot Pin */}
          <circle cx={cx} cy={cy} r="7" fill="#713F12" />
          <circle cx={cx} cy={cy} r="3" fill="#FEF08A" />
        </svg>
      </div>

      {/* Clock Stats Footer */}
      <div
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px 12px',
          background: '#FFFDF5',
          border: '1px solid #FEF08A',
          borderRadius: '10px',
          padding: '10px 12px',
          fontSize: '11.5px',
        }}
      >
        <div>
          <span style={{ color: '#78716C', display: 'block' }}>Total Durasi</span>
          <strong style={{ color: '#1C1917', fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px' }}>
            {formatDurationHM(totalDurSec)}
          </strong>
        </div>
        <div>
          <span style={{ color: '#78716C', display: 'block' }}>Rata-rata / Sesi</span>
          <strong style={{ color: '#1C1917', fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px' }}>
            {avgDurMins} menit
          </strong>
        </div>
        <div style={{ gridColumn: 'span 2', borderTop: '1px dashed #FEF08A', paddingTop: '6px' }}>
          <span style={{ color: '#78716C', display: 'block' }}>Jam Live Terbanyak (Peak)</span>
          <strong style={{ color: accentColor, fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}>
            {peakHourStr}
          </strong>
        </div>
      </div>
    </div>
  )
}

/**
 * Main 12-Hour Distribution Component
 * Renders two analog clocks side-by-side in one container card
 */
export default function LiveClockDistribution({
  astridRows = [],
  fifiRows = [],
  astridSummary = {},
  fifiSummary = {},
  comparisonMetrics = [],
  fmtRp,
  fmtInt,
  formatDurationHM,
}) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1.5px solid #FEF08A',
        padding: '22px 24px',
        boxShadow: '0 2px 10px rgba(234, 179, 8, 0.05)',
        marginBottom: '1.5rem',
      }}
    >
      {/* Container Header */}
      <div style={{ marginBottom: '18px' }}>
        <h3 style={{ margin: '0 0 3px', fontSize: '18px', color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
          Distribusi Jam Live Streaming (Format 12 Jam)
        </h3>
        <p style={{ margin: 0, fontSize: '12.5px', color: '#78716C' }}>
          Sebaran waktu mulai sesi live streaming pada dial jam analog 12 jam (angka 1 – 12), dipisahkan per host penugasan. Arahkan kursor ke titik jam untuk melihat detail sesi.
        </p>
      </div>

      {/* Clocks Grid: 2 Clocks Side-by-Side */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
          alignItems: 'stretch',
          marginBottom: '20px',
        }}
      >
        {/* Clock 1: Astrid (Shift Siang) */}
        <ClockFace12
          hostName="Astrid"
          hostBadge={{
            label: 'Shift Siang',
            color: '#8A5D1A',
            bg: '#F4E3C4',
            border: '#C88A2E',
          }}
          hostIcon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#D97706' }}>
              <circle cx="12" cy="12" r="5" fill="#F59E0B" stroke="#D97706" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          }
          shiftLabel="06:00 – 17:00 WIB"
          sessions={astridRows}
          accentColor="#C88A2E"
          bgGradient={{
            stop0: '#FFFFFF',
            stop85: '#FFFDF5',
            stop100: '#FEF9C3',
          }}
          arcConfig={{
            startHour: 6,
            spanHours: 11, // 06:00 to 17:00 (hour 5 on 12h dial)
            fill: 'rgba(245, 158, 11, 0.15)',
            stroke: '#F59E0B',
          }}
          fmtRp={fmtRp}
          fmtInt={fmtInt}
          formatDurationHM={formatDurationHM}
        />

        {/* Clock 2: Fifi (Shift Malam) */}
        <ClockFace12
          hostName="Fifi"
          hostBadge={{
            label: 'Shift Malam',
            color: '#342E59',
            bg: '#DCD9EE',
            border: '#40396E',
          }}
          hostIcon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#6366F1" stroke="#4338CA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          }
          shiftLabel="17:00 – 06:00 WIB"
          sessions={fifiRows}
          accentColor="#40396E"
          bgGradient={{
            stop0: '#FFFFFF',
            stop85: '#FDFBFF',
            stop100: '#EDE9FE',
          }}
          arcConfig={{
            startHour: 5,
            spanHours: 13, // 17:00 to 06:00 (hour 6 on 12h dial)
            fill: 'rgba(99, 102, 241, 0.14)',
            stroke: '#6366F1',
          }}
          fmtRp={fmtRp}
          fmtInt={fmtInt}
          formatDurationHM={formatDurationHM}
        />
      </div>

      {/* Astrid vs Fifi Comparison Bars inside container */}
      {comparisonMetrics.length > 0 && (
        <div
          style={{
            background: '#FFFDF5',
            borderRadius: '12px',
            border: '1px solid #FEF08A',
            padding: '16px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '15px', color: '#1C1917', fontFamily: 'Fraunces, serif' }}>
              Perbandingan Metrik Utama Astrid vs Fifi
            </h4>
            <div style={{ display: 'flex', gap: '14px', fontSize: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#8A5D1A', fontWeight: 600 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#C88A2E' }} />
                Astrid
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#342E59', fontWeight: 600 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#40396E' }} />
                Fifi
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px 20px' }}>
            {comparisonMetrics.map(({ label, aVal, fVal, fmt }) => {
              const total = aVal + fVal || 1
              const pa = Math.min(100, Math.max(0, +((aVal / total) * 100).toFixed(1)))
              const pf = Math.min(100, Math.max(0, +(100 - pa).toFixed(1)))
              return (
                <div key={label}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      color: '#78716C',
                      marginBottom: '4px',
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#1C1917' }}>{label}</span>
                    <span>
                      {fmt(aVal)} ({pa}%) vs {fmt(fVal)} ({pf}%)
                    </span>
                  </div>
                  <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#E7E5E4' }}>
                    <div style={{ width: `${pa}%`, background: '#C88A2E', transition: 'width 0.3s ease' }} />
                    <div style={{ width: `${pf}%`, background: '#40396E', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
