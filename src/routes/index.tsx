import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="font-mono text-4xl font-bold tracking-tight">bulbus</h1>
    </main>
  )
}
