import {defineField, defineType} from 'sanity'

const CATEGORIES = [
  {title: 'Engineering', value: 'engineering'},
  {title: 'AI', value: 'ai'},
  {title: 'Product', value: 'product'},
  {title: 'Business', value: 'business'},
  {title: 'Tutorial', value: 'tutorial'},
]

const LANGUAGES = [
  {title: 'English', value: 'en'},
  {title: 'Spanish', value: 'es'},
  {title: 'Portuguese', value: 'pt'},
]

export const post = defineType({
  name: 'post',
  title: 'Blog Post',
  type: 'document',
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'meta', title: 'Meta & SEO'},
    {name: 'settings', title: 'Settings'},
  ],
  fields: [
    // ── Content ────────────────────────────────────────────────
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'content',
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: {source: 'title', maxLength: 96},
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      group: 'content',
      description: 'Short summary shown in cards and used for SEO meta description.',
      validation: (R) => R.required().max(300),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
      group: 'content',
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{type: 'author'}],
      group: 'content',
      validation: (R) => R.required(),
    }),

    // ── Meta ───────────────────────────────────────────────────
    defineField({
      name: 'coverImage',
      title: 'Cover Image',
      type: 'image',
      group: 'meta',
      options: {hotspot: true},
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alt text',
        },
      ],
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      group: 'meta',
      initialValue: () => new Date().toISOString(),
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
      group: 'meta',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      group: 'meta',
      options: {layout: 'tags'},
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      group: 'meta',
      options: {list: CATEGORIES, layout: 'radio'},
      validation: (R) => R.required(),
    }),

    // ── Settings ───────────────────────────────────────────────
    defineField({
      name: 'language',
      title: 'Language',
      type: 'string',
      group: 'settings',
      options: {list: LANGUAGES, layout: 'radio'},
      initialValue: 'en',
      validation: (R) => R.required(),
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      group: 'settings',
      initialValue: false,
    }),
    defineField({
      name: 'readingTime',
      title: 'Reading Time (minutes)',
      type: 'number',
      group: 'settings',
      validation: (R) => R.min(1).max(60),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      author: 'author.name',
      media: 'coverImage',
      category: 'category',
    },
    prepare({title, author, media, category}) {
      return {
        title,
        subtitle: `${category ?? '—'} · ${author ?? 'Unknown author'}`,
        media,
      }
    },
  },
  orderings: [
    {
      title: 'Published (newest first)',
      name: 'publishedAtDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
  ],
})
