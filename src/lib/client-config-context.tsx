'use client'

import { createContext, useContext } from 'react'

export type ClientConfig = {
  enabledPlatforms: string[]   // e.g. ['ig', 'yt']
  enabledTabs:      string[]   // e.g. ['dashboard', 'analytics', 'pipeline']
  isAdmin:          boolean
}

const DEFAULT_CONFIG: ClientConfig = {
  enabledPlatforms: ['ig', 'tt', 'yt', 'lf'],
  enabledTabs:      ['dashboard','analytics','angles','pipeline','studio','ads','calendar','goals'],
  isAdmin:          false,
}

const ClientConfigContext = createContext<ClientConfig>(DEFAULT_CONFIG)

export function ClientConfigProvider({
  config,
  children,
}: {
  config: ClientConfig
  children: React.ReactNode
}) {
  return (
    <ClientConfigContext.Provider value={config}>
      {children}
    </ClientConfigContext.Provider>
  )
}

export function useClientConfig(): ClientConfig {
  return useContext(ClientConfigContext)
}
