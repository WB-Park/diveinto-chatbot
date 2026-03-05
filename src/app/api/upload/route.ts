import { NextRequest } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const sessionId = formData.get('sessionId') as string

    if (!file || !sessionId) {
      return Response.json({ error: '파일과 세션 ID가 필요합니다.' }, { status: 400 })
    }

    // 파일 타입 검증
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return Response.json({ error: 'JPG, PNG, GIF, WebP, PDF 파일만 업로드 가능합니다.' }, { status: 400 })
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: '파일 크기는 10MB 이하여야 합니다.' }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const fileId = uuidv4()
    const ext = file.name.split('.').pop() || 'jpg'
    const filePath = `${sessionId}/${fileId}.${ext}`

    // Supabase Storage에 업로드
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('designs')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return Response.json({ error: '파일 업로드에 실패했습니다.' }, { status: 500 })
    }

    // DB에 파일 정보 저장
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('session_token', sessionId)
      .single()

    if (session) {
      await supabase.from('design_uploads').insert({
        session_id: session.id,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      })
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('designs')
      .getPublicUrl(filePath)

    return Response.json({
      success: true,
      fileName: file.name,
      fileUrl: urlData.publicUrl,
      filePath,
    })
  } catch (error) {
    console.error('Upload API error:', error)
    return Response.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
