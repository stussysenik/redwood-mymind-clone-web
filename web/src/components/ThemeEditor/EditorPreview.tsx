/**
 * EditorPreview -- Live preview panel for the Theme Editor.
 *
 * Renders simplified card mockups, tag pills, buttons, and
 * typography samples so every token change is visible instantly.
 */

import React from 'react'

// ---------------------------------------------------------------------------
// Preview Card
// ---------------------------------------------------------------------------

interface PreviewCardProps {
  title: string
  content?: string | null
  tags?: string[]
  imageUrl?: string | null
  type?: string
  author?: string
}

function PreviewCard({
  title,
  content,
  tags,
  imageUrl,
  type,
  author,
}: PreviewCardProps) {
  return (
    <div className="card-base break-inside-avoid mb-4">
      {imageUrl && (
        <div
          className="w-full h-32 bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      )}
      <div className="p-3">
        {type && (
          <span
            className="text-[10px] uppercase font-semibold tracking-wider"
            style={{ color: 'var(--accent-primary)' }}
          >
            {type}
          </span>
        )}
        <h3
          className="text-sm font-medium mt-0.5 line-clamp-2"
          style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}
        >
          {title}
        </h3>
        {content && (
          <p
            className="text-xs mt-1.5 line-clamp-3 leading-relaxed"
            style={{
              color: 'var(--foreground-muted)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {content}
          </p>
        )}
        {author && (
          <p
            className="text-[11px] mt-2 font-medium"
            style={{ color: 'var(--foreground-muted)' }}
          >
            by {author}
          </p>
        )}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground-muted)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Twitter-style Card
// ---------------------------------------------------------------------------

function PreviewTwitterCard() {
  return (
    <div className="card-base break-inside-avoid mb-4">
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-8 h-8 rounded-full bg-cover"
            style={{
              backgroundImage: 'url(https://picsum.photos/seed/avatar1/48/48)',
            }}
          />
          <div>
            <p
              className="text-xs font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              Elon Musk
            </p>
            <p
              className="text-[10px]"
              style={{ color: 'var(--foreground-muted)' }}
            >
              @elonmusk
            </p>
          </div>
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{
            color: 'var(--foreground)',
            fontFamily: 'var(--font-body)',
          }}
        >
          The future of AI is not about replacing humans &mdash; it&apos;s about
          augmenting human creativity. We&apos;re building tools that amplify
          what people can do.
        </p>
        <div className="flex gap-4 mt-3 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
          <span>42K likes</span>
          <span>8.5K retweets</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {['ai', 'technology', 'future'].map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--surface-soft)',
                color: 'var(--foreground-muted)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tag color chips
// ---------------------------------------------------------------------------

const TAG_COLORS: { name: string; variable: string }[] = [
  { name: 'Green', variable: '--tag-green' },
  { name: 'Red', variable: '--tag-red' },
  { name: 'Blue', variable: '--tag-blue' },
  { name: 'Orange', variable: '--tag-orange' },
  { name: 'Purple', variable: '--tag-purple' },
  { name: 'Pink', variable: '--tag-pink' },
  { name: 'Cyan', variable: '--tag-cyan' },
  { name: 'Amber', variable: '--tag-amber' },
]

// ---------------------------------------------------------------------------
// Main Preview
// ---------------------------------------------------------------------------

export function EditorPreview() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Search Bar Mockup */}
      <div
        className="w-full px-4 py-3 rounded-xl flex items-center gap-3"
        style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--foreground-muted)' }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <span
          className="text-sm"
          style={{
            color: 'var(--foreground-muted)',
            fontFamily: 'var(--font-body)',
          }}
        >
          Search your mind...
        </span>
      </div>

      {/* Tag Chips */}
      <div>
        <h4
          className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--foreground-muted)' }}
        >
          Tag Colors
        </h4>
        <div className="flex flex-wrap gap-2">
          {TAG_COLORS.map(({ name, variable }) => (
            <span
              key={variable}
              className="text-xs font-medium px-3 py-1 rounded-full"
              style={{
                backgroundColor: `var(${variable})`,
                color: '#FFFFFF',
              }}
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div>
        <h4
          className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--foreground-muted)' }}
        >
          Buttons
        </h4>
        <div className="flex flex-wrap gap-3">
          <button
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: '#FFFFFF',
            }}
          >
            Primary Action
          </button>
          <button
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              backgroundColor: 'transparent',
            }}
          >
            Secondary
          </button>
          <button
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--surface-soft)',
              color: 'var(--foreground-muted)',
            }}
          >
            Ghost
          </button>
        </div>
      </div>

      {/* Typography */}
      <div>
        <h4
          className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--foreground-muted)' }}
        >
          Typography
        </h4>
        <div
          className="p-5 rounded-xl space-y-3"
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <h2
            className="text-xl font-bold"
            style={{
              color: 'var(--foreground)',
              fontFamily: 'var(--font-display)',
            }}
          >
            Heading in Display
          </h2>
          <h3
            className="text-base font-semibold"
            style={{
              color: 'var(--foreground)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Subheading in Body Font
          </h3>
          <p
            className="text-sm leading-relaxed"
            style={{
              color: 'var(--foreground)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Body text with the body font. This previews how regular
            content looks with your chosen typography settings. The quick brown
            fox jumps over the lazy dog.
          </p>
          <p
            className="text-xs"
            style={{
              color: 'var(--foreground-muted)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Muted caption text &mdash; used for secondary information like dates
            and metadata.
          </p>
        </div>
      </div>

      {/* Masonry Card Grid */}
      <div>
        <h4
          className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--foreground-muted)' }}
        >
          Cards
        </h4>
        <div className="columns-2 gap-4">
          <PreviewTwitterCard />

          <PreviewCard
            type="article"
            title="The Rise of Edge Computing"
            content="Edge computing is transforming how applications are built and deployed, bringing computation closer to users."
            tags={['edge', 'cloud', 'infrastructure']}
            imageUrl="https://picsum.photos/seed/art1/600/400"
            author="Tech Writer"
          />

          <PreviewCard
            type="note"
            title="Meeting Notes - Q1 Planning"
            content="Key takeaways: Focus on performance optimization. Launch new dashboard by March. Hire two frontend engineers."
            tags={['meeting', 'planning', 'q1']}
          />

          <PreviewCard
            type="image"
            title="Design Inspiration - Minimal Dashboard"
            imageUrl="https://picsum.photos/seed/img1/800/600"
            tags={['design', 'ui', 'dashboard']}
          />
        </div>
      </div>

      {/* Surfaces */}
      <div>
        <h4
          className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--foreground-muted)' }}
        >
          Surfaces
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Primary', variable: '--surface-primary' },
            { label: 'Secondary', variable: '--surface-secondary' },
            { label: 'Card', variable: '--surface-card' },
            { label: 'Elevated', variable: '--surface-elevated' },
          ].map(({ label, variable }) => (
            <div
              key={variable}
              className="aspect-square rounded-xl flex items-end p-3"
              style={{
                backgroundColor: `var(${variable})`,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span
                className="text-[10px] font-medium"
                style={{ color: 'var(--foreground-muted)' }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
