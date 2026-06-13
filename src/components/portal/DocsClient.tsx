'use client'

import { useState, useEffect, useCallback } from 'react'
import { getAgencyDocs, saveAgencyDoc, deleteAgencyDoc } from '@/app/(dashboard)/edit-actions'
import { RichTextEditor } from '@/components/portal/RichTextEditor'
import { useToast } from '@/components/portal/Toast'
import { EmptyState } from '@/components/portal/EmptyState'

type Doc = { id: string; title: string; content: string; updated_at: string }

export function DocsClient() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    getAgencyDocs().then(res => {
      if (res.docs) setDocs(res.docs)
      setLoading(false)
    })
  }, [])

  const selectedDoc = docs.find(d => d.id === selected)

  const filtered = search
    ? docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()))
    : docs

  const handleCreate = useCallback(async () => {
    const { id, error } = await saveAgencyDoc({ title: 'Untitled Document', content: '' })
    if (error) { toast(error, 'error'); return }
    const newDoc: Doc = { id: id!, title: 'Untitled Document', content: '', updated_at: new Date().toISOString() }
    setDocs(prev => [newDoc, ...prev])
    setSelected(id!)
  }, [toast])

  const handleSaveTitle = useCallback(async (docId: string, title: string) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, title } : d))
    await saveAgencyDoc({ id: docId, title, content: docs.find(d => d.id === docId)?.content ?? '' })
  }, [docs])

  const handleSaveContent = useCallback(async (docId: string, content: string) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, content } : d))
    const doc = docs.find(d => d.id === docId)
    await saveAgencyDoc({ id: docId, title: doc?.title ?? 'Untitled', content })
  }, [docs])

  const handleDelete = useCallback(async (docId: string) => {
    const { error } = await deleteAgencyDoc(docId)
    if (error) { toast(error, 'error'); return }
    setDocs(prev => prev.filter(d => d.id !== docId))
    if (selected === docId) setSelected(null)
    toast('Document deleted')
  }, [selected, toast])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 12 }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 240px)', gap: 0 }}>
      {/* Left: Doc List */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: '1px solid #141414',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #141414' }}>
          <input
            type="text"
            placeholder="Search docs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', background: '#111', border: '1px solid #1e1e1e',
              borderRadius: 3, padding: '7px 10px', fontSize: 11,
              color: '#f2ede4',
            }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
          />
        </div>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #141414' }}>
          <button
            onClick={handleCreate}
            style={{
              width: '100%', padding: '8px 0',
              fontSize: 9, fontWeight: 600,
              letterSpacing: '.14em', textTransform: 'uppercase',
              color: '#c9a96e', background: 'rgba(201,169,110,.06)',
              border: '1px solid rgba(201,169,110,.25)', borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            + New Document
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: '#555' }}>
                {search ? 'No docs match your search.' : 'No docs yet. Create your first SOP.'}
              </p>
            </div>
          ) : (
            filtered.map(doc => {
              const active = doc.id === selected
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelected(doc.id)}
                  style={{
                    width: '100%', padding: '14px 16px',
                    textAlign: 'left', cursor: 'pointer',
                    background: active ? 'rgba(201,169,110,.05)' : 'transparent',
                    borderLeft: `2px solid ${active ? '#c9a96e' : 'transparent'}`,
                    borderRight: 'none', borderTop: 'none',
                    borderBottom: '1px solid #0d0d0d',
                    transition: 'background .15s',
                  }}
                >
                  <p style={{
                    fontSize: 11, color: active ? '#f2ede4' : '#888',
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    margin: 0,
                  }}>
                    {doc.title || 'Untitled'}
                  </p>
                  <p style={{ fontSize: 9, color: '#3a3a3a', margin: '3px 0 0' }}>
                    {new Date(doc.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right: Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedDoc ? (
          <>
            <div style={{
              padding: '14px 24px', borderBottom: '1px solid #141414',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <input
                type="text"
                value={selectedDoc.title}
                onChange={e => handleSaveTitle(selectedDoc.id, e.target.value)}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  fontSize: 16, fontWeight: 300, color: '#f2ede4',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
                placeholder="Document title..."
              />
              <button
                onClick={() => {
                  if (confirm('Delete this document?')) handleDelete(selectedDoc.id)
                }}
                style={{
                  padding: '5px 12px', fontSize: 9, color: '#ff3b5f',
                  background: 'rgba(255,59,95,.06)', border: '1px solid rgba(255,59,95,.25)',
                  borderRadius: 3, cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              <RichTextEditor
                content={selectedDoc.content}
                onChange={html => handleSaveContent(selectedDoc.id, html)}
                placeholder="Start writing your SOP..."
                debounceMs={1500}
                minHeight={400}
              />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              icon="chart"
              headline="No docs yet."
              body="Create your first SOP to get started."
            />
          </div>
        )}
      </div>
    </div>
  )
}
