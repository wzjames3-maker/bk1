import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  parsing: '解析中',
  scripting: '编剧中',
  script_ready: '待确认',
  confirming: '确认中',
  tts_processing: '合成中',
  mixing: '混音中',
  post_processing: '后处理',
  completed: '已完成',
  failed: '失败',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, balance')
    .eq('id', user!.id)
    .single()

  const { data: recentEpisodes } = await supabase
    .from('episodes')
    .select('id, title, topic, status, created_at, audio_url')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            你好，{profile?.name || '创作者'} 👋
          </h1>
          <p className="text-muted-foreground">开始制作你的下一期播客</p>
        </div>
        <Link href="/create">
          <Button size="lg">✨ 创建新节目</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              账户余额
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${profile?.balance?.toFixed(2) || '0.00'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              最近节目
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{recentEpisodes?.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">🟢 正常</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">最近节目</h2>
        {recentEpisodes && recentEpisodes.length > 0 ? (
          <div className="space-y-2">
            {recentEpisodes.map((ep) => (
              <Link key={ep.id} href={`/episodes/${ep.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ep.title || ep.topic || '未命名节目'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ep.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {STATUS_LABEL[ep.status] || ep.status}
                      {ep.audio_url ? ' · 有音频' : ''}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              还没有节目，点击「创建新节目」开始吧！
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
