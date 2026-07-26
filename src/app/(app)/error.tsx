'use client'

import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="text-5xl">😵</span>
      <h2 className="text-xl font-semibold">页面出了点问题</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || '发生了未知错误，请重试。'}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>重试</Button>
        <Button variant="outline" onClick={() => window.location.assign('/dashboard')}>
          返回工作台
        </Button>
      </div>
    </div>
  )
}
