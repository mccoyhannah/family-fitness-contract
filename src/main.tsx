import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import AppNotice from './components/AppNotice'
import { AuthProvider } from './hooks/useAuth'
import { notifyApp } from './lib/notice'
import './style.css'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    notifyApp({
      tone: 'info',
      message: '检测到新版，正在刷新界面。',
    })
    void updateSW(true)
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    window.setInterval(() => {
      if (!navigator.onLine) return
      void registration.update()
    }, 60 * 60 * 1000)
  },
  onRegisterError() {
    notifyApp({
      tone: 'warning',
      message: '离线缓存更新失败，刷新页面后会重试。',
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
