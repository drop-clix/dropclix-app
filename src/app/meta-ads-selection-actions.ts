'use server'

import { redirect } from 'next/navigation'
import { completePendingOAuthSelection } from '@/lib/oauth-pending-selection'

function safeFallback(value: FormDataEntryValue | null) {
  return value === '/settings' ? '/settings' : '/admin'
}

export async function completeMetaAdsAccountSelection(formData: FormData) {
  const selection = (formData.get('selection') as string | null) ?? ''
  const accountId = (formData.get('accountId') as string | null) ?? ''
  const fallback = safeFallback(formData.get('fallback'))

  if (!selection || !accountId) {
    redirect(`${fallback}?meta_ads_error=missing_selection`)
  }

  const result = await completePendingOAuthSelection(selection, accountId)
  if ('error' in result) {
    redirect(`${fallback}?meta_ads_error=${encodeURIComponent(result.error ?? 'selection_failed')}`)
  }

  const destination = result.origin === 'client' ? '/settings' : '/admin'
  redirect(`${destination}?meta_ads_connected=1`)
}
