export default function DataTable({ columns, data, onRowClick, emptyMessage = 'No records found.' }) {
  if (!data?.length) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">{emptyMessage}</div>
    )
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2 whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id ?? i}
              className={`border-b border-gray-50 ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-3 align-top">
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
