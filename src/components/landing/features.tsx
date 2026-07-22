const FEATURES = [
  {
    icon: '📄',
    title: '素材解析',
    description: '支持 PDF、网页链接、Word 文档、纯文本，自动提取核心内容。',
  },
  {
    icon: '✍️',
    title: 'AI 编剧',
    description: 'DeepSeek 大模型将素材改编为自然流畅的多人对话脚本。',
  },
  {
    icon: '🎙️',
    title: '多角色配音',
    description: '预设多种 AI 声音，按角色自动分配，支持情绪表达。',
  },
  {
    icon: '🎵',
    title: '智能混音',
    description: '自动拼接、添加转场和背景音乐，输出成品级音频。',
  },
  {
    icon: '📝',
    title: 'Show Notes',
    description: '自动生成节目简介、时间戳章节、封面建议。',
  },
  {
    icon: '⚡',
    title: '按量付费',
    description: '用多少付多少，一期 10 分钟播客仅需 $0.25 ~ $0.50。',
  },
]

export function Features() {
  return (
    <section className="py-16">
      <h2 className="mb-12 text-center text-3xl font-bold">一站式播客生产</h2>
      <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(f => (
          <div key={f.title} className="space-y-2 rounded-lg border p-6">
            <span className="text-3xl">{f.icon}</span>
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
