import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/auth'

interface ProtectedRouteProps {
  allowedRoles: UserRole[]
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { role } = useAuth()

  if (!allowedRoles.includes(role)) {
    const notice = role === 'guest' ? 'auth-required' : 'forbidden'
    return (
      <Navigate
        to={`/?notice=${notice}`}
        replace
      />
    )
  }

  return <Outlet />
}
