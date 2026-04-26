import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'

interface AuthPageProps {
  mode: 'login' | 'register'
}

export function AuthPage({ mode }: AuthPageProps) {
  const { login, register, user, setNotice } = useAuth()
  const { t } = useLocale()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [organization, setOrganization] = useState('')
  const [email, setEmail] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return (
      <Navigate
        to={user.role === 'admin' ? '/admin-console' : '/incubation-strategies'}
        replace
      />
    )
  }

  const isLogin = mode === 'login'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (!isLogin && password !== confirmPassword) {
      setError(t('两次输入的密码不一致。', 'The two passwords do not match.'))
      return
    }

    setSubmitting(true)
    const result = isLogin
      ? await login(username, password)
      : await register({
          username,
          password,
          fullName,
          organization,
          email,
          contact,
        })
    setSubmitting(false)

    if (!result.ok) {
      setError(result.message ?? t('操作失败。', 'Operation failed.'))
      return
    }

    if (isLogin) {
      navigate(
        result.user?.role === 'admin' ? '/admin-console' : '/incubation-strategies',
        { replace: true },
      )
      return
    }

    setNotice(
      result.message ??
        t(
          '注册申请已提交，请等待管理员审核并分配策略权限。',
          'Registration request submitted. Please wait for admin approval.',
        ),
    )
    navigate('/login', { replace: true })
  }

  return (
    <section className="auth-panel">
      <h1>{isLogin ? t('登录平台', 'Sign In') : t('提交注册申请', 'Submit Registration')}</h1>
      <p className="auth-description">
        {isLogin
          ? t(
              '登录后可按管理员分配的权限查看孵化策略、已发布策略和 FAQ。',
              'After sign-in, you can access modules based on admin-assigned permissions.',
            )
          : t(
              '注册信息将先提交给管理员审核，审核通过并授权后才可登录查看策略。',
              'Your registration will be reviewed by admin before account activation.',
            )}
      </p>
      {isLogin ? (
        <p className="auth-hint">
          {t('管理员测试账号：', 'Admin demo account:')}
          <strong>admin</strong> / <strong>Admin@123456</strong>
          <br />
          {t('普通用户测试账号：', 'User demo account:')}
          <strong>user_demo</strong> / <strong>User@123456</strong>
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

        {!isLogin ? (
          <div className="auth-grid-two">
            <label>
              {t('客户姓名', 'Client Name')}
              <input
                required
                minLength={2}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={t('请输入客户姓名', 'Enter client name')}
              />
            </label>
            <label>
              {t('机构', 'Institution')}
              <input
                required
                minLength={2}
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
                placeholder={t('请输入机构名称', 'Enter institution')}
              />
            </label>
            <label>
              {t('邮箱', 'Email')}
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('请输入邮箱', 'Enter email')}
              />
            </label>
            <label>
              {t('联系方式', 'Contact')}
              <input
                required
                minLength={6}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={t('请输入手机号或座机', 'Enter phone/contact')}
              />
            </label>
          </div>
        ) : null}

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
              : t('提交审核', 'Submit')}
        </button>
      </form>

      <p className="auth-switch">
        {isLogin
          ? t('没有账号？', "Don't have an account?")
          : t('已有账号？', 'Already have an account?')}
        <Link to={isLogin ? '/register' : '/login'}>
          {isLogin ? t('去注册', 'Create one') : t('去登录', 'Sign in')}
        </Link>
      </p>
    </section>
  )
}
