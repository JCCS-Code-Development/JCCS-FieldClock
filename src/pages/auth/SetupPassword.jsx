import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { setPassword } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'

export default function SetupPassword() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const userId    = location.state?.userId
  const { login } = useAuthStore()

  const [password, setPass]     = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (!userId) navigate('/login', { replace: true })
  }, [userId, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    setError('')
    try {
      const data = await setPassword(userId, password)
      login(data.user, data.token, data.refreshToken)
      navigate(data.user.role === 'admin' ? '/admin' : '/', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not set password. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-brand-900 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-2">🔑</p>
          <h1 className="text-2xl font-bold text-white">Create your password</h1>
          <p className="text-brand-100 text-sm mt-1">You're logging in for the first time.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <Input
            label="New Password"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            label="Confirm Password"
            type="password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error}
            autoComplete="new-password"
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Set Password & Sign In
          </Button>
        </form>
      </div>
    </div>
  )
}
