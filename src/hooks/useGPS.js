import { useState, useCallback } from 'react'

export function useGPS() {
  const [position, setPosition] = useState(null) // { lat, lng, accuracy }
  const [error, setError] = useState(null)
  // GeolocationPositionError.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE,
  // 3 = TIMEOUT. Kept separate from the message so callers can tell "denied —
  // needs a Settings change" apart from "still trying, retry might work" —
  // the browser will not re-prompt once denied, only re-request the OS-level
  // permission the phone already remembers.
  const [errorCode, setErrorCode] = useState(null)
  const [loading, setLoading] = useState(false)

  const getPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this device.')
      setErrorCode(null)
      return
    }
    setLoading(true)
    setError(null)
    setErrorCode(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
        })
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setErrorCode(err.code)
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  }, [])

  return { position, error, errorCode, loading, getPosition }
}
