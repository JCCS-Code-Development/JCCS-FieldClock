export default function DataTable({ columns, data, onRowClick, emptyMessage = 'No records found.', fixed = false, card = false }) {
  if (!data?.length) {
    return (
      <div className={`text-center py-12 text-gray-400 text-sm ${card ? 'bg-white rounded-2xl shadow-sm border border-gray-100' : ''}`}>{emptyMessage}</div>
    )
  }

  // Every table built on this component follows the same shape: first column
  // is the row's "title" (name/invoice #/job title), last column has no
  // label and holds action buttons, everything in between is a labeled
  // field. That's what makes a single generic mobile-card layout possible
  // here instead of every admin page needing its own separate mobile
  // markup alongside the table.
  const [titleCol, ...restCols] = columns
  const lastCol = columns[columns.length - 1]
  const hasActions = lastCol !== titleCol && !lastCol.label
  const fieldCols = hasActions ? restCols.slice(0, -1) : restCols

  return (
    <>
      {/* ── Mobile: one card per row ──────────────────────────── */}
      <div className="md:hidden flex flex-col gap-2.5">
        {data.map((row, i) => (
          <div key={row.id ?? i}
            onClick={() => onRowClick?.(row)}
            className={`bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 ${onRowClick ? 'cursor-pointer active:bg-gray-50 transition-colors' : ''}`}>
            <div className="font-semibold text-gray-900 text-sm">
              {titleCol.render ? titleCol.render(row[titleCol.key], row) : row[titleCol.key] ?? '—'}
            </div>
            {fieldCols.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                {fieldCols.map((col) => (
                  <div key={col.key} className="min-w-0">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">{col.label}</p>
                    <div className="text-sm text-gray-700 truncate">
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hasActions && (
              <div className="pt-2 border-t border-gray-50 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                {lastCol.render(row[lastCol.key], row)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Desktop: table ─────────────────────────────────────── */}
      <div className={`hidden md:block overflow-x-auto ${card ? 'bg-white rounded-2xl shadow-sm border border-gray-100' : '-mx-1'}`}>
        <table className={`w-full text-sm ${fixed ? 'table-fixed' : ''}`}>
          <thead className={card ? 'bg-gray-50 border-b border-gray-100' : ''}>
            <tr className={card ? '' : 'border-b border-gray-100'}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${card ? 'px-5 py-3' : 'px-3 py-2'} ${col.className ?? ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={card ? 'divide-y divide-gray-50' : ''}>
            {data.map((row, i) => (
              <tr
                key={row.id ?? i}
                className={`${card ? 'transition-colors' : 'border-b border-gray-50'} ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : card ? 'hover:bg-gray-50' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`${card ? 'px-5 py-3.5 align-middle' : 'px-3 py-3 align-top'} ${col.className ?? ''}`}>
                    {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
