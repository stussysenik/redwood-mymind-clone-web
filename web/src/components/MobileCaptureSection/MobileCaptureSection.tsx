import { useState } from 'react'

import { useQuery, useMutation } from '@redwoodjs/web'
import { Smartphone, Copy, Trash2, ExternalLink } from 'lucide-react'

import {
  API_TOKENS_QUERY,
  GENERATE_API_TOKEN_MUTATION,
  REVOKE_API_TOKEN_MUTATION,
} from 'src/graphql/apiTokens'

type ApiTokenRow = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const SHORTCUT_URL =
  (typeof process !== 'undefined' && process.env.REDWOOD_ENV_BYOA_SHORTCUT_URL) ||
  ''

export default function MobileCaptureSection() {
  const { data, refetch } = useQuery<{ apiTokens: ApiTokenRow[] }>(API_TOKENS_QUERY)
  const [generateMutation, { loading: generating }] = useMutation(
    GENERATE_API_TOKEN_MUTATION
  )
  const [revokeMutation] = useMutation(REVOKE_API_TOKEN_MUTATION)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deviceName, setDeviceName] = useState('iPhone')
  const [freshPlaintext, setFreshPlaintext] = useState<string | null>(null)

  async function handleCreate() {
    if (!deviceName.trim()) return
    const result = await generateMutation({ variables: { name: deviceName.trim() } })
    const plaintext = (result.data as any)?.generateApiToken?.plaintext
    if (plaintext) {
      setFreshPlaintext(plaintext)
      await refetch()
    }
  }

  async function handleCopy() {
    if (!freshPlaintext) return
    try {
      await navigator.clipboard.writeText(freshPlaintext)
    } catch {
      // clipboard may not be available in test env
    }
  }

  function handleCloseDialog() {
    setDialogOpen(false)
    setFreshPlaintext(null)
    setDeviceName('iPhone')
  }

  async function handleRevoke(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Revoke this token? The Shortcut using it will stop working.')) {
      return
    }
    await revokeMutation({ variables: { id } })
    await refetch()
  }

  const tokens = data?.apiTokens ?? []

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-center gap-3">
        <Smartphone className="h-5 w-5" />
        <h2 className="text-lg">Mobile Capture</h2>
      </div>
      <p className="mb-4 text-sm opacity-70">
        Capture from any iOS app via the BYOA Shortcut. Generate a token below, then
        install the Shortcut on your iPhone and paste the token on first run.
      </p>

      {SHORTCUT_URL && (
        <a
          href={SHORTCUT_URL}
          target="_blank"
          rel="noreferrer"
          className="mb-4 inline-flex items-center gap-2 text-sm underline"
        >
          <ExternalLink className="h-4 w-4" />
          Download BYOA Shortcut
        </a>
      )}

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded border px-3 py-1 text-sm"
        >
          Generate token
        </button>
      </div>

      {tokens.length === 0 && (
        <p className="text-sm opacity-70">No active tokens yet.</p>
      )}

      {tokens.length > 0 && (
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-medium">{t.name}</div>
                <div className="font-mono text-xs opacity-60">
                  byoa_{t.prefix}_•••••
                </div>
                <div className="text-xs opacity-60">
                  {t.lastUsedAt
                    ? `Last used ${new Date(t.lastUsedAt).toLocaleString()}`
                    : 'Never used'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(t.id)}
                className="inline-flex items-center gap-1 text-sm text-red-600"
                aria-label={`Revoke ${t.name}`}
              >
                <Trash2 className="h-4 w-4" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            {!freshPlaintext && (
              <>
                <h3 className="mb-3 text-lg">New token</h3>
                <label className="mb-1 block text-sm" htmlFor="device-name-input">
                  Device name
                </label>
                <input
                  id="device-name-input"
                  className="mb-4 w-full rounded border px-3 py-2"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={handleCloseDialog}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={generating || !deviceName.trim()}
                    className="rounded border px-3 py-1"
                  >
                    Create
                  </button>
                </div>
              </>
            )}

            {freshPlaintext && (
              <>
                <h3 className="mb-3 text-lg">Token created</h3>
                <p className="mb-3 text-sm font-semibold text-red-600">
                  This is the only time you&apos;ll see this token. Copy it now
                  and paste it into your BYOA Shortcut.
                </p>
                <div className="mb-3 break-all rounded border bg-gray-50 p-3 font-mono text-xs">
                  {freshPlaintext}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseDialog}
                    className="rounded border px-3 py-1"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
