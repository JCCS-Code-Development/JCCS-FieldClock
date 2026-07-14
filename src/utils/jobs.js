// Groups a list of jobs by company (the hospital/business the job belongs to —
// distinct from client_name, which is the contact/client on file for that job),
// sorted alphabetically by company, with jobs missing a company bucketed last.
export function groupJobsByCompany(jobs) {
  const groups = {}
  for (const j of jobs ?? []) {
    const key = j.company?.trim() || 'Other'
    if (!groups[key]) groups[key] = []
    groups[key].push(j)
  }
  return Object.keys(groups)
    .sort((a, b) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return a.localeCompare(b)
    })
    .map((company) => ({
      company,
      jobs: groups[company].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
