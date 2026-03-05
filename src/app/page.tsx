'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

// --- Types ---
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  files?: UploadedFile[]
  toolResults?: ToolResult[]
}

interface UploadedFile {
  name: string
  url: string
  type: string
}

interface ToolResult {
  type: string
  name: string
  data: Record<string, unknown>
}

// --- 견적 계산 카드 ---
function QuoteCard({ data }: { data: Record<string, unknown> }) {
  if (data.error) {
    return (
      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        ⚠️ {data.error as string}
      </div>
    )
  }
  return (
    <div className="mt-2 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl">
      <div className="text-xs font-semibold text-blue-600 mb-2">📋 견적 계산 결과</div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-gray-500">색상 수</div>
        <div className="font-medium">{data.colorCount as number}색</div>
        <div className="text-gray-500">수량</div>
        <div className="font-medium">{data.quantity as number}개</div>
        <div className="text-gray-500">개당 가격</div>
        <div className="font-medium">{data.unitPrice as string}</div>
        <div className="text-gray-500 font-semibold">총 금액</div>
        <div className="font-bold text-lg text-primary">{data.totalPrice as string}</div>
      </div>
      <div className="mt-2 pt-2 border-t border-blue-200 text-xs text-gray-500">
        ⏱️ 제작기간: {data.productionDays as string} | 최소 수량: {data.minQuantity as number}개
      </div>
    </div>
  )
}

// --- 주문 완료 카드 ---
function OrderCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-2 p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl">
      <div className="text-sm font-semibold text-green-700 mb-1">✅ 주문이 접수되었습니다!</div>
      <div className="text-xs text-gray-500">주문번호: {data.orderId as string}</div>
    </div>
  )
}

// --- 마크다운 기호 제거 ---
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.*?)\*/g, '$1')       // *italic* → italic
    .replace(/^#{1,6}\s+/gm, '')       // ## heading → heading
    .replace(/^[-*+]\s+/gm, '• ')      // - item → • item (깔끔한 불릿으로)
    .replace(/`(.*?)`/g, '$1')         // `code` → code
}

const LOGO_URL = 'https://ecimg.cafe24img.com/pg1056b95784775091/diveintosmile/web/upload/_dj/img/s107/240613/logo3.png'

// --- 메시지 버블 ---
function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const displayContent = isUser ? message.content : stripMarkdown(message.content)
  return (
    <div className={`msg-enter flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <img src={LOGO_URL} alt="다이브인투" className="h-5 object-contain" />
          </div>
        )}
        <div
          className={`px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-primary text-white rounded-br-md'
              : 'bg-white text-gray-800 rounded-bl-md shadow-sm border border-gray-100'
          }`}
        >
          {displayContent}
        </div>
        {/* 첨부 파일 미리보기 */}
        {message.files && message.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.files.map((f, i) => (
              <div key={i} className="relative">
                {f.type.startsWith('image/') ? (
                  <img src={f.url} alt={f.name} className="w-20 h-20 object-cover rounded-lg border" />
                ) : (
                  <div className="w-20 h-20 bg-gray-100 rounded-lg border flex items-center justify-center text-xs text-gray-500">
                    📄 {f.name.split('.').pop()?.toUpperCase()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* 도구 결과 카드 */}
        {message.toolResults?.map((tr, i) => (
          <div key={i}>
            {tr.name === 'calculate_quote' && <QuoteCard data={tr.data} />}
            {tr.name === 'submit_order' && <OrderCard data={tr.data} />}
          </div>
        ))}
        <div className={`text-[10px] text-gray-300 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// --- 타이핑 인디케이터 ---
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3 msg-enter">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <img src={LOGO_URL} alt="다이브인투" className="h-5 object-contain" />
        </div>
        <div className="px-4 py-3 bg-white rounded-2xl rounded-bl-md shadow-sm border border-gray-100 flex gap-1">
          <span className="typing-dot w-2 h-2 bg-gray-400 rounded-full inline-block" />
          <span className="typing-dot w-2 h-2 bg-gray-400 rounded-full inline-block" />
          <span className="typing-dot w-2 h-2 bg-gray-400 rounded-full inline-block" />
        </div>
      </div>
    </div>
  )
}

