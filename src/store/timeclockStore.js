import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useTimeclockStore = create(
  persist(
    (set) => ({
      statusLabel:  null,
      currentEntry: null,
      activeJob:    null,
      dayStarted:   false,

      setTimeclockData: (data) => set(data),
      clear: () => set({ statusLabel: null, currentEntry: null, activeJob: null, dayStarted: false }),
    }),
    {
      name: 'timeclock-state',
      // Only persist the display-critical fields, not the full entry object
      partialize: (s) => ({
        statusLabel: s.statusLabel,
        dayStarted:  s.dayStarted,
        activeJob:   s.activeJob,
      }),
    }
  )
)
