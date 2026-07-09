import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

// Pin colors by job status
const STATUS_COLOR = {
  active:    '#22c55e',
  on_hold:   '#f59e0b',
  completed: '#6366f1',
  cancelled: '#ef4444',
}
const STATUS_LABEL = {
  active:    'Active',
  on_hold:   'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function makePinSvg(color) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
      <filter id="s" x="-30%" y="-10%" width="160%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
      </filter>
      <path filter="url(#s)"
        d="M14 2C8.477 2 4 6.477 4 12c0 7.5 10 22 10 22s10-14.5 10-22C24 6.477 19.523 2 14 2z"
        fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="14" cy="12" r="4.5" fill="#fff" opacity="0.9"/>
    </svg>
  `
}

export default function JobsMap({ jobs, onJobClick }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markersRef   = useRef([])

  const mappable = jobs.filter(j => j.latitude && j.longitude)

  useEffect(() => {
    if (!containerRef.current) return

    // Dynamically import to avoid SSR issues
    import('leaflet').then(({ default: L }) => {
      // Init map once
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: true,
          scrollWheelZoom: true,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapRef.current)
      }

      const map = mapRef.current

      // Clear old markers
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []

      if (mappable.length === 0) {
        map.setView([25.77, -80.19], 10) // default to Miami
        return
      }

      // Group jobs by lat/lng to detect stacking and offset them
      const coordKey = j => `${parseFloat(j.latitude).toFixed(5)},${parseFloat(j.longitude).toFixed(5)}`
      const groups = {}
      mappable.forEach(j => {
        const k = coordKey(j)
        if (!groups[k]) groups[k] = []
        groups[k].push(j)
      })

      mappable.forEach(job => {
        const key   = coordKey(job)
        const group = groups[key]
        const idx   = group.indexOf(job)
        // Offset overlapping pins slightly in a circle
        const angle  = (idx / group.length) * 2 * Math.PI
        const radius = group.length > 1 ? 0.0003 : 0
        const lat    = parseFloat(job.latitude)  + radius * Math.sin(angle)
        const lng    = parseFloat(job.longitude) + radius * Math.cos(angle)

        const color = STATUS_COLOR[job.status] ?? '#6b7280'
        const icon  = L.divIcon({
          html:      makePinSvg(color),
          className: '',
          iconSize:  [28, 38],
          iconAnchor:[14, 38],
          popupAnchor:[0, -40],
        })

        const assignedNames = (job.assigned_employees ?? []).map(e => e.name).join(', ') || 'None assigned'

        const popup = L.popup({ maxWidth: 260, className: 'jobs-map-popup' }).setContent(`
          <div style="font-family:system-ui,sans-serif;line-height:1.5;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
              <strong style="font-size:13px;color:#0f172a">${job.name}</strong>
            </div>
            <p style="margin:0 0 2px;font-size:12px;color:#475569"><strong>Client:</strong> ${job.client_name || '—'}</p>
            <p style="margin:0 0 2px;font-size:12px;color:#475569"><strong>Address:</strong> ${job.address || '—'}</p>
            <p style="margin:0 0 2px;font-size:12px;color:#475569"><strong>Status:</strong> <span style="color:${color};font-weight:600">${STATUS_LABEL[job.status] ?? job.status}</span></p>
            <p style="margin:0 0 8px;font-size:12px;color:#475569"><strong>Assigned:</strong> ${assignedNames}</p>
            <button
              onclick="window.__jobMapClick && window.__jobMapClick(${job.id})"
              style="width:100%;padding:6px 12px;border-radius:8px;background:#6366f1;color:#fff;border:none;font-size:12px;font-weight:600;cursor:pointer"
            >Edit Job</button>
          </div>
        `)

        const marker = L.marker([lat, lng], { icon }).bindPopup(popup).addTo(map)
        markersRef.current.push(marker)
      })

      // Fit map to all markers
      const bounds = L.latLngBounds(markersRef.current.map(m => m.getLatLng()))
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 })
    })

    return () => {
      // Don't destroy map on re-render, just let the effect re-run
    }
  }, [jobs])

  // Bridge the popup button click to the React handler
  useEffect(() => {
    window.__jobMapClick = (id) => {
      const job = jobs.find(j => j.id === id)
      if (job && onJobClick) onJobClick(job)
    }
    return () => { delete window.__jobMapClick }
  }, [jobs, onJobClick])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  if (mappable.length === 0 && jobs.length > 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center h-40 text-sm text-gray-400 mb-6">
        No jobs have coordinates yet. Add an address to a job to see it on the map.
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 380, position: 'relative', zIndex: 0 }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}
