import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Metadata } from 'next'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const admin = createAdminClient()
  const { data: episode } = await admin
    .from('episodes')
    .select('title, topic')
    .eq('share_token', token)
    .single()

  return {
    title: episode?.title || episode?.topic || '播客分享',
    description: '来自 PodCast AI 的播客节目',
  }
}

export default async function SharePage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: episode } = await admin
    .from('episodes')
    .select('id, title, topic, audio_url, show_notes, chapters, completed_at, status')
    .eq('share_token', token)
    .single()

  if (!episode || episode.status !== 'completed' || !episode.audio_url) {
    notFound()
  }

  const chapters = (episode.chapters as { title: string; start: number }[]) || []

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold">{episode.title || episode.topic}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {episode.completed_at ? new Date(episode.completed_at).toLocaleDateString('zh-CN') : ''}
          {' · '}PodCast AI 制作
        </p>

        <audio
          src={episode.audio_url}
          controls
          className="mt-6 w-full"
        />

        {chapters.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">章节</h2>
            <ol className="space-y-1">
              {chapters.map((ch, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-12 shrink-0 text-muted-foreground">
                    {Math.floor(ch.start / 60)}:{String(Math.floor(ch.start % 60)).padStart(2, '0')}
                  </span>
                  <span>{ch.title}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {episode.show_notes && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">节目笔记</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {episode.show_notes}
            </p>
          </div>
        )}

        <div className="mt-12 border-t pt-6 text-center">
          <p className="text-sm text-muted-foreground">由 PodCast AI 自动生成</p>
          <a href="/login" className="mt-2 inline-block text-sm text-primary hover:underline">
            创建你自己的播客 →
          </a>
        </div>
      </div>
    </div>
  )
}
