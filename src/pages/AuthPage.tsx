import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'

interface AuthPageProps {
  mode: 'login' | 'register'
}

export function AuthPage({ mode }: AuthPageProps) {
  const { login, register, user } = useAuth()
  const { t } = useLocale()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return (
      <Navigate
        to={user.role === 'admin' ? '/strategy-manage' : '/incubation-strategies'}
        replace
      />
    )
  }

  const isLogin = mode === 'login'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (!isLogin && password !== confirmPassword) {
      setError(t('两次输入的密码不一致', 'The two passwords do not match.'))
      return
    }

    setSubmitting(true)
    const result = isLogin
      ? await login(username, password)
      : await register(username, password)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.message ?? t('操作失败', 'Operation failed'))
      return
    }

    navigate(
      result.user?.role === 'admin' ? '/strategy-manage' : '/incubation-strategies',
      { replace: true },
    )
  }

  return (
    <section className="auth-panel">
      <h1>{isLogin ? t('登录平台', 'Sign In') : t('注册账号', 'Create Account')}</h1>
      <p className="auth-description">
        {isLogin
          ? t(
              '登录后可查看孵化策略、已发布策略与 FAQ。',
              'After signing in, you can access Incubation, Published Strategies, and FAQ.',
            )
          : t(
              '注册后可查看孵化策略、已发布策略与 FAQ。',
              'After registration, you can access Incubation, Published Strategies, and FAQ.',
            )}
      </p>
      {isLogin ? (
        <p className="auth-hint">
          {t('管理员测试账号：', 'Admin demo account:')}
          <strong>admin</strong> / <strong>Admin@123456</strong>
        </p>
      ) : null}

      <form className="auth-form" onSubmit={submit}>
        <label>
          {t('用户名', 'Username')}
          <input
            required
            minLength={3}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={t('请输入用户名', 'Enter username')}
          />
        </label>

        <label>
          {t('密码', 'Password')}
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('请输入密码', 'Enter password')}
          />
        </label>

        {!isLogin ? (
          <label>
            {t('确认密码', 'Confirm Password')}
            <input
              required
              type="password"
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={t('请再次输入密码', 'Re-enter password')}
            />
          </label>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting
            ? t('提交中...', 'Submitting...')
            : isLogin
              ? t('登录', 'Sign In')
              : t('注册', 'Register')}
        </button>
      </form>

      <p className="auth-switch">
        {isLogin ? t('没有账号？', "Don't have an account?") : t('已有账号？', 'Already have an account?')}
        <Link to={isLogin ? '/register' : '/login'}>
          {isLogin ? t('去注册', 'Create one') : t('去登录', 'Sign in')}
        </Link>
      </p>
    </section>
  )
}

