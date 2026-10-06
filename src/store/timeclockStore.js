import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useTimeclockStore = create(
  persist(
    (set) => ({
      statusLabel:  null,
      currentEntry: null,
      activeJob:    null,
      dayStarted:   false,
      // Set once status.php reports an active lunch/dinner lock, so the Clock
      // page can show a dedicated "contact your administrator" banner right
      // away — not only after a failed clock-in tap. Deliberately not
      // persisted (see partialize below): it must always come fresh from the
      // server, same reasoning as currentEntry.
      lunch_locked_at: null,

      setTimeclockData: (data) => set(data),
      clear: () => set({ statusLabel: null, currentEntry: null, activeJob: null, dayStarted: false, lunch_locked_at: null }),
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
