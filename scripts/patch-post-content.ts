/**
 * Patches existing post documents with converted Portable Text body content.
 *
 * Run from the studio directory:
 *   npx sanity exec scripts/patch-post-content.ts --with-user-token
 */

import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2024-01-01'})

// ── Markdown → Portable Text converter ────────────────────────────────────

function randomKey() {
  return Math.random().toString(36).slice(2, 12)
}

function inlineSpans(text: string) {
  const spans: {_type: string; _key: string; text: string; marks: string[]}[] = []
  // Matches **bold**, `code`, and [link text](url)
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      spans.push({_type: 'span', _key: randomKey(), text: text.slice(last, match.index), marks: []})
    }
    if (match[2] !== undefined) {
      spans.push({_type: 'span', _key: randomKey(), text: match[2], marks: ['strong']})
    } else if (match[3] !== undefined) {
      spans.push({_type: 'span', _key: randomKey(), text: match[3], marks: ['code']})
    } else if (match[4] !== undefined) {
      spans.push({_type: 'span', _key: randomKey(), text: match[4], marks: []})
    }
    last = match.index + match[0].length
  }

  if (last < text.length) {
    spans.push({_type: 'span', _key: randomKey(), text: text.slice(last), marks: []})
  }

  return spans.length ? spans : [{_type: 'span', _key: randomKey(), text, marks: []}]
}

function textBlock(text: string, style: string) {
  return {
    _type: 'block',
    _key: randomKey(),
    style,
    children: inlineSpans(text),
    markDefs: [],
  }
}

function markdownToBlocks(markdown: string) {
  const blocks: unknown[] = []
  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code fence
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
      i++
      continue
    }

    // H4
    if (line.startsWith('#### ')) {
      blocks.push(textBlock(line.slice(5), 'h4'))
      i++
      continue
    }
    // H3
    if (line.startsWith('### ')) {
      blocks.push(textBlock(line.slice(4), 'h3'))
      i++
      continue
    }
    // H2
    if (line.startsWith('## ')) {
      blocks.push(textBlock(line.slice(3), 'h2'))
      i++
      continue
    }
    // H1 (treat as h2 since this is article body)
    if (line.startsWith('# ')) {
      blocks.push(textBlock(line.slice(2), 'h2'))
      i++
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      i++
      continue
    }

    // Bullet list
    if (/^[-*] /.test(line)) {
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        blocks.push({
          _type: 'block',
          _key: randomKey(),
          style: 'normal',
          listItem: 'bullet',
          level: 1,
          children: inlineSpans(lines[i].replace(/^[-*] /, '')),
          markDefs: [],
        })
        i++
      }
      continue
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        blocks.push({
          _type: 'block',
          _key: randomKey(),
          style: 'normal',
          listItem: 'number',
          level: 1,
          children: inlineSpans(lines[i].replace(/^\d+\. /, '')),
          markDefs: [],
        })
        i++
      }
      continue
    }

    // Blank line
    if (line.trim() === '') {
      i++
      continue
    }

    // Normal paragraph
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

// ── Post content ───────────────────────────────────────────────────────────

