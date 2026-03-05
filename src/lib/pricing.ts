export interface QuoteInput {
  colorCount: number
  quantity: number
}

export interface QuoteResult {
  valid: boolean
  colorCount: number
  quantity: number
  minQuantity: number
  unitPrice: number
  totalPrice: number
  productionDays: string
  designFeeNote: string
  errorMessage?: string
}

export function calculateQuote(input: QuoteInput): QuoteResult {
  const { colorCount, quantity } = input
  const unitPrice = 10000
  const minQuantity = colorCount >= 4 ? 50 : 30
  const productionDays = '2~3주'
  const designFeeNote = '디자인비는 주문 시 무료, 주문 미진행 시 50,000원'

  if (colorCount < 1 || colorCount > 4) {
    return {
      valid: false, colorCount, quantity, minQuantity, unitPrice,
      totalPrice: 0, productionDays, designFeeNote,
      errorMessage: '색상 수는 1~4색까지만 가능합니다. (최대 4색 인쇄)'
    }
  }

  if (quantity < minQuantity) {
    return {
      valid: false, colorCount, quantity, minQuantity, unitPrice,
      totalPrice: 0, productionDays, designFeeNote,
      errorMessage: `${colorCount >= 4 ? '4색 이상' : '1~3색'}의 경우 최소 주문 수량은 ${minQuantity}개입니다.`
    }
  }

  return {
    valid: true,
    colorCount,
    quantity,
    minQuantity,
    unitPrice,
    totalPrice: unitPrice * quantity,
    productionDays,
    designFeeNote,
  }
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('ko-KR').format(price) + '원'
}
