import pdfParse from 'pdf-parse'
import * as cheerio from 'cheerio'
import mammoth from 'mammoth'

export type MaterialType = 'pdf' | 'word' | 'text' | 'url'

export interface ParsedMaterial {
  type: MaterialType
  source: string       // 文件名或 URL
  text: string         // 提取的纯文本
  charCount: number
}

/**
 * 解析 PDF 文件为纯文本
 */
export async function parsePdf(buffer: Buffer, source: string): Promise<ParsedMaterial> {
  const data = await pdfParse(buffer)
  const text = data.text.trim()
  return { type: 'pdf', source, text, charCount: text.length }
}

/**
 * 解析 Word 文档为纯文本
 */
export async function parseWord(buffer: Buffer, source: string): Promise<ParsedMaterial> {
  const result = await mammoth.extractRawText({ buffer })
  const text = result.value.trim()
  return { type: 'word', source, text, charCount: text.length }
}

/**
 * 抓取网页内容并提取纯文本
 */
export async function parseUrl(url: string): Promise<ParsedMaterial> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PodCastAI/1.0' },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // 移除脚本、样式、导航等非内容元素
    $('script, style, nav, header, footer, aside, iframe, noscript').remove()

    // 提取正文文本
    const text = $('body').text()
      .replace(/\s+/g, ' ')   // 合并空白
      .trim()

    return { type: 'url', source: url, text, charCount: text.length }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 纯文本直接包装
 */
export function parseText(text: string, source: string): ParsedMaterial {
  const trimmed = text.trim()
  return { type: 'text', source, text: trimmed, charCount: trimmed.length }
}

/**
 * 根据文件类型路由到对应解析器
 */
export async function parseMaterial(
  file: { buffer: Buffer; name: string; type: string } | { url: string } | { text: string }
): Promise<ParsedMaterial> {
  if ('url' in file) {
    return parseUrl(file.url)
  }

  if ('text' in file) {
    return parseText(file.text, 'direct-input')
  }

  const { buffer, name, type } = file

  if (type === 'application/pdf') {
    return parsePdf(buffer, name)
  }

  if (
    type === 'application/msword' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return parseWord(buffer, name)
  }

  if (type === 'text/plain') {
    return parseText(buffer.toString('utf-8'), name)
  }

  throw new Error(`Unsupported file type: ${type}`)
}
