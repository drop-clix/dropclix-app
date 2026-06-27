'use client'

import { useFormStatus } from 'react-dom'
import { MetaLogo } from '@/components/portal/MetaLogo'
import type { PendingOAuthAccount } from '@/lib/oauth-pending-selection'

function SubmitButton({ accountName }: { accountName: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-[9px] tracking-[.14em] uppercase px-3 py-2 font-medium cursor-pointer"
      style={{
        background: pending ? 'rgba(23,120,242,.06)' : 'rgba(23,120,242,.1)',
        color: '#1778f2',
        border: '1px solid rgba(23,120,242,.34)',
        borderRadius: 3,
        opacity: pending ? 0.62 : 1,
      }}
      aria-label={`Connect ${accountName}`}
    >
      {pending ? 'Connecting...' : 'Use Account'}
    </button>
  )
}

export function MetaAdsAccountSelector({
  accounts,
  selection,
  action,
}: {
  accounts: PendingOAuthAccount[]
  selection: string
  action: (formData: FormData) => void | Promise<void>
}) {
  return (
    <div className="flex flex-col gap-px" style={{ background: '#141414' }}>
      {accounts.map(account => (
        <form key={account.id} action={action} style={{ background: '#0a0a0a', padding: '20px 22px' }}>
          <input type="hidden" name="selection" value={selection} />
          <input type="hidden" name="accountId" value={account.id} />
          <div className="flex items-center justify-between gap-5 flex-wrap">
            <div className="flex items-start gap-4" style={{ minWidth: 240 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  border: '1px solid rgba(23,120,242,.34)',
                  background: 'rgba(23,120,242,.08)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <MetaLogo color="#1778f2" />
              </span>
              <div>
                <h2
                  className="font-jakarta font-light"
                  style={{ color: '#f2ede4', fontSize: 18, lineHeight: 1.1 }}
                >
                  {account.name}
                </h2>
                <div className="flex gap-5 flex-wrap mt-2">
                  <div>
                    <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                      Account ID
                    </p>
                    <p className="text-[11px] font-light mt-1" style={{ color: '#f2ede4' }}>
                      {account.id}
                    </p>
                  </div>
                  {account.business?.name && (
                    <div>
                      <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                        Business
                      </p>
                      <p className="text-[11px] font-light mt-1" style={{ color: '#f2ede4' }}>
                        {account.business.name}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <SubmitButton accountName={account.name} />
          </div>
        </form>
      ))}
    </div>
  )
}
