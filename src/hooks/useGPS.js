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

  // Resolves with a fresh fix (or null on failure — never rejects, so
  // callers can always proceed rather than get stuck on a promise that never
  // settles). Tries a high-accuracy (GPS chip) fix first, and — a common
  // complaint specifically on Android, where the GPS chip can time out
  // indoors waiting for a satellite lock while iOS's location stack tends to
  // fall back on its own — retries once with a network/Wi-Fi based fix,
  // which is faster and more reliable indoors even though less precise,
  // instead of giving up outright.
  const requestPosition = useCallback(() => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setError('Geolocation is not supported by this device.')
        setErrorCode(null)
        resolve(null)
        return
      }
      setLoading(true)
      setError(null)
      setErrorCode(null)

      const succeed = (coords) => {
        const pos = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }
        setPosition(pos)
        setLoading(false)
        resolve(pos)
      }
      const fail = (err) => {
        setError(err.message)
        setErrorCode(err.code)
        setLoading(false)
        resolve(null)
      }

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => succeed(coords),
        () => {
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => succeed(coords),
            (err) => fail(err),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
          )
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      )
    })
  }, [])

  // Fire-and-forget version for passive calls (mount, "try again" tap) that
  // just want the state (position/error/loading) kept current.
  const getPosition = useCallback(() => { requestPosition() }, [requestPosition])

  return { position, error, errorCode, loading, getPosition, requestPosition }
}
