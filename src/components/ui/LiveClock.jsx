import { useState, useEffect } from 'react'

export default function LiveClock({ className = '' }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className={`tabular-nums text-sm font-semibold tracking-tight ${className}`}>
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}
