import { useState, useEffect, useRef, useCallback } from 'react'
import { postWaypoints } from '../api/gps'

const MIN_DISTANCE_METERS = 30   // ignore jitter under 30m
const UPLOAD_INTERVAL_MS  = 5 * 60 * 1000  // flush every 5 min

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function useGPSTracking(isActive) {
  const [dailyMiles, setDailyMiles] = useState(0)
  const buffer      = useRef([])
  const lastPos     = useRef(null)
  const watchId     = useRef(null)
  const timer       = useRef(null)
  const today       = useRef(new Date().toISOString().slice(0, 10))

  const flush = useCallback(async () => {
    if (!buffer.current.length) return
    const batch = buffer.current.splice(0)
    try {
      const res = await postWaypoints({ waypoints: batch, date: today.current })
      setDailyMiles(res.daily_miles ?? 0)
    } catch {
      // Re-queue so data isn't lost
      buffer.current = [...batch, ...buffer.current]
    }
  }, [])

  const onPosition = useCallback(({ coords }) => {
    const { latitude: lat, longitude: lng, accuracy } = coords
    if (lastPos.current) {
      const dist = haversineMeters(lastPos.current.lat, lastPos.current.lng, lat, lng)
      if (dist < MIN_DISTANCE_METERS) return
    }
    lastPos.current = { lat, lng }
    buffer.current.push({ lat, lng, accuracy, recorded_at: new Date().toISOString() })
  }, [])

  useEffect(() => {
    if (!isActive) {
      if (watchId.current != null) {
        navigator.geolocation?.clearWatch(watchId.current)
        watchId.current = null
      }
      clearInterval(timer.current)
      timer.current = null
      flush() // final flush when clock-out
      return
    }

    if (!navigator.geolocation) return

    watchId.current = navigator.geolocation.watchPosition(onPosition, null, {
      enableHighAccuracy: true,
      maximumAge: 20000,
    })
    timer.current = setInterval(flush, UPLOAD_INTERVAL_MS)

    return () => {
      navigator.geolocation.clearWatch(watchId.current)
      clearInterval(timer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  return { dailyMiles, setDailyMiles, flush }
}
