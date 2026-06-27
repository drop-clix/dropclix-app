import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MetaAdsAccountSelector } from '@/components/portal/MetaAdsAccountSelector'
import { getPendingOAuthSelection } from '@/lib/oauth-pending-selection'
import { completeMetaAdsAccountSelection } from '@/app/meta-ads-selection-actions'

export default async function ClientMetaAdsSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ selection?: string }>
}) {
  const params = await searchParams
  const selection = params.selection ?? null
  const pending = await getPendingOAuthSelection(selection)

  if (!pending.ok) {
    redirect(`/settings?meta_ads_error=${encodeURIComponent(pending.error)}`)
  }

  if (pending.row.platform !== 'meta_ads' || pending.row.origin !== 'client') {
    redirect('/settings?meta_ads_error=unauthorized')
  }

  async function chooseAccount(formData: FormData) {
    'use server'
    formData.set('fallback', '/settings')
    await completeMetaAdsAccountSelection(formData)
  }

  return (
    <div className="p-10">
      <div style={{ maxWidth: 980 }}>
        <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
          <p
            className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
            style={{ color: '#1778f2' }}
          >
            <span style={{ display: 'block', width: 20, height: 1, background: '#1778f2' }} />
            Meta Ads
          </p>
          <h1
            className="font-jakarta font-light"
            style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
          >
            Choose Ad Account
          </h1>
          <p className="text-[12px] font-light mt-2" style={{ color: '#666', maxWidth: 620 }}>
            Multiple active ad accounts are available. Choose the account Drop CLIX should use for your Meta Ads reporting.
          </p>
        </div>

        <MetaAdsAccountSelector
          accounts={pending.row.accounts}
          selection={selection ?? ''}
          action={chooseAccount}
        />

        <Link
          href="/settings?meta_ads_error=selection_cancelled"
          className="inline-flex mt-5 text-[10px] font-light"
          style={{ color: '#666', textDecoration: 'none' }}
        >
          Cancel and return to settings
        </Link>
      </div>
    </div>
  )
}
