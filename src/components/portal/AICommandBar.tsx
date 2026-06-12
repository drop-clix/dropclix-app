'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Canvas, useFrame } from '@react-three/fiber'
import { Torus } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing'
import * as THREE from 'three'
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

// ── R3F Orb Scene — Tier 3 ────────────────────────────────────────────────

type OrbState = 'idle' | 'active' | 'thinking' | 'error'

// Custom GLSL vertex shader: icosahedron with simplex noise displacement
const VERTEX_SHADER = `
uniform float u_time;
uniform float u_intensity;
varying float vDisplacement;
varying vec3 vNorm;

vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289v4(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289v4(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289v3(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

void main(){
  vNorm=normalMatrix*normal;
  float n1=snoise(position*2.8+u_time*0.38)*u_intensity;
  float n2=snoise(position*5.2-u_time*0.24)*u_intensity*0.42;
  vDisplacement=n1+n2;
  vec3 disp=position+normal*(n1+n2)*0.22;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(disp,1.0);
}
`

const FRAGMENT_SHADER = `
uniform float u_intensity;
uniform float u_errorState;
varying float vDisplacement;
varying vec3 vNorm;

void main(){
  vec3 gold=vec3(0.788,0.663,0.431);
  vec3 cream=vec3(0.95,0.93,0.89);
  vec3 errorOrange=vec3(1.0,0.42,0.12);
  vec3 n=normalize(vNorm);
  float rim=1.0-abs(dot(n,vec3(0.0,0.0,1.0)));
  rim=pow(rim,2.2);
  float t=clamp(vDisplacement*1.8+0.5,0.0,1.0);
  vec3 col=mix(gold,cream,t);
  col=mix(col,errorOrange,u_errorState*0.65);
  col+=vec3(0.32,0.22,0.08)*rim*u_intensity*1.2;
  float alpha=0.72+rim*0.18;
  gl_FragColor=vec4(col,alpha);
}
`

function OrbCore({ state }: { state: OrbState }) {
  const meshRef  = useRef<THREE.Mesh>(null!)
  const glowRef  = useRef<THREE.Mesh>(null!)
  const intRef   = useRef(0.18)
  const spdRef   = useRef(0.32)
  const errRef   = useRef(0.0)

  const uniforms = useMemo(() => ({
    u_time:       { value: 0 },
    u_intensity:  { value: 0.18 },
    u_errorState: { value: 0.0 },
  }), [])

  useFrame((_, delta) => {
    uniforms.u_time.value += delta

    const tInt = state === 'idle' ? 0.18 : state === 'active' ? 0.52 : state === 'thinking' ? 0.76 : 0.44
    const tSpd = state === 'idle' ? 0.32 : state === 'active' ? 0.78 : state === 'thinking' ? 1.4  : 0.9
    const tErr = state === 'error' ? 1.0 : 0.0

    const k = delta * 2.4
    intRef.current = intRef.current + (tInt - intRef.current) * k
    spdRef.current = spdRef.current + (tSpd - spdRef.current) * k
    errRef.current = errRef.current + (tErr - errRef.current) * (delta * 4)

    uniforms.u_intensity.value  = intRef.current
    uniforms.u_errorState.value = errRef.current

    if (meshRef.current) {
      meshRef.current.rotation.y += delta * spdRef.current
      meshRef.current.rotation.x += delta * spdRef.current * 0.38
      meshRef.current.rotation.z += delta * spdRef.current * 0.14
    }
    if (glowRef.current) {
      const breathe = Math.sin(uniforms.u_time.value * (state === 'idle' ? 0.85 : 2.6)) * 0.028
      glowRef.current.scale.setScalar(1.22 + breathe)
      const mat = glowRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.06 + intRef.current * 0.2
    }
  })

  return (
    <>
      {/* Core: displaced icosahedron with GLSL shader */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.72, 20]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
        />
      </mesh>
      {/* Glow shell: back-face mesh with additive blending */}
      <mesh ref={glowRef}>
        <icosahedronGeometry args={[0.72, 4]} />
        <meshBasicMaterial
          color="#c9a96e"
          transparent
          opacity={0.1}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  )
}

