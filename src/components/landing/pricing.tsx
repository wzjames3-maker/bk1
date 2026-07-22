import Link from 'next/link'
import { Button } from '@/components/ui/button'

const PRICING_ITEMS = [
  { label: 'LLM 编剧', price: '$0.002 / 1K tokens' },
  { label: 'TTS 配音', price: '$0.015 / 1K 字符' },
  { label: '混音处理', price: '$0.01 / 期' },
  { label: '音频存储', price: '$0.02 / GB / 月' },
]

export function Pricing() {
  return (
    <section className="py-16">
      <h2 className="mb-4 text-center text-3xl font-bold">透明定价</h2>
      <p className="mb-12 text-center text-muted-foreground">
        按量付费，用多少算多少。注册即送 $1 体验金。
      </p>
      <div className="mx-auto max-w-md space-y-3 rounded-lg border p-6">
        {PRICING_ITEMS.map(item => (
          <div key={item.label} className="flex justify-between text-sm">
            <span>{item.label}</span>
            <span className="font-medium">{item.price}</span>
          </div>
        ))}
        <div className="border-t pt-3 mt-3">
          <p className="text-sm text-muted-foreground text-center">
            一期 10 分钟播客预估费用：<span className="font-semibold text-foreground">$0.25 ~ $0.50</span>
          </p>
        </div>
      </div>
      <div className="mt-8 text-center">
        <Link href="/login">
          <Button size="lg">免费试用</Button>
        </Link>
      </div>
    </section>
  )
}
