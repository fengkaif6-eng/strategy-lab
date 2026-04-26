import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/auth'
import type { StrategyChannel } from '../types/strategy'

interface ProtectedRouteProps {
  allowedRoles: UserRole[]
  requiredChannel?: StrategyChannel
}

export function ProtectedRoute({
  allowedRoles,
  requiredChannel,
}: ProtectedRouteProps) {
  const { role, canAccessChannel } = useAuth()

  if (!allowedRoles.includes(role)) {
    const notice = role === 'guest' ? 'auth-required' : 'forbidden'
    return (
      <Navigate
        to={`/?notice=${notice}`}
        replace
      />
    )
  }

  if (requiredChannel && !canAccessChannel(requiredChannel)) {
    return <Navigate to="/?notice=forbidden" replace />
  }

  return <Outlet />
}
