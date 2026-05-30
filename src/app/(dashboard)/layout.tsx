import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-gray-900">Drop Clix</span>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{profile?.email ?? user.email}</span>
          <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium uppercase">
            {profile?.role ?? 'client'}
          </span>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
