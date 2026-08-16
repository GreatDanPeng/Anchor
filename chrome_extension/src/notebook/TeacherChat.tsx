import { useEffect, useRef, useState } from 'react'
import { appendFolderChat, clearFolderChat, getFolderChat, newId } from '../lib/storage'
import { sendChatMessage } from '../lib/llm'
import { extractFileText } from '../lib/fileText'
import type { ChatAttachment, ChatMessage, Folder } from '../types'
import type { ChatTurn } from '../lib/llmProviders'

interface Props {
  readonly folder: Folder
  readonly skills: string
}

export default function TeacherChat({ folder, skills }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getFolderChat(folder.id).then((msgs) => {
      setMessages(msgs)
      setLoading(false)
    })
  }, [folder.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    setErrorMsg('')
    for (const file of files) {
      try {
        const text = await extractFileText(file)
        setPendingFiles((prev) => [...prev, { name: file.name, text }])
      } catch (err) {
        setErrorMsg((err as Error).message)
      }
    }
  }

  function removeAttachment(name: string) {
    setPendingFiles((prev) => prev.filter((f) => f.name !== name))
  }

  async function handleSend() {
    if (!input.trim() || sending) return
    setErrorMsg('')
    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      content: input.trim(),
      attachments: pendingFiles.length > 0 ? pendingFiles : undefined,
      createdAt: new Date().toISOString(),
    }
    const historyBefore = messages
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setPendingFiles([])
    setSending(true)
    await appendFolderChat(folder.id, userMessage)

    try {
      const turns: ChatTurn[] = historyBefore.map((m) => ({ role: m.role, content: m.content }))
      const reply = await sendChatMessage(skills, turns, userMessage.content, userMessage.attachments ?? [])
      const assistantMessage: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      await appendFolderChat(folder.id, assistantMessage)
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  async function handleClear() {
    await clearFolderChat(folder.id)
    setMessages([])
  }

  if (loading) return <div className="p-10 text-gray-400">Loading…</div>

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-700">Teacher Mode</p>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => void handleClear()}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Clear chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">
            Ask a question grounded in this folder's skills — or attach your homework/resume and
            ask about a specific problem.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              {m.attachments && m.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {m.attachments.map((a) => (
                    <span
                      key={a.name}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-semibold"
                    >
                      📎 {a.name}
                    </span>
                  ))}
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {sending && <p className="text-xs text-gray-400">Thinking…</p>}
        <div ref={bottomRef} />
      </div>

      {errorMsg && <p className="px-6 text-xs text-red-500">{errorMsg}</p>}

      <div className="border-t border-gray-100 p-4 space-y-2">
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pendingFiles.map((f) => (
              <span
                key={f.name}
                className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-semibold flex items-center gap-1"
              >
                📎 {f.name}
                <button type="button" onClick={() => removeAttachment(f.name)} className="text-blue-400 hover:text-blue-600">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf,application/pdf,text/plain,text/markdown"
            onChange={(e) => void handleFilePick(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach a file (homework, resume, etc.)"
            className="shrink-0 h-10 w-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            placeholder="Ask a question, or attach a file and ask about it…"
            rows={1}
            className="flex-1 resize-none text-sm border border-gray-200 rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            className="shrink-0 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-full transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
