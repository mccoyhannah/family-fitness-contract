import { AlertTriangle } from 'lucide-react'

export default function ConfigMissing({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="center-screen">
      <section className="config-card">
        <AlertTriangle size={34} />
        <h1>{title}</h1>
        <p>{detail}</p>
        <code>VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY</code>
      </section>
    </main>
  )
}
