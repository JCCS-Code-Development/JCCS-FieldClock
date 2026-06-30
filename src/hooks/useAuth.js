import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const { user, token, isAuthenticated, login, logout, updateToken } = useAuthStore()
  return {
    user,
    token,
    isAuthenticated,
    isAdmin: user?.role === 'admin',
    login,
    logout,
    updateToken,
  }
}
