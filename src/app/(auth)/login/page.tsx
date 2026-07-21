import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <AuthForm />
    </div>
  )
}
