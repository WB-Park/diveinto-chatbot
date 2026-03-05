import { NextRequest } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import * as cheerio from 'cheerio'

export const maxDuration = 300 // 5분 타임아웃

const BASE = 'https://diveinto.kr'
const CATEGORIES = [
  { name: 'Swimwear', cate_no: 24, type: '수영복' },
  { name: 'Swimming cap', cate_no: 42, type: '수영모자' },
  { name: 'ACC', cate_no: 43, type: '악세서리' },
  { name: '타임세일', cate_no: 52, type: '타임세일' },
]

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchHTML(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    }
  })
  return await res.text()
}

async function getProductUrls(): Promise<Map<string, string>> {
  const allUrls = new Map<string, string>()

  for (const cat of CATEGORIES) {
    for (let page = 1; page <= 10; page++) {
      const url = `${BASE}/product/list.html?cate_no=${cat.cate_no}&page=${page}`
      const html = await fetchHTML(url)
      const $ = cheerio.load(html)

      let found = 0
      $('a[href*="/product/"]').each((_, el) => {
        const href = $(el).attr('href')
        const match = href?.match(/\/product\/([^/]+)\/(\d+)/)
        if (match) {
          const productUrl = `${BASE}/product/${match[1]}/${match[2]}`
          if (!allUrls.has(productUrl)) {
            allUrls.set(productUrl, cat.type)
            found++
          }
        }
      })

      if (found === 0) break
      await delay(300)
    }
  }
  return allUrls
}

interface ProductData {
  name: string
  description: string
  category: string
  price: number
  original_url: string
  image_urls: string[]
  thumbnail_url: string
  detail_image_urls: string[]
  detail_text: string
  size_info: string
  color_options: string[]
  size_options: string[]
  metadata: Record<string, unknown>
}

async function crawlProductDetail(url: string, category: string): Promise<ProductData> {
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)

  // 상품명
  const name = $('meta[property="og:title"]').attr('content')?.trim()
    || $('h2.name, .headingArea h2, .xans-product-detail h3').first().text().trim()
    || ''

  // 가격
  let price = 0
  const priceText = $('meta[property="product:price:amount"]').attr('content')
    || $('.price .sale_price, #span_product_price_text').first().text().trim()
  if (priceText) price = parseInt(priceText.replace(/[^\d]/g, '')) || 0

  // 할인가
  let salePrice = 0
  const salePriceText = $('meta[property="product:sale_price:amount"]').attr('content')
    || $('#span_product_price_sale').text().trim()
  if (salePriceText) salePrice = parseInt(salePriceText.replace(/[^\d]/g, '')) || 0

  // OG 설명
  const ogDesc = $('meta[property="og:description"]').attr('content')?.trim() || ''

  // 대표 이미지 (썸네일)
  const thumbnailUrl = $('meta[property="og:image"]').attr('content')?.trim()
    || $('.keyImg img, .xans-product-image img').first().attr('src') || ''

  // 상세 이미지
  const imageSet = new Set<string>()
  const detailSelectors = ['.detail_cont img', '.prd_detail img', '#prd_detail img',
    '.xans-product-detail img', '.cont img', '.description img']
  for (const selector of detailSelectors) {
    $(selector).each((_, el) => {
      let src = $(el).attr('src') || $(el).attr('ec-data-src') || $(el).attr('data-src')
      if (src) {
        if (src.startsWith('//')) src = 'https:' + src
        else if (src.startsWith('/')) src = BASE + src
        else if (!src.startsWith('http')) src = BASE + '/' + src
        if (!src.includes('btn_') && !src.includes('icon_') && !src.includes('ico_')
          && !src.includes('blank.gif') && !src.includes('spacer')) {
          imageSet.add(src)
        }
      }
    })
  }

  // 상품 이미지 (슬라이드)
  const productImages: string[] = []
  const ogImage = $('meta[property="og:image"]').attr('content')
  if (ogImage) productImages.push(ogImage)
  $('.xans-product-image img, .keyImg img, .prdImg img').each((_, el) => {
    let src = $(el).attr('src') || $(el).attr('ec-data-src')
    if (src) {
      if (src.startsWith('//')) src = 'https:' + src
      else if (src.startsWith('/')) src = BASE + src
      productImages.push(src)
    }
  })

  // 상세 텍스트 전체
  let detailText = ''
  const textSelectors = ['.detail .cont', '.prd_detail_basic', '#prd_detail',
    '.xans-product-detail', '.cont', '.description']
  for (const selector of textSelectors) {
    const detailHtml = $(selector).html()
    if (detailHtml && detailHtml.length > 50) {
      const detailDoc = cheerio.load(detailHtml)
      detailText = detailDoc.text().replace(/\s+/g, ' ').trim()
      if (detailText.length > 100) break
    }
  }

  // 사이즈 정보
  let sizeInfo = ''
  const sizeKeywords = ['사이즈', 'SIZE', 'size', '치수', '실측', 'cm', 'CM']
  $('table').each((_, table) => {
    const tableText = $(table).text()
    if (sizeKeywords.some(kw => tableText.includes(kw))) {
      const rows: string[] = []
      $(table).find('tr').each((_, tr) => {
        const cells: string[] = []
        $(tr).find('th, td').each((_, cell) => { cells.push($(cell).text().trim()) })
        if (cells.length > 0) rows.push(cells.join(' | '))
      })
      if (rows.length > 0) sizeInfo += rows.join('\n') + '\n'
    }
  })
  if (!sizeInfo && detailText) {
    const sizeMatch = detailText.match(/(사이즈|SIZE|size|치수).{0,500}/i)
    if (sizeMatch) sizeInfo = sizeMatch[0]
  }

  // 스펙 테이블
  const specs: Record<string, string> = {}
  $('table.xans-product-addinfo tr, .product_info tr, .xans-product-additional tr').each((_, el) => {
    const key = $(el).find('th, td:first-child').text().trim()
    const val = $(el).find('td:last-child, td:nth-child(2)').text().trim()
    if (key && val && key !== val) specs[key] = val
  })

  // 컬러 옵션
  const colors: string[] = []
  $('select[id*=option] option, select[name*=option] option').each((_, el) => {
    const text = $(el).text().trim()
    if (text && !text.includes('선택') && !text.includes('---') && text !== '*' && !text.startsWith('-')) {
      const cleanText = text.replace(/\s*\(.*\)\s*$/, '').trim()
      if (cleanText && !colors.includes(cleanText)) colors.push(cleanText)
    }
  })

  // 사이즈 옵션
  const sizes: string[] = []
  $('select option').each((_, el) => {
    const text = $(el).text().trim()
    if (text.match(/^(XS|S|M|L|XL|XXL|2XL|3XL|FREE|프리|\d{2,3})/i)) {
      const cleanText = text.replace(/\s*\(.*\)\s*$/, '').trim()
      if (cleanText && !sizes.includes(cleanText)) sizes.push(cleanText)
    }
  })

  // 소재
  let material = ''
  for (const [key, val] of Object.entries(specs)) {
    if (['소재', '재질', 'Material', '원단'].some(mk => key.includes(mk))) {
      material = val
      break
    }
  }

  // 검색용 설명 구성
  const description = [
    name, ogDesc,
    detailText.slice(0, 3000),
    colors.length > 0 ? `컬러: ${colors.join(', ')}` : '',
    sizes.length > 0 ? `사이즈: ${sizes.join(', ')}` : '',
    sizeInfo ? `사이즈 정보: ${sizeInfo}` : '',
    material ? `소재: ${material}` : '',
    category ? `카테고리: ${category}` : '',
    price > 0 ? `가격: ${price.toLocaleString()}원` : '',
    salePrice > 0 ? `할인가: ${salePrice.toLocaleString()}원` : '',
    Object.keys(specs).length > 0 ? `상품정보: ${Object.entries(specs).map(([k,v]) => `${k}: ${v}`).join(', ')}` : '',
  ].filter(Boolean).join('\n')

  return {
    name,
    description,
    category,
    price: salePrice > 0 ? salePrice : price,
    original_url: url,
    image_urls: [...new Set(productImages)].slice(0, 10),
    thumbnail_url: thumbnailUrl,
    detail_image_urls: [...imageSet].slice(0, 20),
    detail_text: detailText.slice(0, 5000),
    size_info: sizeInfo.slice(0, 2000),
    color_options: [...new Set(colors)],
    size_options: [...new Set(sizes)],
    metadata: { og_description: ogDesc, specs, material, sale_price: salePrice, original_price: price },
  }
}

