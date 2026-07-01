import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import LangSwitcher from '../../components/ui/LangSwitcher'
import { login } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'

export default function Login() {
  const navigate    = useNavigate()
  const { login: storeLogin } = useAuthStore()
  const { t } = useTranslation()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier.trim()) { setError(t('auth.identifierRequired')); return }
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
      setError(err?.response?.data?.error ?? t('auth.loginFailed'))
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
          <h1 className="text-2xl font-bold text-white">{t('auth.title')}</h1>
          <p className="text-brand-100/70 text-sm mt-1">{t('auth.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <Input
            label={t('auth.identifier')}
            type="text"
            inputMode="email"
            placeholder={t('auth.identifierPlaceholder')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
          <Input
            label={t('auth.password')}
            type="password"
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            autoComplete="current-password"
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>
            {t('auth.signIn')}
          </Button>
        </form>

        <p className="text-center text-brand-100/50 text-xs mt-6">{t('auth.noAccess')}</p>

        <div className="flex justify-center mt-4">
          <LangSwitcher className="text-brand-100/40 hover:text-brand-100/80" />
        </div>
      </div>
    </div>
  )
}
