import { RefreshCw } from 'lucide-react'
import { Component, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error) {
    console.error('AppErrorBoundary caught error:', error)
  }

  private handleRetry = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  private handleHome = () => {
    this.setState({ error: null })
    window.location.assign('/')
  }

  override render() {
    if (this.state.error) {
      return (
        <main className="center-screen">
          <section className="config-card error-card" role="alert" aria-live="assertive">
            <h1>页面加载失败</h1>
            <p>可能是网络、缓存或页面资源更新导致加载中断。可以重试，或先回到首页。</p>
            <details>
              <summary>技术详情</summary>
              <code>{this.state.error.message}</code>
            </details>
            <div className="row-actions">
              <button type="button" onClick={this.handleHome}>
                返回首页
              </button>
              <button className="primary-action" type="button" onClick={this.handleRetry}>
                <RefreshCw size={18} />
                重试
              </button>
            </div>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
