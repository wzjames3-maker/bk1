import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-background to-muted/40">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">
          🎧 PodCast AI
        </h1>
        <p className="text-xl text-muted-foreground max-w-lg">
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
    </div>
  )
}