// --- 퀵 액션 (항상 표시) ---
function QuickActions({ onAction, disabled }: { onAction: (text: string) => void; disabled?: boolean }) {
  const actions = [
    { emoji: '🏊', label: '단체 수모 제작', text: '단체 수영모 주문제작하고 싶어요' },
    { emoji: '👙', label: '상품 추천', text: '수영복이나 수영모자 추천해주세요' },
  ]
  return (
    <div className="flex flex-wrap gap-2 justify-center py-2">
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={() => onAction(a.text)}
          disabled={disabled}
          className="flex items-center gap-1.5 px-4 py-2 bg-white border border-blue-200 rounded-full text-sm text-gray-700 hover:bg-blue-50 hover:border-primary transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>{a.emoji}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  )
}

// --- 메인 채팅 ---
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('diveinto_session')
      if (stored) return stored
      const newId = uuidv4()
      localStorage.setItem('diveinto_session', newId)
      return newId
    }
    return uuidv4()
  })
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])

  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 스크롤 하단 고정
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // 초기 인사 메시지
  useEffect(() => {
    const greeting: Message = {
      id: 'greeting',
      role: 'assistant',
      content: '안녕하세요! 다이브인투입니다 🏊\n수영모자 & 수영복 전문 쇼핑몰에 오신 것을 환영합니다.\n\n무엇을 도와드릴까요?',
      timestamp: new Date(),
    }
    setMessages([greeting])
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() && uploadedFiles.length === 0) return
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: text + (uploadedFiles.length > 0 ? `\n\n[${uploadedFiles.map(f => f.name).join(', ')} 파일을 첨부했습니다]` : ''),
      timestamp: new Date(),
      files: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setUploadedFiles([])
    setIsLoading(true)

    try {
      // 이전 메시지 컨텍스트 준비 (최근 20개)
      const chatHistory = [...messages.filter(m => m.id !== 'greeting'), userMessage]
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory, sessionId }),
      })

      const data = await res.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        toolResults: data.toolResults?.length > 0 ? data.toolResults : undefined,
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch {
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '죄송합니다. 일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [messages, sessionId, uploadedFiles])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('sessionId', sessionId)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setUploadedFiles(prev => [...prev, {
          name: data.fileName,
          url: data.fileUrl,
          type: file.type,
        }])
      } else {
        alert(data.error || '파일 업로드에 실패했습니다.')
      }
    } catch {
      alert('파일 업로드 중 오류가 발생했습니다.')
    }
    // 파일 인풋 초기화
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto bg-surface">
      {/* 헤더 */}
      <header className="flex-shrink-0 bg-gradient-to-r from-primary to-secondary px-4 py-3 flex items-center gap-3 shadow-md">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1.5">
          <img src={LOGO_URL} alt="다이브인투" className="h-full object-contain" />
        </div>
        <div>
          <h1 className="text-white font-bold text-base">다이브인투</h1>
          <p className="text-white/70 text-xs">수영모자 & 수영복 전문</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-white/70 text-xs">온라인</span>
        </div>
      </header>

      {/* 채팅 영역 */}
      <main className="flex-1 overflow-y-auto chat-scroll px-4 py-4">
        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {isLoading && <TypingIndicator />}
        <div ref={chatEndRef} />
      </main>

      {/* 첨부 파일 프리뷰 */}
      {uploadedFiles.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-white border-t flex gap-2 overflow-x-auto">
          {uploadedFiles.map((f, i) => (
            <div key={i} className="relative flex-shrink-0">
              {f.type.startsWith('image/') ? (
                <img src={f.url} alt={f.name} className="w-14 h-14 object-cover rounded-lg border" />
              ) : (
                <div className="w-14 h-14 bg-gray-100 rounded-lg border flex items-center justify-center text-[10px] text-gray-500">
                  📄 {f.name.split('.').pop()?.toUpperCase()}
                </div>
              )}
              <button
                onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 퀵 액션 칩 (항상 표시) */}
      <div className="flex-shrink-0 bg-surface border-t border-gray-100 px-3 pt-2">
        <QuickActions onAction={(text) => sendMessage(text)} disabled={isLoading} />
      </div>

      {/* 입력 영역 */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200 px-3 py-2 safe-bottom">
        <div className="flex items-end gap-2">
          {/* 파일 첨부 버튼 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-primary transition-colors rounded-full hover:bg-blue-50"
            title="파일 첨부"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="hidden" />

          {/* 텍스트 입력 */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-[15px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 max-h-32"
            style={{ minHeight: '42px' }}
            disabled={isLoading}
          />

          {/* 전송 버튼 */}
          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
            className="flex-shrink-0 w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center disabled:opacity-40 hover:bg-primary-dark transition-colors active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  )
}
