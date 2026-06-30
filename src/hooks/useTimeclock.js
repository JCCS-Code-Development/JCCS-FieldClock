import { useEffect } from 'react'
import { useTimeclockStore } from '../store/timeclockStore'
import { getStatus } from '../api/timeclock'

export function useTimeclock() {
  const store = useTimeclockStore()

  useEffect(() => {
    getStatus()
      .then((data) => store.setTimeclockData(data))
      .catch(() => {})
  }, [])

  return store
}
