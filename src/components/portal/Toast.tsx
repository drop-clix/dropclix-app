'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem { id: string; message: string; variant: ToastVariant }
interface ToastCtx  { toast: (message: string, variant?: ToastVariant) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export function useToast() { return useContext(Ctx) }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const toast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, variant }])
    timers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      delete timers.current[id]
    }, 3000)
  }, [])

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const ACCENT: Record<ToastVariant, string> = {
    success: '#c9a96e',
    error:   '#ff3b5f',
    info:    '#555',
  }

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          display: 'flex', flexDirection: 'column', gap: 8,
          pointerEvents: 'none',
        }}
        aria-live="polite"
      >
        {toasts.map(t => {
          const accent = ACCENT[t.variant]
          return (
            <div
              key={t.id}
              style={{
                background: '#070707',
                border: `1px solid ${accent}30`,
                borderLeft: `3px solid ${accent}`,
                padding: '10px 14px 10px 12px',
                minWidth: 220, maxWidth: 360,
                display: 'flex', alignItems: 'center', gap: 10,
                pointerEvents: 'auto', cursor: 'pointer',
                boxShadow: '0 8px 28px rgba(0,0,0,.6)',
                animation: 'dcToastIn .2s cubic-bezier(.16,1,.3,1) forwards',
              }}
              onClick={() => dismiss(t.id)}
              role="status"
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#d4ccbc', fontFamily: 'DM Sans, sans-serif', flex: 1, lineHeight: 1.4 }}>
                {t.message}
              </span>
              <span style={{ fontSize: 15, color: '#333', lineHeight: 1, flexShrink: 0 }}>×</span>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes dcToastIn {
          from { opacity: 0; transform: translateX(14px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </Ctx.Provider>
  )
}
