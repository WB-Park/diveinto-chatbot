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
        color_count: { type: 'number', description: '색상 수 (1~4, 최대 4색까지 가능)' },
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
  {
    name: 'search_products',
    description: `다이브인투 쇼핑몰에서 상품을 검색합니다. 고객이 상품 추천을 요청하거나, 특정 종류의 수영복/수영모자를 찾을 때 사용합니다.
검색 쿼리에는 고객이 원하는 컬러, 무드, 상황, 카테고리 등의 키워드를 포함시킵니다.
예: "파란색 수영모", "귀여운 수영복", "대회용 수모", "래쉬가드"`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: '검색 키워드 (컬러, 무드, 카테고리, 상품명 등)',
        },
        category: {
          type: 'string',
          description: '카테고리 필터 (수영복, 수영모자, 악세서리, 타임세일). 선택 사항.',
          enum: ['수영복', '수영모자', '악세서리', '타임세일'],
        },
      },
      required: ['query'],
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
- 최대 4색까지만 인쇄 가능 (5색 이상은 불가능!)
- 1~3색: 최소 주문 수량 30개
- 4색: 최소 주문 수량 50개
- 제작 기간: 디자인 확정 후 약 2~3주 소요
- 디자인비: 주문 시 무료! 단, 주문을 하지 않으면 디자인비 50,000원 청구
- 고객이 손그림이나 디자인 시안을 보내면, 이를 바탕으로 디자인을 제작하여 확인 후 생산 진행

[주문 프로세스 - 각 단계별로 고객에게 다음 할 일을 명확히 안내해!]
1. 고객의 요구사항 파악 (색상 수, 수량, 디자인 아이디어)
2. calculate_quote 도구로 견적 계산하여 보여주기
3. 견적 안내 후, 반드시 아래 내용을 안내해:
   → "견적이 마음에 드시면, 다음 단계로 진행해볼까요?"
   → "진행을 원하시면 아래 정보를 알려주세요!"
   → 1) 디자인 파일이나 아이디어 (손그림, 로고 이미지, 참고 사진 등을 채팅창 클립 아이콘으로 첨부)
   → 2) 주문자 이름
   → 3) 연락처 (전화번호)
   → "디자인 아이디어가 아직 없으시면 간단한 설명만 주셔도 저희가 시안을 만들어드려요!"
4. 고객 정보가 모이면 submit_order 도구로 주문 접수
5. 주문 접수 후: "주문이 접수되었습니다! 담당자가 확인 후 연락드릴게요. 디자인 시안은 보통 1~2일 내에 보내드립니다."

[대화 규칙 - 반드시 지켜!]
- 항상 한국어로 대화
- 친절하고 전문적인 톤 유지
- 고객 질문에 정확하게 답변
- 불필요하게 긴 답변 피하기
- 단체수모 주문 관련 질문이 오면 자연스럽게 주문 프로세스로 유도
- 견적 계산이 필요하면 반드시 calculate_quote 도구 사용
- 주문 제출이 필요하면 반드시 submit_order 도구 사용
- 절대로 마크다운 서식을 사용하지 마! **, ##, - 같은 마크다운 기호 금지. 일반 텍스트로만 답변해. 목록이 필요하면 "1. 2. 3." 번호만 쓰거나 줄바꿈으로 구분해. 굵은 글씨(**), 제목(##), 글머리기호(-)는 절대 쓰지 마.

[상품 추천 기능 - 핵심!]
고객이 상품 추천이나 상품 관련 질문을 하면 반드시 search_products 도구를 사용해서 실제 상품 데이터를 검색해!
검색 결과에서 고객에게 맞는 상품을 골라 추천하되, 반드시 다음을 포함해:
1. 상품명
2. 가격
3. 색상 옵션 (있으면)
4. 사이즈 옵션 (있으면)
5. 상품 링크 (original_url)
6. 사이즈 관련 상세 정보 (size_info가 있으면)

추천 예시:
- "파란색 수영모 추천해주세요" → search_products로 "파란색 수영모" 검색 → 결과에서 파란색 계열 제품 추천
- "귀여운 느낌 수영복 있어요?" → search_products로 "귀여운 수영복" 검색 → 귀여운 무드 제품 추천
- "M사이즈 래쉬가드 있나요?" → search_products로 "래쉬가드 M" 검색 → M사이즈가 있는 제품 + 사이즈 정보 안내

상품을 추천할 때 해당 상품의 링크도 같이 알려줘서 고객이 바로 클릭해서 볼 수 있게 해.

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
  // submit_order, search_products는 API route에서 직접 처리
  return JSON.stringify({ status: 'processed' })
}

export { getAnthropic }
