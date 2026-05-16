import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import './style.css'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.confirm('家庭健身契约有新版本，是否现在刷新？')) {
      void updateSW(true)
    }
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
