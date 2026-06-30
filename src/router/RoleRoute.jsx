import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function RoleRoute({ allowedRoles }) {
  const user = useAuthStore((s) => s.user)
  return allowedRoles.includes(user?.role) ? <Outlet /> : <Navigate to="/" replace />
}
