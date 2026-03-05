import { NextRequest } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export const maxDuration = 60

// 상품 데이터 확인용 엔드포인트
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-10)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceSupabase()

  const { data: products, error, count } = await supabase
    .from('products')
    .select('id, name, category, price, color_options, size_options, thumbnail_url, original_url', { count: 'exact' })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    total: count,
    products: products?.map(p => ({
      name: p.name,
      category: p.category,
      price: p.price,
      colors: p.color_options,
      sizes: p.size_options,
      has_thumbnail: !!p.thumbnail_url,
      url: p.original_url,
    })),
  })
}
