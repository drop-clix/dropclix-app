'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  createPipelineItem,
  bulkUpdatePipelineStatus,
  updateAnalyticsByTextId,
} from '@/app/(dashboard)/edit-actions'
import { useToast } from '@/components/portal/Toast'

// ── Types ──────────────────────────────────────────────────────────────────

type AIResponse =
  | { type: 'text'; content: string }
  | { type: 'action'; action: string; summary: string; data: Record<string, unknown> }

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  response?: AIResponse
  status?: 'idle' | 'executing' | 'success' | 'error'
  errorMsg?: string
}

// ── Sparkle icon ───────────────────────────────────────────────────────────

function SparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z" />
    </svg>
  )
}

function MicIcon({ size = 15, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={active ? '#c9a96e' : 'currentColor'} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  )
}

function SendIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

// ── Action confirmation card ───────────────────────────────────────────────

function ActionCard({
  response,
  status,
  errorMsg,
  onConfirm,
  onCancel,
}: {
  response: AIResponse & { type: 'action' }
  status: Message['status']
  errorMsg?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const actionLabels: Record<string, string> = {
    add_pipeline:       'Add to Pipeline',
    update_analytics:   'Update Analytics',
    bulk_update_status: 'Bulk Update Status',
  }

  const dataRows: { label: string; value: string }[] = []
  const d = response.data
  if (d.title)          dataRows.push({ label: 'Title',    value: String(d.title) })
  if (d.postId)         dataRows.push({ label: 'ID',       value: String(d.postId) })
  if (d.platform)       dataRows.push({ label: 'Platform', value: Array.isArray(d.platform) ? (d.platform as string[]).join(' · ').toUpperCase() : String(d.platform).toUpperCase() })
  if (d.status)         dataRows.push({ label: 'Status',   value: String(d.status) })
  if (d.priority)       dataRows.push({ label: 'Priority', value: String(d.priority) })
  if (d.pillar)         dataRows.push({ label: 'Pillar',   value: String(d.pillar) })
  if (d.week)           dataRows.push({ label: 'Week',     value: String(d.week) })
  if (d.postTextId)     dataRows.push({ label: 'Post',     value: String(d.postTextId) })
  if (d.field)          dataRows.push({ label: 'Field',    value: String(d.field) })
  if (d.value !== undefined) dataRows.push({ label: 'Value', value: String(d.value) })
  if (d.fromStatus)     dataRows.push({ label: 'From',     value: String(d.fromStatus) })
  if (d.toStatus)       dataRows.push({ label: 'To',       value: String(d.toStatus) })

  const isDone = status === 'success' || status === 'error'

  return (
    <div style={{
      background: '#0c0c0c',
      border: '1px solid rgba(201,169,110,.25)',
      borderLeft: '3px solid #c9a96e',
      borderRadius: 2,
      padding: '12px 14px',
      marginTop: 8,
    }}>
      <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: 6 }}>
        {actionLabels[response.action] ?? response.action}
      </p>
      <p style={{ fontSize: 12, color: '#d4ccbc', marginBottom: 10, fontWeight: 300 }}>{response.summary}</p>

      {dataRows.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {dataRows.map(row => (
            <div key={row.label} style={{ display: 'flex', gap: 10, marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: '#555', minWidth: 56, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase' }}>{row.label}</span>
              <span style={{ fontSize: 10, color: '#aaa', fontFamily: row.label === 'ID' || row.label === 'Post' ? 'monospace' : undefined }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {status === 'success' ? (
        <p style={{ fontSize: 10, color: '#39ff88', fontWeight: 500 }}>✓ Done</p>
      ) : status === 'error' ? (
        <p style={{ fontSize: 10, color: '#ff3b5f' }}>✗ {errorMsg ?? 'Failed'}</p>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onConfirm}
            disabled={status === 'executing'}
            style={{
              padding: '6px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
              background: 'rgba(201,169,110,.12)', border: '1px solid rgba(201,169,110,.5)',
              color: '#c9a96e', cursor: status === 'executing' ? 'wait' : 'pointer', fontWeight: 600,
            }}
          >
            {status === 'executing' ? 'Executing…' : 'Confirm'}
          </button>
          <button
            onClick={onCancel}
            disabled={status === 'executing'}
            style={{
              padding: '6px 14px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid #1e1e1e', color: '#444', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function AICommandBar() {
  const router = useRouter()
  const { toast } = useToast()
  const [open,      setOpen     ] = useState(false)
  const [messages,  setMessages ] = useState<Message[]>([])
  const [input,     setInput    ] = useState('')
  const [loading,   setLoading  ] = useState(false)
  const [listening, setListening] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef   = useRef<any>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Init speech recognition (browser API — minimal typing)
  const hasSpeech = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startListening = useCallback(() => {
    if (!hasSpeech) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recog: any = new SR()
    recog.continuous = false
    recog.interimResults = true
    recog.lang = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('')
      setInput(transcript)
    }
    recog.onend = () => setListening(false)
    recog.onerror = () => setListening(false)
    recogRef.current = recog
    recog.start()
    setListening(true)
  }, [hasSpeech])

  const stopListening = useCallback(() => {
    recogRef.current?.stop()
    setListening(false)
  }, [])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/ai-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data: AIResponse = await res.json()

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: data.type === 'text' ? data.content : data.summary,
        response: data,
        status: data.type === 'action' ? 'idle' : undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Connection error. Please try again.',
      }])
    } finally {
      setLoading(false)
    }
  }

  async function executeAction(msgId: string, response: AIResponse & { type: 'action' }) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'executing' } : m))

    let result: { error?: string; count?: number }  = {}
    const d = response.data

    if (response.action === 'add_pipeline') {
      result = await createPipelineItem({
        postId:        String(d.postId ?? ''),
        title:         String(d.title ?? ''),
        platform:      Array.isArray(d.platform) ? d.platform as string[] : [String(d.platform)],
        status:        String(d.status ?? 'PLANNED'),
        priority:      Number(d.priority ?? 3),
        pillar:        d.pillar ? String(d.pillar) : null,
        week:          d.week ? String(d.week) : null,
        scriptContent: d.scriptContent ? String(d.scriptContent) : null,
      })
    } else if (response.action === 'update_analytics') {
      result = await updateAnalyticsByTextId(
        String(d.postTextId ?? ''),
        String(d.platform ?? 'ig'),
        String(d.metricWindow ?? 'eom'),
        String(d.field ?? 'views'),
        Number(d.value ?? 0),
      )
    } else if (response.action === 'bulk_update_status') {
      result = await bulkUpdatePipelineStatus(
        String(d.fromStatus ?? ''),
        String(d.toStatus ?? ''),
      )
    }

    if (result.error) {
      setMessages(prev => prev.map(m => m.id === msgId
        ? { ...m, status: 'error', errorMsg: result.error }
        : m
      ))
      toast(result.error, 'error')
    } else {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success' } : m))
      router.refresh()
      if (response.action === 'add_pipeline') {
        toast(`Added to pipeline · ${String(response.data.title ?? '')}`, 'success')
      } else if (response.action === 'bulk_update_status' && result.count !== undefined) {
        toast(`${result.count} item${result.count === 1 ? '' : 's'} moved to ${String(response.data.toStatus ?? '')}`, 'success')
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `Updated ${result.count} item${result.count === 1 ? '' : 's'}.`,
        }])
      } else if (response.action === 'update_analytics') {
        toast(`Saved · ${String(response.data.postTextId ?? '')} updated`, 'success')
      }
    }
  }

  function cancelAction(msgId: string) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error', errorMsg: 'Cancelled' } : m))
  }

  // Keep only last 10 messages (5 exchanges) visible
  const visibleMessages = messages.slice(-10)

  return (
    <>
      {/* ── Floating button + ⌘K hint ────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 9000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {!open && (
          <span style={{
            fontSize: 8, fontWeight: 600, letterSpacing: '.12em',
            color: '#c9a96e', opacity: 0.55,
            fontFamily: 'DM Sans, sans-serif',
            pointerEvents: 'none',
            userSelect: 'none',
          }}>
            ⌘K
          </span>
        )}
        <button
          onClick={() => setOpen(v => !v)}
          aria-label="AI Command (⌘K)"
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: open
              ? 'rgba(201,169,110,.25)'
              : 'rgba(201,169,110,.15)',
            border: '1px solid rgba(201,169,110,.55)',
            color: '#c9a96e',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: open
              ? '0 0 24px rgba(201,169,110,.2)'
              : '0 0 0 0 rgba(201,169,110,0)',
            transition: 'all .25s ease',
            animation: !open ? 'aiPulse 3s ease-in-out infinite' : 'none',
          }}
        >
          <SparkleIcon size={20} />
        </button>
      </div>

      {/* ── Slide-up panel ───────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 100,
          right: 28,
          zIndex: 8999,
          width: 420,
          maxWidth: 'calc(100vw - 56px)',
          maxHeight: 580,
          display: 'flex',
          flexDirection: 'column',
          background: '#070707',
          border: '1px solid #1a1a1a',
          borderTop: '2px solid #c9a96e',
          boxShadow: '0 24px 60px rgba(0,0,0,.7)',
          transform: open ? 'translateY(0) scale(1)' : 'translateY(16px) scale(.97)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'transform .25s cubic-bezier(.16,1,.3,1), opacity .2s ease',
        }}
      >
        {/* Panel header */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid #141414',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SparkleIcon size={13} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: '#c9a96e' }}>
              AI Command
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{ fontSize: 16, color: '#333', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Message area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {visibleMessages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 24 }}>
              <p style={{ fontSize: 12, color: '#444', marginBottom: 8 }}>Ask me anything about your content.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                {[
                  'Add a TikTok video "Why solar saves money" to Sales, JunWk3',
                  'What\'s my best performing pillar this month?',
                  'Move all Filming items to Reviewing',
                ].map(hint => (
                  <button key={hint} onClick={() => setInput(hint)} style={{
                    fontSize: 10, color: '#555', background: '#0d0d0d',
                    border: '1px solid #1a1a1a', padding: '5px 10px',
                    cursor: 'pointer', textAlign: 'left', maxWidth: 320,
                    transition: 'border-color .15s, color .15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e40'; (e.currentTarget as HTMLButtonElement).style.color = '#777' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1a1a1a'; (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibleMessages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '88%',
                padding: '8px 12px',
                background: msg.role === 'user' ? 'rgba(201,169,110,.1)' : '#0d0d0d',
                border: `1px solid ${msg.role === 'user' ? 'rgba(201,169,110,.25)' : '#1a1a1a'}`,
                fontSize: 12,
                color: msg.role === 'user' ? '#d4ccbc' : '#bbb',
                fontWeight: 300,
                lineHeight: 1.5,
              }}>
                {msg.text}
              </div>
              {msg.response?.type === 'action' && (
                <ActionCard
                  response={msg.response as AIResponse & { type: 'action' }}
                  status={msg.status}
                  errorMsg={msg.errorMsg}
                  onConfirm={() => executeAction(msg.id, msg.response as AIResponse & { type: 'action' })}
                  onCancel={() => cancelAction(msg.id)}
                />
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ padding: '8px 12px', background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
                <span style={{ fontSize: 11, color: '#555', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ animation: 'dotPulse .8s ease-in-out infinite' }}>●</span>
                  <span style={{ animation: 'dotPulse .8s ease-in-out .2s infinite' }}>●</span>
                  <span style={{ animation: 'dotPulse .8s ease-in-out .4s infinite' }}>●</span>
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: '12px 14px',
          borderTop: '1px solid #141414',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          flexShrink: 0,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Ask or command… (Enter to send)"
            rows={1}
            style={{
              flex: 1,
              background: '#0a0a0a',
              border: '1px solid #1e1e1e',
              color: '#d4ccbc',
              padding: '8px 10px',
              fontSize: 12,
              fontFamily: 'DM Sans, sans-serif',
              outline: 'none',
              resize: 'none',
              lineHeight: 1.5,
              maxHeight: 80,
              overflowY: 'auto',
            }}
            onFocus={e  => (e.target.style.borderColor = '#c9a96e40')}
            onBlur={e   => (e.target.style.borderColor = '#1e1e1e')}
          />

          {hasSpeech && (
            <button
              onClick={listening ? stopListening : startListening}
              title={listening ? 'Stop listening' : 'Voice input'}
              style={{
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: listening ? 'rgba(201,169,110,.12)' : 'transparent',
                border: `1px solid ${listening ? 'rgba(201,169,110,.4)' : '#1e1e1e'}`,
                color: listening ? '#c9a96e' : '#444',
                cursor: 'pointer',
                flexShrink: 0,
                borderRadius: 2,
                transition: 'all .15s',
              }}
            >
              <MicIcon active={listening} />
            </button>
          )}

          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: input.trim() && !loading ? 'rgba(201,169,110,.12)' : 'transparent',
              border: `1px solid ${input.trim() && !loading ? 'rgba(201,169,110,.4)' : '#1e1e1e'}`,
              color: input.trim() && !loading ? '#c9a96e' : '#333',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              flexShrink: 0,
              borderRadius: 2,
              transition: 'all .15s',
            }}
          >
            <SendIcon />
          </button>
        </div>
      </div>

      {/* ── CSS animations ───────────────────────────────────────────── */}
      <style>{`
        @keyframes aiPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(201,169,110,.0), 0 4px 20px rgba(0,0,0,.4); }
          50% { box-shadow: 0 0 0 6px rgba(201,169,110,.10), 0 4px 20px rgba(0,0,0,.4); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: .3; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  )
}
