import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { setPassword } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'

export default function SetupPassword() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const userId    = location.state?.userId
  const { login } = useAuthStore()
  const { t, i18n } = useTranslation()

  const [password, setPass]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) navigate('/login', { replace: true })
  }, [userId, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError(t('auth.setup.tooShort')); return }
    if (password !== confirm) { setError(t('auth.setup.mismatch')); return }
    setLoading(true)
    setError('')
    try {
      const data = await setPassword(userId, password)
      login(data.user, data.token, data.refreshToken)
      if (data.user.preferred_language) i18n.changeLanguage(data.user.preferred_language)
      navigate(data.user.role === 'admin' ? '/admin' : '/', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.error ?? t('auth.setup.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-brand-900 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-14 w-auto mx-auto mb-4"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <h1 className="text-2xl font-bold text-white">{t('auth.setup.title')}</h1>
          <p className="text-brand-100/70 text-sm mt-1">{t('auth.setup.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <Input
            label={t('auth.setup.newPassword')}
            type="password"
            placeholder={t('auth.setup.newPasswordPlaceholder')}
            value={password}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            label={t('auth.setup.confirmPassword')}
            type="password"
            placeholder={t('auth.setup.confirmPasswordPlaceholder')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error}
            autoComplete="new-password"
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>
            {t('auth.setup.submit')}
          </Button>
        </form>
      </div>
    </div>
  )
}
