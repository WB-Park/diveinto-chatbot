import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || 'placeholder')
}

interface OrderNotification {
  orderId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  colorCount: number
  quantity: number
  totalPrice: number
  designMemo?: string
  designFiles?: string[]
}

export async function sendOrderNotification(order: OrderNotification) {
  const ownerEmail = process.env.OWNER_EMAIL || 'parkwoobeom@gmail.com'

  const fileLinks = order.designFiles?.length
    ? order.designFiles.map((f, i) => `<a href="${f}" style="color:#0099ff;">디자인 파일 ${i + 1}</a>`).join('<br/>')
    : '(업로드된 파일 없음)'

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#0099ff,#00ccff);padding:20px 24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:20px;">🏊 새 단체수모 주문 접수!</h1>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;width:120px;">주문번호</td><td style="padding:8px 0;font-weight:600;">${order.orderId.slice(0, 8)}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">고객명</td><td style="padding:8px 0;font-weight:600;">${order.customerName}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">연락처</td><td style="padding:8px 0;">${order.customerPhone}</td></tr>
          ${order.customerEmail ? `<tr><td style="padding:8px 0;color:#666;">이메일</td><td style="padding:8px 0;">${order.customerEmail}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#666;">색상 수</td><td style="padding:8px 0;">${order.colorCount}색</td></tr>
          <tr><td style="padding:8px 0;color:#666;">수량</td><td style="padding:8px 0;">${order.quantity}개</td></tr>
          <tr><td style="padding:8px 0;color:#666;font-weight:600;">총 금액</td><td style="padding:8px 0;font-size:18px;color:#0099ff;font-weight:700;">${new Intl.NumberFormat('ko-KR').format(order.totalPrice)}원</td></tr>
        </table>
        ${order.designMemo ? `<div style="margin-top:16px;padding:12px;background:#f8f9fa;border-radius:8px;"><strong>고객 메모:</strong><br/>${order.designMemo}</div>` : ''}
        <div style="margin-top:16px;"><strong>디자인 파일:</strong><br/>${fileLinks}</div>
      </div>
    </div>
  `

  try {
    const resend = getResend()
    await resend.emails.send({
      from: 'DiveInto Bot <onboarding@resend.dev>',
      to: ownerEmail,
      subject: `[다이브인투] 단체수모 주문 - ${order.customerName} (${order.quantity}개)`,
      html,
    })
    return { success: true }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error }
  }
}
