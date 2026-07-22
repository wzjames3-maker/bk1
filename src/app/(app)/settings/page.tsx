import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const dynamic = 'force-dynamic'

async function updateProfileAction(formData: FormData) {
  'use server'
  const name = String(formData.get('name') || '').trim()
  if (!name) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('profiles').update({ name }).eq('id', user.id)
  await supabase.auth.updateUser({ data: { name } })

  revalidatePath('/settings')
  revalidatePath('/dashboard')
}

async function signOutAction() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, balance, created_at')
    .eq('id', user.id)
    .single()

  const [{ count: episodeCount }, { count: projectCount }] = await Promise.all([
    supabase
      .from('episodes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">设置</h1>
        <p className="text-muted-foreground">管理账户资料与登录信息</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">账户信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">邮箱</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">用户 ID</span>
            <span className="truncate font-mono text-xs">{user.id}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">注册时间</span>
            <span>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleString('zh-CN')
                : '-'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">余额</span>
            <span className="font-medium">${Number(profile?.balance ?? 0).toFixed(4)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">节目 / 项目</span>
            <span className="font-medium">{episodeCount || 0} / {projectCount || 0}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">个人资料</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateProfileAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">昵称</Label>
              <Input
                id="name"
                name="name"
                defaultValue={profile?.name || ''}
                placeholder="你的昵称"
                required
                maxLength={40}
              />
            </div>
            <Button type="submit">保存昵称</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">快捷入口</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/billing"><Button variant="outline">账单中心</Button></Link>
          <Link href="/projects"><Button variant="outline">播客项目</Button></Link>
          <Link href="/create"><Button variant="outline">创建节目</Button></Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">安全</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            修改密码请到 Supabase 登录邮箱重置，或在本页退出后重新注册流程外的密码重置入口（当前 MVP 未接 SMTP 重置页）。
          </p>
          <form action={signOutAction}>
            <Button type="submit" variant="destructive">退出登录</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
