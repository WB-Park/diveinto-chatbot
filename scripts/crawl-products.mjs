import * as cheerio from 'cheerio'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://dzgoinqcdzzufgzsbkuq.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const CATEGORIES = [
  { name: 'Swimwear', cate_no: 24, type: '수영복' },
  { name: 'Swimming cap', cate_no: 42, type: '수영모자' },
  { name: 'ACC', cate_no: 43, type: '악세서리' },
  { name: '타임세일', cate_no: 52, type: '타임세일' },
]

const BASE = 'https://diveinto.kr'
const delay = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    }
  })
  return await res.text()
}

// Step 1: Get all product URLs from category pages
async function getProductUrls() {
  const allUrls = new Map() // url -> category

  for (const cat of CATEGORIES) {
    console.log(`📂 카테고리: ${cat.name} (cate_no=${cat.cate_no})`)

    for (let page = 1; page <= 10; page++) {
      const url = `${BASE}/product/list.html?cate_no=${cat.cate_no}&page=${page}`
      const html = await fetchHTML(url)
      const $ = cheerio.load(html)

      let found = 0
      $('a[href*="/product/"]').each((_, el) => {
        const href = $(el).attr('href')
        const match = href?.match(/\/product\/([^\/]+)\/(\d+)/)
        if (match) {
          const productUrl = `${BASE}/product/${match[1]}/${match[2]}`
          if (!allUrls.has(productUrl)) {
            allUrls.set(productUrl, cat.type)
            found++
          }
        }
      })

      console.log(`  페이지 ${page}: ${found}개 새 상품`)
      if (found === 0) break
      await delay(500)
    }
  }

  console.log(`\n✅ 총 ${allUrls.size}개 상품 URL 수집`)
  return allUrls
}

