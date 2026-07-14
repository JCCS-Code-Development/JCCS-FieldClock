// Groups a list of jobs by client_name (the hospital/company they belong to),
// sorted alphabetically by client, with jobs missing a client bucketed last.
export function groupJobsByClient(jobs) {
  const groups = {}
  for (const j of jobs ?? []) {
    const key = j.client_name?.trim() || 'Other'
    if (!groups[key]) groups[key] = []
    groups[key].push(j)
  }
  return Object.keys(groups)
    .sort((a, b) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return a.localeCompare(b)
    })
    .map((client) => ({
      client,
      jobs: groups[client].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