export async function POST(req: NextRequest) {
  // 관리자 인증
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  const adminKey = process.env.CRAWL_ADMIN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-10)
  if (!adminKey || secret !== adminKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceSupabase()
  const logs: string[] = []
  const log = (msg: string) => { logs.push(msg); console.log(msg) }

  try {
    log('🏊 크롤링 시작')

    // 1. 상품 URL 수집
    const urlMap = await getProductUrls()
    log(`✅ ${urlMap.size}개 상품 URL 수집`)

    // 2. 상세 크롤링
    const products: ProductData[] = []
    let count = 0
    for (const [url, category] of urlMap) {
      count++
      try {
        const product = await crawlProductDetail(url, category)
        if (product.name) {
          products.push(product)
          log(`[${count}/${urlMap.size}] ✅ ${product.name} | ${product.detail_image_urls.length}이미지 | ${product.detail_text?.length || 0}자`)
        }
      } catch (e) {
        log(`[${count}/${urlMap.size}] ❌ ${(e as Error).message}`)
      }
      await delay(500)
    }

    // 3. DB 저장
    log(`💾 ${products.length}개 상품 저장 중...`)
    await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    let saved = 0
    for (let i = 0; i < products.length; i += 5) {
      const batch = products.slice(i, i + 5)
      const { error } = await supabase.from('products').insert(batch)
      if (error) {
        for (const product of batch) {
          const { error: singleError } = await supabase.from('products').insert(product)
          if (!singleError) saved++
          else log(`  ❌ ${product.name}: ${singleError.message}`)
        }
      } else {
        saved += batch.length
      }
    }

    log(`🎉 완료! ${saved}/${products.length}개 저장`)

    return Response.json({
      success: true,
      total_urls: urlMap.size,
      crawled: products.length,
      saved,
      logs,
      sample: products.slice(0, 2).map(p => ({
        name: p.name,
        price: p.price,
        category: p.category,
        colors: p.color_options,
        sizes: p.size_options,
        detail_text_length: p.detail_text?.length,
        detail_images: p.detail_image_urls?.length,
        size_info_length: p.size_info?.length,
      })),
    })
  } catch (error) {
    log(`❌ 크롤링 에러: ${(error as Error).message}`)
    return Response.json({ error: (error as Error).message, logs }, { status: 500 })
  }
}