// Step 2: Crawl individual product detail pages - 강화 버전
async function crawlProductDetail(url, category) {
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)

  // === 상품명 ===
  const name = $('meta[property="og:title"]').attr('content')?.trim()
    || $('h2.name, .headingArea h2, .xans-product-detail h3').first().text().trim()
    || ''

  // === 가격 ===
  let price = 0
  const priceText = $('meta[property="product:price:amount"]').attr('content')
    || $('.price .sale_price, #span_product_price_text, .xans-product-detail .price').first().text().trim()
  if (priceText) {
    price = parseInt(priceText.replace(/[^\d]/g, '')) || 0
  }

  // === 할인가 ===
  let salePrice = 0
  const salePriceText = $('meta[property="product:sale_price:amount"]').attr('content')
    || $('#span_product_price_sale').text().trim()
  if (salePriceText) {
    salePrice = parseInt(salePriceText.replace(/[^\d]/g, '')) || 0
  }

  // === OG 설명 ===
  const ogDesc = $('meta[property="og:description"]').attr('content')?.trim() || ''

  // === 대표 이미지 (썸네일) ===
  const thumbnailUrl = $('meta[property="og:image"]').attr('content')?.trim()
    || $('.keyImg img, .xans-product-image img, .thumbnail img').first().attr('src')
    || ''

  // === 상품 상세 이미지 (상세페이지 안의 모든 이미지) ===
  const detailImageUrls = []

  // 여러 셀렉터로 상세 이미지 수집
  const imageSelectors = [
    '.detail_cont img',
    '.prd_detail img',
    '#prd_detail img',
    '.xans-product-detail img',
    '.cont img',
    '.description img',
    '.product-detail img',
  ]

  const imageSet = new Set()
  for (const selector of imageSelectors) {
    $(selector).each((_, el) => {
      let src = $(el).attr('src') || $(el).attr('ec-data-src') || $(el).attr('data-src')
      if (src) {
        if (src.startsWith('//')) src = 'https:' + src
        else if (src.startsWith('/')) src = BASE + src
        else if (!src.startsWith('http')) src = BASE + '/' + src

        // 버튼/아이콘 제외, 실제 상품 이미지만
        if (!src.includes('btn_') && !src.includes('icon_') && !src.includes('ico_')
            && !src.includes('blank.gif') && !src.includes('spacer')) {
          imageSet.add(src)
        }
      }
    })
  }
  detailImageUrls.push(...imageSet)

  // === 리스트 이미지 (상품 슬라이드 이미지들) ===
  const productImages = []
  const ogImage = $('meta[property="og:image"]').attr('content')
  if (ogImage) productImages.push(ogImage)

  // 추가 상품 이미지 (슬라이드)
  $('.xans-product-image img, .keyImg img, .thumbnail img, .prdImg img').each((_, el) => {
    let src = $(el).attr('src') || $(el).attr('ec-data-src')
    if (src) {
      if (src.startsWith('//')) src = 'https:' + src
      else if (src.startsWith('/')) src = BASE + src
      productImages.push(src)
    }
  })

  // === 상세 페이지 전체 텍스트 (사이즈 정보 포함) ===
  let detailText = ''
  const detailSelectors = [
    '.detail .cont',
    '.prd_detail_basic',
    '#prd_detail',
    '.xans-product-detail',
    '.cont',
    '.description',
  ]

  for (const selector of detailSelectors) {
    const detailHtml = $(selector).html()
    if (detailHtml && detailHtml.length > 50) {
      const detailDoc = cheerio.load(detailHtml)
      detailText = detailDoc.text().replace(/\s+/g, ' ').trim()
      if (detailText.length > 100) break // 유의미한 텍스트를 찾으면 중단
    }
  }

  // === 사이즈 정보 추출 (사이즈표, 치수 등) ===
  let sizeInfo = ''

  // 사이즈 관련 텍스트 찾기
  const sizeKeywords = ['사이즈', 'SIZE', 'size', '치수', '실측', 'cm', 'CM']

  // 테이블에서 사이즈 정보 찾기
  $('table').each((_, table) => {
    const tableText = $(table).text()
    if (sizeKeywords.some(kw => tableText.includes(kw))) {
      const rows = []
      $(table).find('tr').each((_, tr) => {
        const cells = []
        $(tr).find('th, td').each((_, cell) => {
          cells.push($(cell).text().trim())
        })
        if (cells.length > 0) rows.push(cells.join(' | '))
      })
      if (rows.length > 0) {
        sizeInfo += rows.join('\n') + '\n'
      }
    }
  })

  // 상세 텍스트에서 사이즈 관련 부분 추출
  if (!sizeInfo && detailText) {
    const sizeMatch = detailText.match(/(사이즈|SIZE|size|치수).{0,500}/i)
    if (sizeMatch) {
      sizeInfo = sizeMatch[0]
    }
  }

  // === 상품 스펙 테이블 ===
  const specs = {}
  $('table.xans-product-addinfo tr, .product_info tr, .xans-product-additional tr').each((_, el) => {
    const key = $(el).find('th, td:first-child').text().trim()
    const val = $(el).find('td:last-child, td:nth-child(2)').text().trim()
    if (key && val && key !== val) specs[key] = val
  })

  // === 컬러 옵션 ===
  const colors = []
  $('select[id*=option] option, .ec-product-color option, select[name*=option] option').each((_, el) => {
    const text = $(el).text().trim()
    if (text && !text.includes('선택') && !text.includes('---') && text !== '*' && !text.startsWith('-')) {
      // 컬러 관련 옵션만 (가격 차이 등 제거)
      const cleanText = text.replace(/\s*\(.*\)\s*$/, '').trim()
      if (cleanText && !colors.includes(cleanText)) {
        colors.push(cleanText)
      }
    }
  })

  // === 사이즈 옵션 ===
  const sizes = []
  $('select option').each((_, el) => {
    const text = $(el).text().trim()
    if (text.match(/^(XS|S|M|L|XL|XXL|2XL|3XL|FREE|프리|\d{2,3})/i)) {
      const cleanText = text.replace(/\s*\(.*\)\s*$/, '').trim()
      if (cleanText && !sizes.includes(cleanText)) {
        sizes.push(cleanText)
      }
    }
  })

  // === 소재 정보 ===
  let material = ''
  const materialKeys = ['소재', '재질', 'Material', 'MATERIAL', '원단']
  for (const [key, val] of Object.entries(specs)) {
    if (materialKeys.some(mk => key.includes(mk))) {
      material = val
      break
    }
  }

  // 상세 텍스트에서도 소재 찾기
  if (!material && detailText) {
    const matMatch = detailText.match(/(소재|재질|원단)\s*[:：]?\s*([^\n.]{2,50})/i)
    if (matMatch) material = matMatch[2].trim()
  }

  // === 검색용 풍부한 설명 텍스트 구성 ===
  const description = [
    name,
    ogDesc,
    detailText.slice(0, 3000), // 상세 텍스트 더 많이 포함
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
    detail_image_urls: [...detailImageUrls].slice(0, 20),
    detail_text: detailText.slice(0, 5000), // 상세 텍스트 전체 (최대 5000자)
    size_info: sizeInfo.slice(0, 2000),
    color_options: [...new Set(colors)],
    size_options: [...new Set(sizes)],
    metadata: {
      og_description: ogDesc,
      specs,
      material,
      sale_price: salePrice,
      original_price: price,
    },
  }
}