function OrbRings({ state }: { state: OrbState }) {
  const r1 = useRef<THREE.Mesh>(null!)
  const r2 = useRef<THREE.Mesh>(null!)
  const r3 = useRef<THREE.Mesh>(null!)
  const spdRef = useRef(0.55)
  const opRef  = useRef(0.2)

  useFrame((_, delta) => {
    const tSpd = state === 'idle' ? 0.55 : state === 'active' ? 1.7 : state === 'thinking' ? 2.9 : 1.1
    const tOp  = state === 'idle' ? 0.2 : 0.48
    const k = delta * 2.2
    spdRef.current = spdRef.current + (tSpd - spdRef.current) * k
    opRef.current  = opRef.current  + (tOp  - opRef.current)  * k

    const s = spdRef.current; const op = opRef.current
    if (r1.current) {
      r1.current.rotation.z += delta * s
      ;(r1.current.material as THREE.MeshBasicMaterial).opacity = op
    }
    if (r2.current) {
      r2.current.rotation.z -= delta * s * 0.62
      ;(r2.current.material as THREE.MeshBasicMaterial).opacity = op * 0.72
    }
    if (r3.current) {
      r3.current.rotation.z += delta * s * 0.44
      r3.current.rotation.x += delta * s * 0.28
      ;(r3.current.material as THREE.MeshBasicMaterial).opacity = op * 0.52
    }
  })

  return (
    <>
      <Torus ref={r1} args={[1.02, 0.013, 12, 80]} rotation={[1.22, 0, 0]}>
        <meshBasicMaterial color="#c9a96e" transparent opacity={0.2} side={THREE.DoubleSide} />
      </Torus>
      <Torus ref={r2} args={[0.84, 0.01, 12, 80]} rotation={[0.76, 0.44, 0]}>
        <meshBasicMaterial color="#c9a96e" transparent opacity={0.15} side={THREE.DoubleSide} />
      </Torus>
      <Torus ref={r3} args={[0.64, 0.008, 12, 80]} rotation={[0.46, 0.82, 0]}>
        <meshBasicMaterial color="#c9a96e" transparent opacity={0.11} side={THREE.DoubleSide} />
      </Torus>
    </>
  )
}

const CA_OFFSET_IDLE    = new THREE.Vector2(0.0008, 0.0008)
const CA_OFFSET_ACTIVE  = new THREE.Vector2(0.002,  0.002)
const CA_OFFSET_THINK   = new THREE.Vector2(0.0035, 0.0035)

function OrbScene({ state }: { state: OrbState }) {
  const caOffset = state === 'thinking' ? CA_OFFSET_THINK : state === 'active' ? CA_OFFSET_ACTIVE : CA_OFFSET_IDLE
  const bloomInt = state === 'idle' ? 0.65 : state === 'active' ? 1.7 : state === 'thinking' ? 2.4 : 1.1
  const bloomThr = state === 'idle' ? 0.62 : state === 'active' ? 0.32 : state === 'thinking' ? 0.2 : 0.45

  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight position={[2, 2, 2]}   intensity={state === 'idle' ? 1 : 2.8}  color="#c9a96e" />
      <pointLight position={[-2, -1, -2]} intensity={0.28} color="#4cc9ff" />
      <OrbCore  state={state} />
      <OrbRings state={state} />
      <EffectComposer>
        <Bloom
          luminanceThreshold={bloomThr}
          luminanceSmoothing={0.38}
          intensity={bloomInt}
        />
        <ChromaticAberration offset={caOffset} />
      </EffectComposer>
    </>
  )
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
  const [orbError,  setOrbError ] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef   = useRef<any>(null)

  // Orb state: error briefly overrides other states
  const orbState: OrbState = orbError ? 'error' : loading ? 'thinking' : open ? 'active' : 'idle'

  useEffect(() => {
    if (orbError) {
      const t = setTimeout(() => setOrbError(false), 1800)
      return () => clearTimeout(t)
    }
  }, [orbError])

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
      setOrbError(true)
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
      setOrbError(true)
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
      {/* ── Floating orb + ⌘K hint ───────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 9000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {!open && (
          <span style={{
            fontSize: 8, fontWeight: 600, letterSpacing: '.12em',
            color: '#c9a96e', opacity: 0.4,
            fontFamily: 'DM Sans, sans-serif',
            pointerEvents: 'none',
            userSelect: 'none',
          }}>
            ⌘K
          </span>
        )}

        {/* R3F Orb button */}
        <button
          onClick={() => setOpen(v => !v)}
          aria-label="AI Command (⌘K)"
          style={{
            position: 'relative',
            width: 52,
            height: 52,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            borderRadius: '50%',
            overflow: 'visible',
          }}
        >
          <Canvas
            camera={{ position: [0, 0, 2.6], fov: 38 }}
            gl={{ antialias: true, alpha: true }}
            style={{ width: 52, height: 52, display: 'block', borderRadius: '50%' }}
            dpr={Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}
          >
            <OrbScene state={orbState} />
          </Canvas>
        </button>
      </div>

      {/* ── Slide-up panel ───────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 106,
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
            style={{ fontSize: 16, color: '#555', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
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
        @keyframes dotPulse {
          0%, 100% { opacity: .3; }
          50%       { opacity: 1; }
        }
      `}</style>
    </>
  )
}
