import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const dynamic = 'force-dynamic'

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

async function createProjectAction(formData: FormData) {
  'use server'
  const name = String(formData.get('name') || '').trim()
  const description = String(formData.get('description') || '').trim()
  if (!name) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('projects').insert({
    user_id: user.id,
    name,
    description: description || null,
  })

  revalidatePath('/projects')
}

async function ensureDefaultProjectAction() {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let projectId = existing?.id
  if (!projectId) {
    const { data: created, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name: '默认项目',
        description: '自动创建的播客项目，用于归集历史与新建节目',
      })
      .select('id')
      .single()
    if (error || !created) return
    projectId = created.id
  }

  await supabase
    .from('episodes')
    .update({ project_id: projectId })
    .eq('user_id', user.id)
    .is('project_id', null)

  revalidatePath('/projects')
  revalidatePath('/dashboard')
}

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: projects }, { data: episodes }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, description, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('episodes')
      .select('id, title, topic, status, project_id, created_at, audio_url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const allProjects = projects || []
  const allEpisodes = episodes || []
  const unassigned = allEpisodes.filter(ep => !ep.project_id)

  const episodeCountByProject = allEpisodes.reduce<Record<string, number>>((acc, ep) => {
    if (!ep.project_id) return acc
    acc[ep.project_id] = (acc[ep.project_id] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">播客项目</h1>
          <p className="text-muted-foreground">按项目归集节目，方便管理系列内容</p>
        </div>
        <Link href="/create">
          <Button size="lg">✨ 创建新节目</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">新建项目</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createProjectAction} className="flex flex-col gap-3 sm:flex-row">
            <Input name="name" placeholder="项目名称，如：AI 周刊" required className="sm:max-w-xs" />
            <Input name="description" placeholder="简介（可选）" className="flex-1" />
            <Button type="submit">创建项目</Button>
          </form>
        </CardContent>
      </Card>

      {unassigned.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">未归类节目（{unassigned.length}）</CardTitle>
              <form action={ensureDefaultProjectAction}>
                <Button type="submit" variant="outline" size="sm">
                  归入默认项目
                </Button>
              </form>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {unassigned.map(ep => (
              <Link key={ep.id} href={`/episodes/${ep.id}`} className="block">
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{ep.title || ep.topic || '未命名节目'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ep.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {STATUS_LABEL[ep.status] || ep.status}
                    {ep.audio_url ? ' · 有音频' : ''}
                  </span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-4 text-xl font-semibold">我的项目</h2>
        {allProjects.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 py-10 text-center text-muted-foreground">
              <p>还没有项目。</p>
              <p className="text-sm">
                之前创建的节目没有自动建项目，可点上方「归入默认项目」，或手动新建项目。
              </p>
              {unassigned.length > 0 && (
                <form action={ensureDefaultProjectAction}>
                  <Button type="submit">一键归入默认项目</Button>
                </form>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {allProjects.map(project => {
              const count = episodeCountByProject[project.id] || 0
              const projectEpisodes = allEpisodes.filter(ep => ep.project_id === project.id).slice(0, 5)
              return (
                <Card key={project.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {project.description || '暂无简介'} · {count} 期节目
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {projectEpisodes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">该项目下暂无节目</p>
                    ) : (
                      projectEpisodes.map(ep => (
                        <Link key={ep.id} href={`/episodes/${ep.id}`} className="block">
                          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                            <span className="truncate text-sm">{ep.title || ep.topic}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {STATUS_LABEL[ep.status] || ep.status}
                            </span>
                          </div>
                        </Link>
                      ))
                    )}
                    <div className="pt-2">
                      <Link href={`/create`}>
                        <Button variant="outline" size="sm">在此系列下创建</Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
