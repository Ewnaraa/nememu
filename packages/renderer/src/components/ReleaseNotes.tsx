import { colors } from '@/theme'

/**
 * Renders the CHANGELOG section Vite injected as `__APP_CHANGELOG__`.
 *
 * A deliberately tiny Markdown subset — `###` headings, `-` bullets, `**bold**`
 * — because that is all CHANGELOG.md actually uses, and pulling a Markdown
 * library into the bundle to render four constructs would cost more than it
 * explains. If the changelog ever grows syntax this does not know, the text
 * still shows: unknown markup degrades to the characters themselves rather
 * than to a blank panel.
 *
 * The notes are written in French, like the release pages they come from, and
 * are not translated: they are authored prose, not interface strings.
 */

function Bold({ text }: { text: string }) {
  // Split on **...** and re-emit, so the emphasis the changelog author put on
  // the important half of each line survives.
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} style={{ color: colors.textBright, fontWeight: 600 }}>{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

interface Block {
  kind: 'heading' | 'item' | 'paragraph'
  text: string
}

function parse(source: string): Block[] {
  const blocks: Block[] = []

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    if (line.startsWith('### ')) {
      blocks.push({ kind: 'heading', text: line.slice(4).trim() })
      continue
    }

    if (line.startsWith('- ')) {
      blocks.push({ kind: 'item', text: line.slice(2).trim() })
      continue
    }

    // An indented continuation belongs to the bullet above it, not to a new
    // block: CHANGELOG.md wraps its lines at 80 columns.
    const last = blocks[blocks.length - 1]
    if (rawLine.startsWith('  ') && last && last.kind === 'item') {
      last.text += ` ${line.trim()}`
      continue
    }

    blocks.push({ kind: 'paragraph', text: line.trim() })
  }

  return blocks
}

export function ReleaseNotes({ source }: { source: string }) {
  const blocks = parse(source)
  if (blocks.length === 0) return null

  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, color: colors.textMuted }}>
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <div
              key={i}
              style={{
                fontSize: 10.5,
                textTransform: 'uppercase',
                letterSpacing: 0.7,
                color: colors.brandMuted,
                margin: i === 0 ? '0 0 8px' : '16px 0 8px'
              }}
            >
              {block.text}
            </div>
          )
        }

        if (block.kind === 'item') {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <span style={{ color: colors.accent, flexShrink: 0, lineHeight: 1.6 }}>·</span>
              <span style={{ minWidth: 0 }}><Bold text={block.text} /></span>
            </div>
          )
        }

        return (
          <p key={i} style={{ margin: '0 0 10px' }}>
            <Bold text={block.text} />
          </p>
        )
      })}
    </div>
  )
}
