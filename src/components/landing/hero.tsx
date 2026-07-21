import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center gap-8 py-24 text-center">
      <div className="space-y-4">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          🎧 PodCast AI
        </h1>
        <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
          输入素材和话题，AI 自动生成多人对话式播客。
          从编剧到配音到混音，全自动完成。
        </p>
      </div>
      <div className="flex gap-4">
        <Link href="/login">
          <Button size="lg">免费开始（赠送 $1）</Button>
        </Link>
        <Link href="/login">
          <Button size="lg" variant="outline">登录</Button>
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        无需信用卡 · 注册即送 $1 体验金 · 一期播客低至 $0.25
      </p>
    </section>
  )
}
