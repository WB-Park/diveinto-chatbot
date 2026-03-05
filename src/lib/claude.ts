import Anthropic from '@anthropic-ai/sdk'
import { calculateQuote, formatPrice } from './pricing'

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
}

// Claude에게 제공할 도구 정의
export const tools: Anthropic.Tool[] = [
  {
    name: 'calculate_quote',
    description: '단체 수영모(수모) 견적을 계산합니다. 색상 수와 수량을 입력하면 견적을 반환합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        color_count: { type: 'number', description: '색상 수 (1~10)' },
        quantity: { type: 'number', description: '주문 수량' },
      },
      required: ['color_count', 'quantity'],
    },
  },
  {
    name: 'submit_order',
    description: '단체 수모 주문을 제출합니다. 고객 정보와 주문 상세를 입력합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name: { type: 'string', description: '고객 이름' },
        customer_phone: { type: 'string', description: '고객 연락처' },
        customer_email: { type: 'string', description: '고객 이메일 (선택)' },
        color_count: { type: 'number', description: '색상 수' },
        quantity: { type: 'number', description: '주문 수량' },
        design_memo: { type: 'string', description: '디자인 관련 메모나 요청사항' },
      },
      required: ['customer_name', 'customer_phone', 'color_count', 'quantity'],
    },
  },
]

export const SYSTEM_PROMPT = `너는 다이브인투(diveinto.kr) 수영 전문 쇼핑몰의 친절하고 전문적인 상담 챗봇이야.

[브랜드 소개]
다이브인투는 수영모자와 수영복을 전문으로 판매하는 쇼핑몰이야.
공식 사이트: diveinto.kr
입점 채널: 스마트스토어, 무신사, 29CM

[단체수모 주문제작 규칙 - 매우 중요!]
- 개당 가격: 10,000원 (색상 수 관계없이 동일)
- 1~3색: 최소 주문 수량 30개
- 4색 이상: 최소 주문 수량 50개
- 제작 기간: 디자인 확정 후 약 2~3주 소요
- 디자인비: 주문 시 무료! 단, 주문을 하지 않으면 디자인비 50,000원 청구
- 고객이 손그림이나 디자인 시안을 보내면, 이를 바탕으로 디자인을 제작하여 확인 후 생산 진행

[주문 프로세스]
1. 고객의 요구사항 파악 (색상 수, 수량, 디자인 아이디어)
2. calculate_quote 도구로 견적 계산하여 보여주기
3. 디자인 파일/아이디어 수집 (이미지 업로드 안내)
4. 고객 정보 수집 (이름, 연락처)
5. submit_order 도구로 주문 접수

[대화 규칙]
- 항상 한국어로 대화
- 친절하고 전문적인 톤 유지
- 고객 질문에 정확하게 답변
- 불필요하게 긴 답변 피하기
- 단체수모 주문 관련 질문이 오면 자연스럽게 주문 프로세스로 유도
- 견적 계산이 필요하면 반드시 calculate_quote 도구 사용
- 주문 제출이 필요하면 반드시 submit_order 도구 사용

[자주 묻는 질문 기본 답변]
- 배송: 일반 배송 2-3일 소요
- 반품/교환: 수령 후 7일 이내 가능, 단 맞춤제작 상품은 반품 불가
- 결제: 무통장입금, 카드결제 가능`

export function handleToolCall(toolName: string, toolInput: Record<string, unknown>): string {
  if (toolName === 'calculate_quote') {
    const result = calculateQuote({
      colorCount: toolInput.color_count as number,
      quantity: toolInput.quantity as number,
    })
    if (!result.valid) {
      return JSON.stringify({ error: result.errorMessage })
    }
    return JSON.stringify({
      colorCount: result.colorCount,
      quantity: result.quantity,
      unitPrice: formatPrice(result.unitPrice),
      totalPrice: formatPrice(result.totalPrice),
      minQuantity: result.minQuantity,
      productionDays: result.productionDays,
      designFeeNote: result.designFeeNote,
    })
  }
  // submit_order는 API route에서 직접 처리
  return JSON.stringify({ status: 'processed' })
}

export { getAnthropic }
