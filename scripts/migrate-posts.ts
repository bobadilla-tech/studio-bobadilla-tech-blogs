/**
 * Migration script: upload existing blog posts to Sanity.
 *
 * Run from the studio directory:
 *   npx sanity exec scripts/migrate-posts.ts --with-user-token
 *
 * The --with-user-token flag uses your Sanity login to authenticate writes.
 */

import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2024-01-01'})

// ── Helpers ────────────────────────────────────────────────────────────────

function paragraphsToBlocks(markdown: string) {
  // Converts plain markdown text to a minimal Portable Text structure.
  // For a full conversion, run the posts through the Studio editor instead.
  // This script handles the most common patterns: headings, paragraphs,
  // code fences, bold/inline code, and horizontal rules.
  const blocks: unknown[] = []
  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── Code fence ─────────────────────────────────────────────
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'text'
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({
        _type: 'code',
        _key: randomKey(),
        language: lang,
        code: codeLines.join('\n'),
      })
      i++ // skip closing ```
      continue
    }

    // ── Headings ───────────────────────────────────────────────
    const h2 = line.match(/^## (.+)/)
    if (h2) {
      blocks.push(textBlock(h2[1], 'h2'))
      i++
      continue
    }
    const h3 = line.match(/^### (.+)/)
    if (h3) {
      blocks.push(textBlock(h3[1], 'h3'))
      i++
      continue
    }
    const h4 = line.match(/^#### (.+)/)
    if (h4) {
      blocks.push(textBlock(h4[1], 'h4'))
      i++
      continue
    }

    // ── Horizontal rule ────────────────────────────────────────
    if (line.match(/^---+$/)) {
      i++
      continue
    }

    // ── Bullet list ────────────────────────────────────────────
    if (line.match(/^[-*] /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(lines[i].replace(/^[-*] /, ''))
        i++
      }
      for (const item of items) {
        blocks.push({
          _type: 'block',
          _key: randomKey(),
          style: 'normal',
          listItem: 'bullet',
          level: 1,
          children: inlineSpans(item),
          markDefs: [],
        })
      }
      continue
    }

    // ── Skip blank lines ───────────────────────────────────────
    if (line.trim() === '') {
      i++
      continue
    }

    // ── Normal paragraph ───────────────────────────────────────
    blocks.push({
      _type: 'block',
      _key: randomKey(),
      style: 'normal',
      children: inlineSpans(line),
      markDefs: [],
    })
    i++
  }

  return blocks
}

/** Create a heading block */
function textBlock(text: string, style: string) {
  return {
    _type: 'block',
    _key: randomKey(),
    style,
    children: inlineSpans(text),
    markDefs: [],
  }
}

/** Parse inline markdown (bold, inline code, links) into Portable Text spans */
function inlineSpans(text: string) {
  // Very basic inline parser — covers **bold**, `code`, and [text](url)
  const spans: {_type: string; _key: string; text: string; marks: string[]}[] = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      spans.push({_type: 'span', _key: randomKey(), text: text.slice(last, match.index), marks: []})
    }

    if (match[2]) {
      // bold
      spans.push({_type: 'span', _key: randomKey(), text: match[2], marks: ['strong']})
    } else if (match[3]) {
      // inline code
      spans.push({_type: 'span', _key: randomKey(), text: match[3], marks: ['code']})
    } else if (match[4]) {
      // link — simplified: just render as plain text (Studio handles full links)
      spans.push({_type: 'span', _key: randomKey(), text: match[4], marks: []})
    }

    last = match.index + match[0].length
  }

  if (last < text.length) {
    spans.push({_type: 'span', _key: randomKey(), text: text.slice(last), marks: []})
  }

  return spans.length ? spans : [{_type: 'span', _key: randomKey(), text, marks: []}]
}

function randomKey() {
  return Math.random().toString(36).slice(2, 12)
}

// ── Post data ──────────────────────────────────────────────────────────────

// Content is pasted here as plain strings to keep the script self-contained.
// Escaping is handled by the template literal.

const posts = [
  {
    slug: 'cloudflare-domain-redirect-guide',
    title: 'Mastering Domain Redirects in Cloudflare: A Complete Guide',
    description:
      'Learn how to properly redirect domains in Cloudflare, troubleshoot common issues like Error 522, and avoid DNS pitfalls. Real-world examples included.',
    publishedAt: '2026-02-10T00:00:00Z',
    updatedAt: '2026-02-10T00:00:00Z',
    tags: ['Cloudflare', 'DNS', 'Redirect Rules', 'DevOps', 'Domain Management', 'Troubleshooting'],
    category: 'engineering',
    readingTime: 9,
    featured: true,
    language: 'en',
  },
  {
    slug: 'cloudflare-workers-nextjs-deployment',
    title: 'Deploying Next.js 16 to Cloudflare Workers: A Complete Architecture Guide',
    description:
      'Learn how we built bobadilla.tech with Next.js 16, Cloudflare Workers, and D1. Full architecture breakdown with source code.',
    publishedAt: '2026-02-02T00:00:00Z',
    updatedAt: '2026-02-02T00:00:00Z',
    tags: ['Next.js', 'Cloudflare', 'Workers', 'OpenNext', 'Architecture', 'Edge Computing', 'D1', 'TypeScript'],
    category: 'engineering',
    readingTime: 6,
    featured: true,
    language: 'en',
  },
]

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('🚀 Starting migration...\n')

  // 1. Create or find the Eliaz Bobadilla author document
  const existingAuthor = await client.fetch<{_id: string} | null>(
    `*[_type == "author" && name == "Eliaz Bobadilla"][0]{_id}`,
  )

  let authorId: string

  if (existingAuthor) {
    authorId = existingAuthor._id
    console.log(`✅ Author already exists: ${authorId}`)
  } else {
    const created = await client.create({
      _type: 'author',
      name: 'Eliaz Bobadilla',
      role: 'Senior Engineer',
      // Image upload is done separately via the Studio asset manager.
      // After running this script, upload /public/faces/eliaz.jpeg in the Studio
      // and link it to this author document.
    })
    authorId = created._id
    console.log(`✅ Created author: ${authorId}`)
    console.log(
      '   ⚠️  Remember to upload the author photo (public/faces/eliaz.jpeg) via the Studio.\n',
    )
  }

  // 2. Create post documents
  for (const post of posts) {
    const existing = await client.fetch<{_id: string} | null>(
      `*[_type == "post" && slug.current == $slug][0]{_id}`,
      {slug: post.slug},
    )

    if (existing) {
      console.log(`⏭️  Post already exists, skipping: ${post.slug}`)
      continue
    }

    const doc = {
      _type: 'post',
      title: post.title,
      slug: {_type: 'slug', current: post.slug},
      description: post.description,
      body: [], // Body is left empty — paste content via the Studio editor
      author: {_type: 'reference', _ref: authorId},
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      tags: post.tags,
      category: post.category,
      readingTime: post.readingTime,
      featured: post.featured,
      language: post.language,
    }

    const created = await client.create(doc)
    console.log(`✅ Created post: ${created._id} (${post.slug})`)
  }

  console.log('\n✨ Migration complete!')
  console.log(
    '   Next: open the Studio, open each post, and paste the body content into the rich-text editor.',
  )
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
