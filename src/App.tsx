import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AppErrorBoundary from './components/AppErrorBoundary'
import AppShell from './components/AppShell'
import ConfigMissing from './components/ConfigMissing'
import { useAuth } from './hooks/useAuth'

const CoachDashboard = lazy(() => import('./pages/coach/Dashboard'))
const CoachMembers = lazy(() => import('./pages/coach/Members'))
const CoachPayments = lazy(() => import('./pages/coach/Payments'))
const CoachReview = lazy(() => import('./pages/coach/Review'))
const Login = lazy(() => import('./pages/Login'))
const CheckIn = lazy(() => import('./pages/student/CheckIn'))
const Ledger = lazy(() => import('./pages/student/Ledger'))
const Plan = lazy(() => import('./pages/student/Plan'))
const Today = lazy(() => import('./pages/student/Today'))

function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/login" element={withCenteredLoading(<Login />)} />
        <Route element={<RequireRole role="student" />}>
          <Route element={<AppShell role="student" />}>
            <Route path="/" element={withPageLoading(<Today />)} />
            <Route path="/plan" element={withPageLoading(<Plan />)} />
            <Route path="/checkin" element={withPageLoading(<CheckIn />)} />
            <Route path="/ledger" element={withPageLoading(<Ledger />)} />
          </Route>
        </Route>
        <Route element={<RequireRole role="coach" />}>
          <Route element={<AppShell role="coach" />}>
            <Route path="/admin" element={withPageLoading(<CoachDashboard />)} />
            <Route path="/admin/members" element={withPageLoading(<CoachMembers />)} />
            <Route path="/admin/review" element={withPageLoading(<CoachReview />)} />
            <Route path="/admin/payments" element={withPageLoading(<CoachPayments />)} />
          </Route>
        </Route>
        <Route path="*" element={<RoleAwareFallback />} />
      </Routes>
    </AppErrorBoundary>
  )
}

function withCenteredLoading(element: ReactNode) {
  return <Suspense fallback={<LoadingScreen />}>{element}</Suspense>
}

function withPageLoading(element: ReactNode) {
  return <Suspense fallback={<PageLoadingScreen />}>{element}</Suspense>
}

function RequireRole({ role }: { role: 'student' | 'coach' }) {
  const { authError, loading, profile } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  if (authError) {
    return <ConfigMissing title="账号状态无法确认" detail={authError} />
  }

  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  if (profile.role !== role) {
    return <Navigate to={profile.role === 'coach' ? '/admin' : '/'} replace />
  }

  return <Outlet />
}

function RoleAwareFallback() {
  const { authError, loading, profile } = useAuth()

  if (loading) return <LoadingScreen />
  if (authError) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/login" replace />

  return <Navigate to={profile.role === 'coach' ? '/admin' : '/'} replace />
}

function LoadingScreen() {
  return (
    <main className="center-screen">
      <section className="config-card loading-card" aria-label="正在检查登录状态">
        <span className="skeleton-line medium" />
        <span className="skeleton-line title" />
        <span className="skeleton-line" />
        <div className="skeleton-grid">
          <span className="skeleton-tile" />
          <span className="skeleton-tile" />
        </div>
      </section>
    </main>
  )
}

function PageLoadingScreen() {
  return (
    <section className="screen with-nav" aria-label="页面加载中">
      <div className="status-card loading-card">
        <span className="skeleton-line medium" />
        <span className="skeleton-line title" />
        <span className="skeleton-line" />
      </div>
    </section>
  )
}

export default App
