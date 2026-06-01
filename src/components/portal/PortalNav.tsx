'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/',            label: 'Dashboard'   },
  { href: '/analytics',   label: 'Analytics'   },
  { href: '/angles',      label: 'Angles'      },
  { href: '/pipeline',    label: 'Pipeline'    },
  { href: '/studio',      label: 'Studio'      },
  { href: '/ads',         label: 'Ads'         },
  { href: '/calendar',    label: 'Calendar'    },
  { href: '/goals',       label: 'Goals'       },
  { href: '/report-card', label: 'Report Card' },
]

export function PortalNav() {
  const path = usePathname()

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV_ITEMS.map(item => {
        const active = path === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center px-3 py-3 text-[10px] font-medium tracking-[.18em] uppercase transition-colors"
            style={{
              color:       active ? '#c9a96e' : '#3a3a3a',
              background:  active ? 'rgba(201,169,110,0.07)' : 'transparent',
              borderLeft:  active ? '2px solid #c9a96e' : '2px solid transparent',
            }}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
