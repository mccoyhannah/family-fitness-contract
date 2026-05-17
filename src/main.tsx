import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import AppNotice, { notifyApp } from './components/AppNotice'
import { AuthProvider } from './hooks/useAuth'
import './style.css'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    notifyApp({
      tone: 'info',
      message: '家庭健身契约有新版本可用。',
      actionLabel: '刷新',
      action: () => void updateSW(true),
    })
  },
  onOfflineReady() {
    notifyApp({
      tone: 'success',
      message: '已准备好离线打开，断网时仍可查看本机缓存。',
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppNotice />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
