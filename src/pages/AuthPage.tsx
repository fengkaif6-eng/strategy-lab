import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface AuthPageProps {
  mode: 'login' | 'register'
}

export function AuthPage({ mode }: AuthPageProps) {
  const { login, register, user } = useAuth()
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
      setError('两次输入的密码不一致')
      return
    }
    setSubmitting(true)
    const result = isLogin
      ? await login(username, password)
      : await register(username, password)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.message ?? '操作失败')
      return
    }
    navigate(
      result.user?.role === 'admin' ? '/strategy-manage' : '/incubation-strategies',
      {
        replace: true,
      },
    )
  }

  return (
    <section className="auth-panel">
      <h1>{isLogin ? '登录平台' : '注册账号'}</h1>
      <p className="auth-description">
        {isLogin
          ? '登录后可查看孵化策略、已发布策略与 FAQ。'
          : '注册后可查看孵化策略、已发布策略与 FAQ。'}
      </p>
      {isLogin && (
        <p className="auth-hint">
          管理员测试账号：<strong>admin</strong> / <strong>Admin@123456</strong>
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
        <label>
          用户名
          <input
            required
            minLength={3}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="请输入用户名"
          />
        </label>
        <label>
          密码
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
          />
        </label>
        {!isLogin && (
          <label>
            确认密码
            <input
              required
              type="password"
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="请再次输入密码"
            />
          </label>
        )}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? '提交中...' : isLogin ? '登录' : '注册'}
        </button>
      </form>
      <p className="auth-switch">
        {isLogin ? '没有账号？' : '已有账号？'}
        <Link to={isLogin ? '/register' : '/login'}>
          {isLogin ? '去注册' : '去登录'}
        </Link>
      </p>
    </section>
  )
}
