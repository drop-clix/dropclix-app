'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useEffect, useRef, useCallback } from 'react'

const GOLD = '#c9a96e'

function ToolbarBtn({
  active, onClick, children, title,
}: {
  active?: boolean; onClick: () => void; children: React.ReactNode; title: string
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      style={{
        width: 26, height: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(201,169,110,.12)' : 'transparent',
        border: active ? `1px solid rgba(201,169,110,.3)` : '1px solid transparent',
        borderRadius: 3,
        color: active ? GOLD : '#666',
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        transition: 'all .12s',
      }}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
  debounceMs = 1000,
  readOnly = false,
  minHeight = 140,
}: {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  debounceMs?: number
  readOnly?: boolean
  minHeight?: number
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const debouncedSave = useCallback((html: string) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChangeRef.current(html), debounceMs)
  }, [debounceMs])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({ openOnClick: false }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor: e }) => {
      debouncedSave(e.getHTML())
    },
    editorProps: {
      attributes: {
        style: [
          `min-height:${minHeight}px`,
          'outline:none',
          'color:#f2ede4',
          'font-size:12px',
          'line-height:1.65',
          'padding:12px 14px',
        ].join(';'),
      },
    },
  }, [])

  useEffect(() => {
    return () => clearTimeout(timer.current)
  }, [])

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  if (!editor) return null

  const wordCount = editor.getText().split(/\s+/).filter(Boolean).length

  return (
    <div style={{
      border: '1px solid #1e1e1e',
      borderRadius: 4,
      background: '#0a0a0a',
      overflow: 'hidden',
    }}>
      {!readOnly && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '4px 6px',
          borderBottom: '1px solid #1e1e1e',
          background: '#0d0d0d',
          flexWrap: 'wrap',
        }}>
          <ToolbarBtn
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold (⌘B)"
          >
            B
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic (⌘I)"
          >
            <em>I</em>
          </ToolbarBtn>
          <div style={{ width: 1, height: 16, background: '#1e1e1e', margin: '0 4px' }} />
          <ToolbarBtn
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            H1
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            H2
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            H3
          </ToolbarBtn>
          <div style={{ width: 1, height: 16, background: '#1e1e1e', margin: '0 4px' }} />
          <ToolbarBtn
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            •
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered List"
          >
            1.
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            "
          </ToolbarBtn>
          <div style={{ width: 1, height: 16, background: '#1e1e1e', margin: '0 4px' }} />
          <ToolbarBtn
            active={editor.isActive('link')}
            onClick={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run()
              } else {
                const url = window.prompt('URL')
                if (url) editor.chain().focus().setLink({ href: url }).run()
              }
            }}
            title="Link (⌘K)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 9.5L9.5 6.5M7 11l-1.7 1.7a2.12 2.12 0 01-3-3L4 8M9 5l1.7-1.7a2.12 2.12 0 013 3L12 8"/></svg>
          </ToolbarBtn>
        </div>
      )}
      <EditorContent editor={editor} />
      {!readOnly && (
        <div style={{
          padding: '4px 10px',
          borderTop: '1px solid #1e1e1e',
          fontSize: 9, color: '#555',
          textAlign: 'right',
        }}>
          {wordCount} word{wordCount !== 1 ? 's' : ''}
        </div>
      )}
      <style>{`
        .tiptap { text-shadow: none; }
        .tiptap p { margin: 0 0 8px; }
        .tiptap h1 { font-size: 18px; font-weight: 600; margin: 0 0 10px; color: #f2ede4; }
        .tiptap h2 { font-size: 15px; font-weight: 600; margin: 0 0 8px; color: #f2ede4; }
        .tiptap h3 { font-size: 13px; font-weight: 600; margin: 0 0 6px; color: #f2ede4; }
        .tiptap ul, .tiptap ol { padding-left: 20px; margin: 0 0 8px; }
        .tiptap li { margin-bottom: 4px; }
        .tiptap blockquote { border-left: 2px solid ${GOLD}; padding-left: 12px; margin: 0 0 8px; color: #999; }
        .tiptap a { color: #4cc9ff; text-decoration: underline; }
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #3a3a3a;
          pointer-events: none;
          float: left;
          height: 0;
        }
      `}</style>
    </div>
  )
}