// Step 3: Save to Supabase
async function saveProducts(products) {
  console.log(`\n💾 ${products.length}개 상품 DB 저장 중...`)

  // Clear existing products
  await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Insert in batches of 5 (larger data per row now)
  for (let i = 0; i < products.length; i += 5) {
    const batch = products.slice(i, i + 5)
    const { error } = await supabase.from('products').insert(batch)
    if (error) {
      console.error(`  ❌ 배치 ${i}: ${error.message}`)
      // 개별 삽입 시도
      for (const product of batch) {
        const { error: singleError } = await supabase.from('products').insert(product)
        if (singleError) {
          console.error(`    ❌ ${product.name}: ${singleError.message}`)
        } else {
          console.log(`    ✅ ${product.name} 개별 저장 성공`)
        }
      }
    } else {
      console.log(`  ✅ 배치 ${i + 1}~${Math.min(i + 5, products.length)} 저장 완료`)
    }
  }
}

// Main
async function main() {
  console.log('🏊 다이브인투 상품 크롤링 시작 (강화 버전)\n')

  const urlMap = await getProductUrls()
  const products = []
  let count = 0

  for (const [url, category] of urlMap) {
    count++
    console.log(`[${count}/${urlMap.size}] ${url}`)
    try {
      const product = await crawlProductDetail(url, category)
      if (product.name) {
        products.push(product)
        const imgCount = product.detail_image_urls.length
        const textLen = product.detail_text?.length || 0
        const colorCount = product.color_options?.length || 0
        const sizeCount = product.size_options?.length || 0
        console.log(`  ✅ ${product.name} | ${product.price?.toLocaleString()}원 | 상세이미지 ${imgCount}장 | 텍스트 ${textLen}자 | 컬러 ${colorCount} | 사이즈 ${sizeCount}`)
      } else {
        console.log(`  ⚠️ 이름 추출 실패`)
      }
    } catch (e) {
      console.error(`  ❌ 에러: ${e.message}`)
    }
    await delay(800)
  }

  console.log(`\n📊 수집 결과: ${products.length}개 상품`)
  console.log(`  - 상세 텍스트 포함: ${products.filter(p => p.detail_text?.length > 100).length}개`)
  console.log(`  - 상세 이미지 포함: ${products.filter(p => p.detail_image_urls?.length > 0).length}개`)
  console.log(`  - 사이즈 정보 포함: ${products.filter(p => p.size_info?.length > 0).length}개`)
  console.log(`  - 컬러 옵션 포함: ${products.filter(p => p.color_options?.length > 0).length}개`)

  if (products.length > 0) {
    await saveProducts(products)
  }

  console.log('\n🎉 크롤링 완료!')
}

main().catch(console.error)
