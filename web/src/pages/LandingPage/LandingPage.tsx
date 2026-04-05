import { Link, routes } from '@redwoodjs/router'
import { Metadata } from '@redwoodjs/web'

// Static demo cards representing a curated personal collection
const DEMO_CARDS = [
  {
    id: 1,
    type: 'image',
    title: 'Issey Miyake SS23 — Pleats Please',
    tag: 'fashion',
    tagColor: 'var(--tag-purple)',
    height: 220,
    bg: 'var(--surface-secondary)',
    accent: 'var(--tag-purple)',
  },
  {
    id: 2,
    type: 'article',
    title: 'The Almanack of Naval Ravikant',
    tag: 'reading',
    tagColor: 'var(--tag-blue)',
    height: 160,
    bg: 'var(--surface-card)',
    accent: 'var(--tag-blue)',
  },
  {
    id: 3,
    type: 'tool',
    title: 'Linear — Project management for modern teams',
    tag: 'tools',
    tagColor: 'var(--tag-cyan)',
    height: 140,
    bg: 'var(--surface-card)',
    accent: 'var(--tag-cyan)',
  },
  {
    id: 4,
    type: 'image',
    title: 'Brutalist Architecture — Boston City Hall',
    tag: 'architecture',
    tagColor: 'var(--tag-orange)',
    height: 200,
    bg: 'var(--surface-secondary)',
    accent: 'var(--tag-orange)',
  },
  {
    id: 5,
    type: 'note',
    title: '\u201cTaste is the residue of all the choices you\u2019ve made.\u201d',
    tag: 'quotes',
    tagColor: 'var(--tag-pink)',
    height: 130,
    bg: 'var(--surface-card)',
    accent: 'var(--tag-pink)',
  },
  {
    id: 6,
    type: 'article',
    title: 'How Figma builds product',
    tag: 'design',
    tagColor: 'var(--tag-blue)',
    height: 150,
    bg: 'var(--surface-card)',
    accent: 'var(--tag-blue)',
  },
  {
    id: 7,
    type: 'image',
    title: 'Aesop Resurrection Aromatique Hand Wash',
    tag: 'objects',
    tagColor: 'var(--tag-green)',
    height: 180,
    bg: 'var(--surface-secondary)',
    accent: 'var(--tag-green)',
  },
  {
    id: 8,
    type: 'tool',
    title: 'Raycast — Supercharged productivity',
    tag: 'tools',
    tagColor: 'var(--tag-cyan)',
    height: 140,
    bg: 'var(--surface-card)',
    accent: 'var(--tag-cyan)',
  },
  {
    id: 9,
    type: 'article',
    title: 'The art of finishing — Austin Kleon',
    tag: 'reading',
    tagColor: 'var(--tag-amber)',
    height: 155,
    bg: 'var(--surface-card)',
    accent: 'var(--tag-amber)',
  },
]

const FEATURES = [
  {
    icon: '⊕',
    title: 'Save anything',
    desc: 'Links, images, notes, articles. If it matters to you, it belongs here.',
  },
  {
    icon: '◎',
    title: 'Your algorithm',
    desc: "AI-powered organization that learns your taste \u2014 not an advertiser's.",
  },
  {
    icon: '▦',
    title: 'Visual grid',
    desc: 'Grid, list, and dense views. See your collection the way you think.',
  },
  {
    icon: '◻',
    title: 'Private by design',
    desc: 'No ads. No tracking. Your data and your algorithm stay yours.',
  },
]

