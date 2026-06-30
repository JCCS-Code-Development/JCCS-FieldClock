import { create } from 'zustand'

export const useTimeclockStore = create((set) => ({
  statusLabel: null,   // traveling|working|lunch|material_run|waiting|done|null
  currentEntry: null,  // { id, job_id, start_time, ... }
  activeJob: null,     // { id, name, client_name, address, ... }
  dayStarted: false,

  setTimeclockData: (data) => set(data),
  clear: () => set({ statusLabel: null, currentEntry: null, activeJob: null, dayStarted: false }),
}))
