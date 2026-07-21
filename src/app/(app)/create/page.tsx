import { CreateWizard } from '@/components/create/create-wizard'

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">创建新节目</h1>
      <CreateWizard />
    </div>
  )
}
