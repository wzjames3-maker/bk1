export default async function EpisodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">剧集详情</h1>
      <p className="text-muted-foreground">Episode ID: {id}</p>
      <p className="text-muted-foreground">（完整功能在 M4 实现）</p>
    </div>
  )
}