const POST_CONTENT: Record<string, string> = {
  'cloudflare-domain-redirect-guide': `# Mastering Domain Redirects in Cloudflare: A Complete Guide

Domain redirects are one of the most common tasks when managing web infrastructure, whether you're consolidating brands, migrating to a new domain, or simply redirecting www to non-www sites. Cloudflare makes this powerful, but there are subtle gotchas that can leave you staring at Error 522 or DNS_PROBE_FINISHED_NXDOMAIN for hours.

In this guide, I'll walk you through **exactly** how to redirect domains in Cloudflare, cover the common mistakes that bite developers, and show you how to troubleshoot issues systematically. This comes from real-world experience redirecting bobadilla.work → bobadilla.tech in production.

**What you'll learn:**

- The correct way to set up domain redirects using Cloudflare Redirect Rules
- How DNS records interact with redirect rules (this is where most people fail)
- Troubleshooting Error 522, NXDOMAIN, and other redirect issues
- When to use Redirect Rules vs Page Rules vs Workers
- SEO-safe redirect strategies (301 vs 302)
- Common pitfalls and how to avoid them

---

## Why Domain Redirects Matter

Before diving into implementation, let's understand when and why you need domain redirects.

**Brand consolidation**: You acquired a competitor or are rebranding — Example: \`oldcompany.com\` → \`newcompany.com\`

**Domain standardization**: Redirect www to apex or vice versa — Example: \`www.example.com\` → \`example.com\`

**Multiple domains pointing to one site**: You own several TLDs — Example: \`example.net\`, \`example.org\` → \`example.com\`

**SEO migration**: Preserving search rankings when changing domains

### SEO Implications

**301 (Permanent)**: Tells search engines this is permanent. Use this 95% of the time. Transfers 90-99% of link equity, search engines update their index, browser caches aggressively.

**302 (Temporary)**: Tells search engines this is temporary. Does NOT transfer link equity, search engines keep indexing the old URL. Use for A/B tests or maintenance redirects.

**Getting this wrong can tank your SEO** — always use 301 for permanent moves.

---

## The Cloudflare Redirect Architecture

Before configuring anything, understand how Cloudflare processes requests. Redirect Rules only fire if:

- DNS resolves (A/AAAA/CNAME record exists)
- Domain is proxied (orange cloud)
- Request matches the rule condition

Miss any of these? You get errors.

---

## Method 1: Redirect Rules (Recommended)

This is the modern, scalable approach. Cloudflare is moving everything to Redirect Rules, and they're faster and more flexible than legacy Page Rules.

### Step 1: Set Up DNS Records

**Critical requirement**: The source domain MUST resolve, even if you're redirecting everything away from it.

For the apex domain (example.com), create an A record with Name \`@\`, IPv4 \`192.0.2.1\`, and set it to Proxied.

**Why \`192.0.2.1\`?** This is a reserved "dummy" IP (RFC 5737) used for documentation/testing. It never routes anywhere — perfect placeholder when you don't need an actual origin.

**Common mistake #1**: Leaving the name as \`example.com\` instead of \`@\`. In Cloudflare DNS, \`@\` = root/apex domain. If you type \`example.com\`, Cloudflare creates \`example.com.example.com\` → NXDOMAIN.

For the www subdomain, create an A record with Name \`www\`, IPv4 \`192.0.2.1\`, Proxied.

**Common mistake #2**: Forgetting the www record. If your redirect rule matches \`www.example.com\` but no DNS record exists, you get NXDOMAIN.

### Step 2: Create the Redirect Rule

Navigate to: **Rules** → **Redirect Rules** → **Create rule**

Set a rule name, match on Hostname equals the old domain, then set Type to Dynamic Redirect with the expression \`concat("https://newcompany.com", http.request.uri.path)\`, Status 301, and Preserve query string enabled.

### Step 3: Test Thoroughly

Open an incognito window and test all variations:

\`\`\`bash
# Apex domain
curl -I http://oldcompany.com
curl -I https://oldcompany.com

# WWW subdomain
curl -I http://www.oldcompany.com
curl -I https://www.oldcompany.com

# With paths
curl -I http://oldcompany.com/about
curl -I http://oldcompany.com/blog/post?id=123
\`\`\`

Expected output should show \`HTTP/2 301\` with the correct \`location\` header.

**Common mistake #3**: Testing in the same browser without clearing cache. 301 redirects are cached hard by browsers. Use incognito/private mode or \`curl\`.

---

## Troubleshooting Common Issues

### Error: DNS_PROBE_FINISHED_NXDOMAIN

**What it means**: Domain doesn't resolve in DNS. **Cause**: Missing or incorrect DNS record.

**Fix checklist**:
- A record exists for \`@\` (not the full domain name)
- A record exists for \`www\` (if redirecting www)
- Records are saved
- Wait 30-60 seconds for DNS propagation

\`\`\`bash
dig oldcompany.com
dig www.oldcompany.com
\`\`\`

### Error 522: Connection Timed Out

**What it means**: Cloudflare connected to your domain, but the redirect rule didn't fire, so it tried to reach the origin IP and timed out. **Cause**: Redirect rule not matching the request.

**Fix checklist**:
- DNS record is proxied (orange cloud)
- Redirect rule includes ALL hostnames (apex + www)
- Rule order is correct (should be first)
- Expression syntax is valid

### Redirect Loop

**What it means**: Browser shows "Too many redirects"

**Fix checklist**:
- Check redirect rules on BOTH domains
- Ensure target domain has NO redirect rule pointing back
- Check \`.htaccess\` or server config on target
- Verify Cloudflare SSL mode (should be "Full" or "Full (strict)")

---

## Real-World Example: bobadilla.work → bobadilla.tech

### Requirements

- Redirect \`bobadilla.work\` → \`bobadilla.tech\`
- Redirect \`www.bobadilla.work\` → \`bobadilla.tech\`
- Preserve all paths and query strings
- Keep email working on bobadilla.work (MX records)
- SEO-safe (301 permanent)

### DNS Configuration

\`\`\`
# bobadilla.work DNS records
Type: A      Name: @      IP: 192.0.2.1    Proxy: Proxied
Type: A      Name: www    IP: 192.0.2.1    Proxy: Proxied
Type: MX     Name: @      Value: ...       Proxy: DNS only
Type: TXT    Name: @      Value: ...       Proxy: DNS only
\`\`\`

**Key point**: Email records (MX, TXT) are NOT proxied. Only HTTP/HTTPS traffic goes through Cloudflare edge.

### Redirect Rule Expression

\`\`\`
(http.host eq "bobadilla.work" or http.host eq "www.bobadilla.work")
\`\`\`

Then: Type Dynamic, Expression \`concat("https://bobadilla.tech", http.request.uri.path)\`, Status 301, Preserve query string.

### Results

\`\`\`bash
curl -I http://bobadilla.work
# → 301 → https://bobadilla.tech

curl -I http://bobadilla.work/projects
# → 301 → https://bobadilla.tech/projects

curl -I http://www.bobadilla.work/contact?source=email
# → 301 → https://bobadilla.tech/contact?source=email
\`\`\`

---

## Best Practices

### 1. Always Use 301 for Permanent Moves

Unless you have a specific reason (A/B test, temporary maintenance), always use 301. It transfers SEO value, signals permanence to search engines, and updates Google's index faster.

### 2. Preserve Path and Query Strings

Never redirect everything to the homepage. Use dynamic redirects with \`http.request.uri.path\` to preserve paths and \`http.request.uri.query\` for query strings.

### 3. Test All Variations

Don't assume. Test HTTP and HTTPS, apex and www, with and without trailing slashes, with query parameters.

### 4. Monitor After Launch

Use Cloudflare Analytics to verify redirect status codes (should see lots of 301s) and no 4xx or 5xx errors. Check Google Search Console — submit new sitemap and monitor index coverage.

### 5. Keep Email Records Separate

MX and TXT records should be DNS-only (grey cloud), NOT proxied through Cloudflare. Redirects only affect HTTP/HTTPS traffic.

---

## Conclusion

Cloudflare domain redirects are powerful, fast, and free — when configured correctly.

**Critical requirements**:
- DNS must resolve (A record with orange cloud)
- Use \`@\` for apex, not the full domain name
- Include www in redirect rules if you use it
- Always test in incognito or curl

**When to use what**:
- **Redirect Rules**: 99% of cases (modern, unlimited, fast)
- **Page Rules**: Only if already using them (legacy)
- **Workers**: Complex logic, geo-routing, custom code

The redirect from bobadilla.work → bobadilla.tech took 5 minutes to configure once I understood these principles. Follow this guide and yours will too.

---

Have questions or hit a weird edge case? Email us at ale@bobadilla.tech. Need help with Cloudflare setup, migrations, or architecture? We offer consulting and implementation services — get in touch at bobadilla.tech.`,

  'cloudflare-workers-nextjs-deployment': `# Deploying Next.js 16 to Cloudflare Workers: A Complete Architecture Guide

Building a production-ready Next.js application that's blazingly fast, globally distributed, and cost-effective is completely achievable with Cloudflare Workers. In this comprehensive guide, I'll walk you through exactly how we built bobadilla.tech, including the architecture decisions, deployment process, and performance optimizations that resulted in sub-50ms response times worldwide.

**What you'll learn:**

- How to deploy Next.js 16 to Cloudflare's edge network using OpenNext.js
- Building a TypeScript-based blog system with inline markdown
- Implementing static generation for maximum performance
- Integrating Cloudflare D1 (SQLite at the edge) with Drizzle ORM
- SEO optimization strategies with Open Graph and structured data
- Complete architecture breakdown you can replicate

This guide is for developers who want to build fast, scalable web applications on the edge without the complexity and cost of traditional infrastructure.

---

## 1. Tech Stack Overview

Let me start by explaining the technology choices and why each piece was selected for this architecture.

### Core Framework: Next.js 16 with App Router

We chose **Next.js 16** for several compelling reasons:

- **App Router stability**: The App Router has matured significantly, offering better performance and developer experience than the Pages Router
- **Server Components**: Reduce JavaScript bundle size by rendering components on the server
- **Turbopack**: Lightning-fast development builds (5-10x faster than Webpack)
- **Built-in optimizations**: Automatic code splitting, image optimization, and font optimization out of the box
- **Edge-ready**: Designed to work seamlessly with edge runtimes like Cloudflare Workers

### Deployment: Cloudflare Workers + OpenNext.js

**Cloudflare Workers** provides our edge computing layer:

- **275+ global locations**: Your application runs closer to your users worldwide
- **Zero cold starts**: Unlike AWS Lambda, Workers are instant (no warmup time)
- **Generous free tier**: 100,000 requests/day free, then $0.50 per million requests
- **Sub-millisecond latency**: Responses are served from the nearest edge location
- **Integrated services**: D1 database, KV storage, R2 object storage, all at the edge

**OpenNext.js** is the bridge that makes Next.js work on Cloudflare:

- Transforms Next.js build output into Worker-compatible code
- Handles routing, middleware, and API routes at the edge
- Manages static assets and server-side rendering
- Open-source and actively maintained

---

## 2. Static Generation Strategy

Static Site Generation (SSG) is the secret sauce that makes this architecture blazingly fast.

### generateStaticParams()

In \`src/app/blog/[slug]/page.tsx\`, we tell Next.js to pre-generate every blog post route at build time:

\`\`\`typescript
export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}
\`\`\`

**What happens at runtime (Cloudflare Workers):**

Unlike traditional static hosting where HTML files are served directly from a CDN, OpenNext on Cloudflare Workers works differently:

1. Request hits the Cloudflare Worker
2. Worker loads the **pre-rendered HTML** from the build
3. Worker serves the HTML through its runtime

**Why this matters:**

- Pages ARE pre-rendered (no React rendering at runtime)
- SEO-perfect: Search engines get fully-rendered HTML
- Pages still go through the Worker (not pure static files)
- Worker must stay under resource limits (CPU/memory)

---

## 3. Cloudflare Workers Deployment

### Why Cloudflare Workers?

**Performance:**

- **Sub-50ms Time to First Byte (TTFB)** from anywhere in the world
- **275+ edge locations**: North America, Europe, Asia, South America, Africa, Oceania
- **Zero cold starts**: Workers are always warm, unlike Lambda functions
- **Instant scaling**: Handle traffic spikes without provisioning

**Cost:**

- **100,000 requests/day free**: Perfect for small to medium traffic sites
- **$5/month for 10 million requests**: Extremely cost-effective at scale
- **No bandwidth fees**: Unlike AWS, you don't pay for data transfer
- **No idle costs**: Only pay for actual requests, not reserved capacity

### OpenNext.js Configuration

OpenNext.js transforms your Next.js build into Worker-compatible code.

\`\`\`json
{
  "scripts": {
    "build": "next build && opennextjs-cloudflare build",
    "cf:deploy": "wrangler deploy"
  }
}
\`\`\`

**What happens during build:**

1. \`next build\` creates optimized production build
2. \`opennextjs-cloudflare build\` transforms it to Worker-compatible code
3. Static assets extracted to \`.open-next/assets/\`
4. Worker entry point created

---

## 4. Performance Optimizations

### Image Optimization

We disabled Next.js image optimization for Cloudflare Workers compatibility:

\`\`\`javascript
// next.config.js
module.exports = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
};
\`\`\`

### Lazy Loading Heavy Components

We moved THREE.js ShaderBackground to a lazy-loaded client component to reduce Worker CPU usage:

\`\`\`typescript
// src/components/shaders/ShaderBackgroundLazy.tsx
"use client";

import dynamic from "next/dynamic";

const ShaderBackground = dynamic(
  () => import("@/components/shaders/ShaderBackground"),
  {
    ssr: false,
    loading: () => <div className="fixed inset-0 -z-10 bg-brand-bg" />
  }
);

export default ShaderBackground;
\`\`\`

This prevents THREE.js from executing during SSR, keeping Worker CPU usage under limits.

---

## 5. SEO Implementation

### Metadata Strategy

Our \`src/lib/seo.ts\` utility generates comprehensive metadata for every page with Open Graph tags, Twitter Cards, and canonical URLs.

### Sitemap Generation

Dynamic sitemap generated at \`src/app/sitemap.ts\`:

\`\`\`typescript
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      priority: 1,
    },
    ...posts.map((post) => ({
      url: \`\${BASE_URL}/blog/\${post.slug.current}\`,
      lastModified: post.updatedAt || post.publishedAt,
      priority: 0.8,
    })),
  ];
}
\`\`\`

---

## 6. Conclusion

We've built a production-ready Next.js application that's fast, scalable, cost-effective, and developer-friendly. Here's what makes this architecture special:

**Performance wins:**

- **Sub-50ms TTFB** from anywhere in the world
- **Zero cold starts** compared to traditional serverless
- **Static generation** for instant page loads
- **Automatic caching** on Cloudflare's CDN

**Cost efficiency:**

- **100,000 requests/day free**
- **$5/month for 10 million requests** at scale
- **No bandwidth charges**
- **Included SSL certificates** and DDoS protection

**Developer experience:**

- **Type-safe everything**: TypeScript + Zod + Drizzle
- **Fast builds**: Turbopack for quick iteration
- **Simple deployment**: One command to go live

This architecture demonstrates how modern edge computing can deliver exceptional performance at a fraction of traditional infrastructure costs.

---

Questions or feedback? Reach out to us at ale@bobadilla.tech. Want help building your Next.js application? We offer development services and consulting — get in touch at bobadilla.tech.`,
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('🚀 Patching post bodies...\n')

  for (const [slug, markdown] of Object.entries(POST_CONTENT)) {
    const post = await client.fetch<{_id: string} | null>(
      `*[_type == "post" && slug.current == $slug][0]{_id}`,
      {slug},
    )

    if (!post) {
      console.log(`⚠️  Post not found, skipping: ${slug}`)
      continue
    }

    const body = markdownToBlocks(markdown)

    await client.patch(post._id).set({body}).commit()
    console.log(`✅ Patched body: ${slug} (${body.length} blocks)`)
  }

  console.log('\n✨ Done! Posts now have Portable Text content.')
}

run().catch((err) => {
  console.error('❌ Patch failed:', err.message)
  process.exit(1)
})
