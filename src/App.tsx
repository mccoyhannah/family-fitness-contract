import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell'
import ConfigMissing from './components/ConfigMissing'
import { useAuth } from './hooks/useAuth'
import CoachDashboard from './pages/coach/Dashboard'
import CoachPayments from './pages/coach/Payments'
import CoachReview from './pages/coach/Review'
import CoachStats from './pages/coach/Stats'
import Login from './pages/Login'
import CheckIn from './pages/student/CheckIn'
import Ledger from './pages/student/Ledger'
import Plan from './pages/student/Plan'
import Today from './pages/student/Today'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireRole role="student" />}>
        <Route element={<AppShell role="student" />}>
          <Route path="/" element={<Today />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/ledger" element={<Ledger />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="coach" />}>
        <Route element={<AppShell role="coach" />}>
          <Route path="/admin" element={<CoachDashboard />} />
          <Route path="/admin/review" element={<CoachReview />} />
          <Route path="/admin/payments" element={<CoachPayments />} />
          <Route path="/admin/stats" element={<CoachStats />} />
        </Route>
      </Route>
      <Route path="*" element={<RoleAwareFallback />} />
    </Routes>
  )
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
      <section className="config-card">
        <h1>正在检查登录状态</h1>
        <p>正在读取 Supabase session 和 profile。</p>
      </section>
    </main>
  )
}

export default App
