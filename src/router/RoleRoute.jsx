import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

function roleFallback(role) {
  if (role === 'contractor') return '/contractor/invoices'
  if (role === 'admin') return '/admin'
  return '/'
}

export default function RoleRoute({ allowedRoles }) {
  const user = useAuthStore((s) => s.user)
  if (allowedRoles.includes(user?.role)) return <Outlet />
  return <Navigate to={roleFallback(user?.role)} replace />
}
