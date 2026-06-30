import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { login } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'

export default function Login() {
  const navigate    = useNavigate()
  const { login: storeLogin } = useAuthStore()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier.trim()) { setError('Enter your email or phone number.'); return }
    setLoading(true)
    setError('')
    try {
      const data = await login(identifier.trim(), password)
      if (data.setup_required) {
        navigate('/setup-password', { state: { userId: data.user_id } })
        return
      }
      storeLogin(data.user, data.token, data.refreshToken)
      navigate(data.user.role === 'admin' ? '/admin' : '/', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Login failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-brand-900 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-2">⏱</p>
          <h1 className="text-2xl font-bold text-white">JCCS FieldClock</h1>
          <p className="text-brand-100 text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <Input
            label="Email or Phone Number"
            type="text"
            inputMode="email"
            placeholder="you@example.com or (555) 000-0000"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            autoComplete="current-password"
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Sign In
          </Button>
        </form>

        <p className="text-center text-brand-100 text-xs mt-6">
          Don't have access? Contact your administrator.
        </p>
      </div>
    </div>
  )
}
