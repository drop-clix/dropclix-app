import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mb-6">Logged in as {profile.email}</p>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-700">
            Session 2 complete — Supabase auth is wired up.
            Role-based routing is active.
          </p>
        </div>
      </div>
    </div>
  )
}
