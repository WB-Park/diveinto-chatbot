import { NextRequest } from 'next/server'
import { getAnthropic, tools, SYSTEM_PROMPT, handleToolCall } from '@/lib/claude'
import { getServiceSupabase } from '@/lib/supabase'
import { sendOrderNotification } from '@/lib/email'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 60

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId } = await req.json() as {
      messages: ChatMessage[]
      sessionId: string
    }

    const supabase = getServiceSupabase()

    // 세션 upsert
    await supabase.from('chat_sessions').upsert(
      { session_token: sessionId, last_message_at: new Date().toISOString() },
      { onConflict: 'session_token' }
    )

    // 최근 유저 메시지 저장
    const lastUserMsg = messages[messages.length - 1]
    if (lastUserMsg?.role === 'user') {
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('session_token', sessionId)
        .single()

      if (session) {
        await supabase.from('chat_messages').insert({
          session_id: session.id,
          role: 'user',
          content: lastUserMsg.content,
        })
      }
    }

    // Claude API 호출 (tool use 포함)
    const anthropicMessages = messages.map((m: ChatMessage) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    let response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages: anthropicMessages,
    })

    // Tool use 루프 처리
    let finalText = ''
    const toolResults: Array<{ type: string; name: string; data: unknown }> = []

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b) => b.type === 'tool_use'
      ) as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>
      const textBlocks = response.content.filter(
        (b) => b.type === 'text'
      ) as Array<{ type: 'text'; text: string }>

      if (textBlocks.length > 0) {
        finalText += textBlocks.map(b => b.text).join('')
      }

      const toolResultMessages: Array<{
        type: 'tool_result'
        tool_use_id: string
        content: string
      }> = []

      for (const toolUse of toolUseBlocks) {
        let result: string

        if (toolUse.name === 'submit_order') {
          // 주문 생성
          const input = toolUse.input
          const { data: session } = await supabase
            .from('chat_sessions')
            .select('id')
            .eq('session_token', sessionId)
            .single()

          const orderId = uuidv4()
          const colorCount = input.color_count as number
          const quantity = input.quantity as number
          const totalPrice = 10000 * quantity

          await supabase.from('team_cap_orders').insert({
            id: orderId,
            session_id: session?.id,
            customer_name: input.customer_name as string,
            customer_phone: input.customer_phone as string,
            customer_email: (input.customer_email as string) || null,
            color_count: colorCount,
            quantity,
            total_price: totalPrice,
            design_memo: (input.design_memo as string) || null,
            status: 'submitted',
          })

          // 디자인 파일 목록 조회
          const { data: files } = await supabase
            .from('design_uploads')
            .select('file_path')
            .eq('session_id', session?.id)

          const fileUrls = files?.map(f => {
            const { data } = supabase.storage.from('designs').getPublicUrl(f.file_path)
            return data.publicUrl
          }) || []

          // 이메일 알림 발송
          await sendOrderNotification({
            orderId,
            customerName: input.customer_name as string,
            customerPhone: input.customer_phone as string,
            customerEmail: input.customer_email as string,
            colorCount,
            quantity,
            totalPrice,
            designMemo: input.design_memo as string,
            designFiles: fileUrls,
          })

          result = JSON.stringify({
            success: true,
            orderId: orderId.slice(0, 8),
            message: '주문이 성공적으로 접수되었습니다.',
          })

          toolResults.push({ type: 'order', name: 'submit_order', data: { orderId, totalPrice } })
        } else {
          result = handleToolCall(toolUse.name, toolUse.input)
          toolResults.push({ type: 'quote', name: toolUse.name, data: JSON.parse(result) })
        }

        toolResultMessages.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        })
      }

      // 도구 결과와 함께 다시 호출
      response = await getAnthropic().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: [
          ...anthropicMessages,
          { role: 'assistant', content: response.content },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { role: 'user', content: toolResultMessages as any },
        ],
      })
    }

    // 최종 텍스트 추출
    const lastTextBlocks = response.content.filter(
      (b) => b.type === 'text'
    ) as Array<{ type: 'text'; text: string }>
    finalText += lastTextBlocks.map(b => b.text).join('')

    // 어시스턴트 응답 저장
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('session_token', sessionId)
      .single()

    if (session) {
      await supabase.from('chat_messages').insert({
        session_id: session.id,
        role: 'assistant',
        content: finalText,
        metadata: toolResults.length > 0 ? { toolResults } : {},
      })
    }

    return Response.json({
      message: finalText,
      toolResults,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return Response.json(
      { error: '죄송합니다. 일시적인 오류가 발생했습니다. 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}
