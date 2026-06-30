import { useState, useCallback } from 'react'

export function useGPS() {
  const [position, setPosition] = useState(null) // { lat, lng, accuracy }
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const getPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this device.')
      return
    }
    setLoading(true)
    setError(null)
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
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  }, [])

  return { position, error, loading, getPosition }
}
