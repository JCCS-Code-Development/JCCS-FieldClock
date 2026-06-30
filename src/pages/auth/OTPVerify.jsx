import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { verifyOTP, sendOTP } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'

export default function OTPVerify() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const identifier = location.state?.identifier
  const emailHint  = location.state?.emailHint
  const { login } = useAuthStore()

  const [code, setCode]               = useState('')
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!identifier) { navigate('/login', { replace: true }); return }
    inputRef.current?.focus()
  }, [identifier, navigate])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return }
    setLoading(true)
    setError('')
    try {
      const data = await verifyOTP(identifier, code)
      login(data.user, data.token, data.refreshToken)
      navigate(data.user.role === 'admin' ? '/admin' : '/', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Invalid or expired code.')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    try {
      await sendOTP(identifier)
      setResendCooldown(60)
      setError('')
    } catch {
      setError('Could not resend. Try again.')
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-brand-900 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-2">✉️</p>
          <h1 className="text-2xl font-bold text-white">Check your email</h1>
          <p className="text-brand-100 text-sm mt-1">
            We sent a 6-digit code to<br />
            <strong className="text-white">{emailHint ?? 'your email address'}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <Input
            ref={inputRef}
            label="Verification Code"
            type="text"
            inputMode="numeric"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={error}
            className="text-center text-2xl tracking-widest"
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Verify
          </Button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-sm text-center text-gray-500 hover:text-brand-500 disabled:text-gray-300 transition-colors"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </button>
        </form>

        <button
          onClick={() => navigate('/login')}
          className="block text-center text-brand-100 text-xs mt-4 hover:text-white transition-colors w-full"
        >
          ← Use a different email or number
        </button>
      </div>
    </div>
  )
}
