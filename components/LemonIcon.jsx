'use client'

import { useId } from 'react'

export default function LemonIcon({ size = 24, className = '', ...props }) {
  const rawId = useId()
  const cleanId = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const lemonGrad = `lemonGrad_${cleanId}`
  const lemonHighlight = `lemonHighlight_${cleanId}`
  const leafGrad1 = `leafGrad1_${cleanId}`
  const leafGrad2 = `leafGrad2_${cleanId}`
  const subtleShadow = `subtleShadow_${cleanId}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      {...props}
    >
      <defs>
        <linearGradient id={lemonGrad} x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#FFF566" />
          <stop offset="25%" stopColor="#FDE047" />
          <stop offset="65%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#CA8A04" />
        </linearGradient>

        <linearGradient id={lemonHighlight} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={leafGrad1} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#16A34A" />
          <stop offset="60%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#86EFAC" />
        </linearGradient>

        <linearGradient id={leafGrad2} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#15803D" />
          <stop offset="100%" stopColor="#4ADE80" />
        </linearGradient>

        <filter id={subtleShadow} x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.3" />
        </filter>
      </defs>

      <g filter={`url(#${subtleShadow})`}>
        {/* Stem */}
        <path d="M43 23 C 44 20, 46 17, 48 15" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* Small Back Leaf */}
        <path d="M47 16 C 53 14, 58 17, 57 22 C 52 23, 48 20, 47 16 Z" fill={`url(#${leafGrad2})`} />

        {/* Big Front Leaf */}
        <path d="M45 18 C 45 9, 34 6, 27 8 C 26 17, 36 21, 45 18 Z" fill={`url(#${leafGrad1})`} />
        {/* Leaf vein */}
        <path d="M45 18 C 39 14, 33 11, 27 8" stroke="#15803D" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.6" />

        {/* Lemon Body */}
        <g transform="translate(31, 37) rotate(-32)">
          <path
            d="M 23,0 
               C 21.5,-2.2 18,-6.5 13,-9.5 
               C 7,-13.5 -2,-14 -8,-12 
               C -15,-10 -19.5,-5 -22.5,-1.8 
               L -25.5,0 
               L -22.5,1.8 
               C -19.5,5 -15,10 -8,12 
               C -2,14 7,13.5 13,9.5 
               C 18,6.5 21.5,2.2 23,0 Z"
            fill={`url(#${lemonGrad})`}
          />

          <path
            d="M 21.5,-0.5 
               C 17,-5.5 12,-8.5 6,-11 
               C 0,-12.5 -7,-11.5 -13,-9 
               C -18,-6.5 -21,-2.5 -22.5,-0.5
               C -20,-1.8 -16,-5 -11,-7
               C -5,-9 2,-9.5 8,-7.5
               C 13,-5.5 18,-2.5 21.5,-0.5 Z"
            fill={`url(#${lemonHighlight})`}
          />

          <ellipse cx="-2" cy="-6" rx="9" ry="3.2" transform="rotate(-7)" fill="#FFFFFF" opacity="0.45" />
        </g>
      </g>
    </svg>
  )
}