const DemoCard = ({ card }: { card: (typeof DEMO_CARDS)[0] }) => {
  const typeLabel = card.type === 'image'
    ? '— img'
    : card.type === 'article'
    ? '— article'
    : card.type === 'note'
    ? '— note'
    : '— link'

  return (
    <div
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        height: `${card.height}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow-sm)',
        transition: 'box-shadow var(--duration-normal) ease, transform var(--duration-normal) ease',
        cursor: 'default',
        overflow: 'hidden',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
      }}
    >
      {/* Subtle color accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          backgroundColor: card.accent,
          opacity: 0.6,
        }}
      />

      {/* Card body */}
      <div style={{ flex: 1, paddingTop: '4px' }}>
        <p
          style={{
            fontSize: '13px',
            fontFamily: 'var(--font-display)',
            color: 'var(--foreground)',
            lineHeight: '1.5',
            fontWeight: card.type === 'note' ? 500 : 400,
            fontStyle: card.type === 'note' ? 'italic' : 'normal',
          }}
        >
          {card.title}
        </p>
      </div>

      {/* Card footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '12px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-ui)',
            color: 'white',
            backgroundColor: card.tagColor,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            letterSpacing: '0.02em',
          }}
        >
          {card.tag}
        </span>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-ui)',
            color: 'var(--foreground-muted)',
            letterSpacing: '0.04em',
          }}
        >
          {typeLabel}
        </span>
      </div>
    </div>
  )
}

const LandingPage = () => {
  return (
    <>
      <Metadata title="BYOA — Build Your Own Algorithm" description="A private space to save, organize, and rediscover everything that matters to you." />

      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {/* Nav */}
        <nav
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            borderBottom: '1px solid var(--border-default)',
            backgroundColor: 'var(--header-backdrop)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '0 24px',
            height: 'var(--header-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '15px',
              letterSpacing: '-0.01em',
              color: 'var(--foreground)',
            }}
          >
            byoa
          </span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Link
              to={routes.login()}
              style={{
                fontSize: '13px',
                fontFamily: 'var(--font-ui)',
                color: 'var(--foreground-muted)',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                transition: 'color var(--duration-fast) ease',
              }}
            >
              log in
            </Link>
            <Link
              to={routes.signup()}
              style={{
                fontSize: '13px',
                fontFamily: 'var(--font-ui)',
                color: 'white',
                backgroundColor: 'var(--accent-primary)',
                textDecoration: 'none',
                padding: '7px 16px',
                borderRadius: 'var(--radius-md)',
                fontWeight: 500,
                transition: 'background-color var(--duration-fast) ease',
              }}
            >
              get started
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section
          style={{
            maxWidth: '800px',
            margin: '0 auto',
            padding: '80px 24px 64px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              fontSize: '11px',
              fontFamily: 'var(--font-ui)',
              color: 'var(--accent-primary)',
              backgroundColor: 'var(--accent-light)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              marginBottom: '24px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            personal knowledge curation
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'clamp(56px, 10vw, 96px)',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              color: 'var(--foreground)',
              marginBottom: '16px',
            }}
          >
            BYOA
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(20px, 3.5vw, 28px)',
              color: 'var(--foreground-muted)',
              marginBottom: '24px',
              fontWeight: 400,
              fontStyle: 'italic',
            }}
          >
            Build Your Own Algorithm
          </p>

          <p
            style={{
              fontSize: '16px',
              color: 'var(--foreground-muted)',
              maxWidth: '520px',
              margin: '0 auto 40px',
              lineHeight: 1.7,
            }}
          >
            A private space to save, organize, and rediscover everything that matters to you. No ads. No tracking. Just your taste, your algorithm.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to={routes.signup()}
              style={{
                display: 'inline-block',
                padding: '13px 28px',
                backgroundColor: 'var(--accent-primary)',
                color: 'white',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-ui)',
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'background-color var(--duration-fast) ease',
                letterSpacing: '0.01em',
              }}
            >
              Start building your algorithm
            </Link>
            <Link
              to={routes.login()}
              style={{
                display: 'inline-block',
                padding: '13px 28px',
                backgroundColor: 'transparent',
                color: 'var(--foreground-muted)',
                border: '1px solid var(--border-emphasis)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-ui)',
                fontSize: '14px',
                textDecoration: 'none',
                transition: 'border-color var(--duration-fast) ease',
                letterSpacing: '0.01em',
              }}
            >
              Log in
            </Link>
          </div>
        </section>

        {/* Demo grid showcase */}
        <section
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: '0 24px 80px',
          }}
        >
          <div
            style={{
              columnCount: 3,
              columnGap: '16px',
            }}
            className="landing-demo-grid"
          >
            {DEMO_CARDS.map((card) => (
              <div
                key={card.id}
                style={{ breakInside: 'avoid', marginBottom: '16px' }}
              >
                <DemoCard card={card} />
              </div>
            ))}
          </div>
          <style>{`
            @media (max-width: 768px) {
              .landing-demo-grid { column-count: 2 !important; }
            }
            @media (max-width: 480px) {
              .landing-demo-grid { column-count: 1 !important; }
            }
          `}</style>
        </section>

        {/* Feature highlights */}
        <section
          style={{
            backgroundColor: 'var(--surface-secondary)',
            borderTop: '1px solid var(--border-default)',
            borderBottom: '1px solid var(--border-default)',
            padding: '64px 24px',
          }}
        >
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '11px',
                color: 'var(--foreground-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                textAlign: 'center',
                marginBottom: '40px',
              }}
            >
              how it works
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '24px',
              }}
            >
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  style={{
                    backgroundColor: 'var(--surface-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '24px',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: '20px',
                      color: 'var(--accent-primary)',
                      marginBottom: '12px',
                      lineHeight: 1,
                    }}
                  >
                    {f.icon}
                  </div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--foreground)',
                      marginBottom: '8px',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {f.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--foreground-muted)',
                      lineHeight: 1.6,
                    }}
                  >
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA section */}
        <section
          style={{
            maxWidth: '640px',
            margin: '0 auto',
            padding: '80px 24px',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(24px, 4vw, 36px)',
              color: 'var(--foreground)',
              marginBottom: '16px',
              fontWeight: 400,
            }}
          >
            Your collection is waiting.
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--foreground-muted)',
              marginBottom: '32px',
              lineHeight: 1.7,
            }}
          >
            Join others building a personal algorithm that actually reflects their taste — not an engagement metric.
          </p>
          <Link
            to={routes.signup()}
            style={{
              display: 'inline-block',
              padding: '13px 32px',
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-ui)',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
              letterSpacing: '0.01em',
            }}
          >
            Start building your algorithm
          </Link>
        </section>

        {/* Footer */}
        <footer
          style={{
            borderTop: '1px solid var(--border-default)',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '13px',
              color: 'var(--foreground-muted)',
              letterSpacing: '-0.01em',
            }}
          >
            byoa &mdash; build your own algorithm
          </p>
        </footer>
      </div>
    </>
  )
}

export default LandingPage
