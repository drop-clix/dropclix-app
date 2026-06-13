import { getPortalContext } from '@/lib/supabase/portal'
import { redirect } from 'next/navigation'
import { DocsClient } from '@/components/portal/DocsClient'

export default async function DocsPage() {
  const { isAdmin } = await getPortalContext()
  if (!isAdmin) redirect('/')

  return (
    <div className="p-10" style={{ height: 'calc(100vh - 40px)' }}>
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
        <p
          className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
          style={{ color: '#c9a96e' }}
        >
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Agency Resources
        </p>
        <h1
          className="font-jakarta font-light"
          style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
        >
          Docs & SOPs
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#666' }}>
          Internal agency documents — auto-saves on change
        </p>
      </div>
      <DocsClient />
    </div>
  )
}
