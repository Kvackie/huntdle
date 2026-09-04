/**
 * Shared helpers for talking to the Hunt: Showdown 1896 wiki's MediaWiki API.
 * Used by scrape-wiki.mjs (weapons) and scrape-hunters.mjs (hunters).
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import path from 'node:path'

export const API = 'https://huntshowdown.wiki.gg/api.php'
const UA = 'huntdle-dataset-builder/1.0 (personal fan project)'

export async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json()
}

/** Chunk an array into slices of `size`. */
export const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

/** Every ns-0 page in a category, following continuations. */
export async function categoryMembers(category, keep = () => true) {
  const titles = []
  let cmcontinue
  do {
    const data = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: category,
      cmlimit: '500',
      ...(cmcontinue ? { cmcontinue } : {}),
    })
    for (const m of data.query.categorymembers) {
      if (m.ns === 0 && keep(m.title)) titles.push(m.title)
    }
    cmcontinue = data.continue?.cmcontinue
  } while (cmcontinue)
  return titles
}

/** Raw wikitext for many pages, batched at the API's 50-title limit. */
export async function fetchWikitext(titles) {
  const pages = new Map()
  for (const batch of chunk(titles, 50)) {
    const data = await api({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: batch.join('|'),
    })
    for (const page of data.query.pages) {
      const text = page.revisions?.[0]?.slots?.main?.content
      if (text) pages.set(page.title, text)
      else console.warn(`  ! no content for ${page.title}`)
    }
  }
  return pages
}

/**
 * Pull a `{{Template | Key=Value | ... }}` block out of wikitext and split it into
 * fields. `pattern` must match the opening tag; use a lookahead so a longer template
 * name can't match a shorter one ("{{Infobox Weapon" also starts "{{Infobox Weapon Skin").
 */
export function parseTemplate(wikitext, pattern) {
  const match = wikitext.match(pattern)
  if (!match) return null
  const start = match.index
  const tag = match[0]

  // Walk forward counting brace depth so nested templates don't end the block early.
  let depth = 0
  let end = start
  for (let i = start; i < wikitext.length - 1; i++) {
    if (wikitext.startsWith('{{', i)) { depth++; i++ }
    else if (wikitext.startsWith('}}', i)) {
      depth--; i++
      if (depth === 0) { end = i + 1; break }
    }
  }

  const body = wikitext.slice(start + tag.length, end - 2)
  const parts = []
  let buf = ''
  let d = 0
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2)
    if (two === '{{' || two === '[[') { d++; buf += two; i++; continue }
    if (two === '}}' || two === ']]') { d--; buf += two; i++; continue }
    if (body[i] === '|' && d === 0) { parts.push(buf); buf = ''; continue }
    buf += body[i]
  }
  parts.push(buf)

  const fields = {}
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    if (key) fields[key] = part.slice(eq + 1).trim()
  }
  return { tag, fields }
}

/** Wikitext down to plain prose: templates unwrapped, links flattened, markup dropped. */
export function stripWikitext(text) {
  if (!text) return ''
  let out = text
  // Unwrap nested templates innermost-first, keeping the display text.
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/\{\{[^{}]*?\|(?:[^{}|]*\|)*?(?:text=)?([^{}|=]*)\}\}/g, '$1')
    if (next === out) break
    out = next
  }
  return out
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Resolve `File:...` titles to their upload URLs. */
export async function resolveFileUrls(fileNames) {
  const titles = [...new Set(fileNames.map((n) => `File:${n.replace(/_/g, ' ')}`))]
  const urls = new Map()
  for (const batch of chunk(titles, 50)) {
    const data = await api({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url',
      titles: batch.join('|'),
    })
    for (const page of data.query.pages) {
      const url = page.imageinfo?.[0]?.url
      if (url) urls.set(page.title, url)
    }
  }
  return { urls, key: (name) => `File:${name.replace(/_/g, ' ')}` }
}

/** Download one file into `dir` as `fileName`. Returns false if the fetch failed. */
export async function download(url, dir, fileName) {
  await mkdir(dir, { recursive: true })
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) {
    console.warn(`  ! ${res.status} downloading ${url}`)
    return false
  }
  await writeFile(path.join(dir, fileName), Buffer.from(await res.arrayBuffer()))
  return true
}

export const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Stable but opaque file name for art used in a guessing round. `krampus.png` in a
 * network log or a saved file gives the answer away on its own, so the asset is named
 * by a hash instead. Deterministic, so re-running a scrape doesn't churn every file.
 */
export const obfuscate = (key) =>
  createHash('sha1').update(`huntdle:${key}`).digest('hex').slice(0, 20)
