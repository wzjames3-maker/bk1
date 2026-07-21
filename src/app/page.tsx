import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { HowItWorks } from '@/components/landing/how-it-works'
import { Pricing } from '@/components/landing/pricing'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <main className="mx-auto max-w-6xl px-4">
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
      </main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © 2026 PodCast AI · 自动化播客生产平台
      </footer>
    </div>
  )
}
