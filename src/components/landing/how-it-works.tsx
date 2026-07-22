const STEPS = [
  { step: '1', title: '上传素材', description: '粘贴文章链接、上传 PDF/Word，或直接输入文本和话题。' },
  { step: '2', title: 'AI 编剧', description: '系统自动生成多人对话脚本，你可以预览和编辑。' },
  { step: '3', title: '一键合成', description: '确认后自动配音、混音，几分钟后即可下载成品播客。' },
]

export function HowItWorks() {
  return (
    <section className="bg-muted/40 py-16">
      <h2 className="mb-12 text-center text-3xl font-bold">三步出片</h2>
      <div className="mx-auto flex max-w-4xl flex-col gap-8 sm:flex-row">
        {STEPS.map(s => (
          <div key={s.step} className="flex-1 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
              {s.step}
            </div>
            <h3 className="text-lg font-semibold">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
