import { useEffect } from 'react'
import { useTimeclockStore } from '../store/timeclockStore'
import { getStatus } from '../api/timeclock'

export function useTimeclock() {
  const store = useTimeclockStore()
  const { setTimeclockData } = store

  useEffect(() => {
    getStatus()
      .then(setTimeclockData)
      .catch(() => {})
  }, [setTimeclockData])

  return store
}
