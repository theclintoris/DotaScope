import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Eye, EyeOff, KeyRound, LockKeyhole, Trash2, X } from 'lucide-react'
import { useLockBodyScroll } from '../lib/hooks'
import { getOpenDotaKey, setOpenDotaKey } from '../lib/settings'

interface ApiKeyDialogProps {
  open: boolean
  onClose: () => void
}

export function ApiKeyDialog({ open, onClose }: ApiKeyDialogProps) {
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    setValue(getOpenDotaKey())
    setVisible(false)
    setSaved(false)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  function save() {
    setOpenDotaKey(value)
    setSaved(true)
    window.setTimeout(() => {
      window.location.reload()
    }, 450)
  }

  function clear() {
    setOpenDotaKey('')
    setValue('')
    setSaved(true)
    window.setTimeout(() => {
      window.location.reload()
    }, 450)
  }

  return (
    <div
      className="overlay modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal api-key-dialog" role="dialog" aria-modal="true" aria-labelledby="api-key-title">
        <button className="modal-close" onClick={onClose} aria-label="Close API key settings">
          <X size={17} />
        </button>

        <span className="eyebrow"><KeyRound size={13} /> OpenDota connection</span>
        <h2 id="api-key-title">Bring your own key.</h2>
        <p className="api-key-lede">
          OpenDota&apos;s free API covers the public meta sample. A personal API key raises your
          rate limit and unlocks request-on-demand replay parsing for deeper match data.
        </p>

        <label className="api-key-label" htmlFor="opendota-api-key">API key</label>
        <div className="api-key-field">
          <LockKeyhole size={15} />
          <input
            ref={inputRef}
            id="opendota-api-key"
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setSaved(false)
            }}
            placeholder="Paste your OpenDota API key"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide API key' : 'Show API key'}
            title={visible ? 'Hide key' : 'Show key'}
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <div className="api-key-actions">
          <button className="btn btn-primary" onClick={save} disabled={!value.trim() || saved}>
            {saved ? 'Saved' : 'Save key'}
          </button>
          {getOpenDotaKey() && (
            <button className="btn btn-quiet" onClick={clear}>
              <Trash2 size={14} /> Remove key
            </button>
          )}
        </div>

        <p className="api-key-note">
          The key is stored only in this browser/device. It is sent directly to OpenDota and
          never logged or uploaded anywhere else. Treat it like a password.
        </p>
        <a
          className="text-link api-key-link"
          href="https://www.opendota.com/api-keys"
          target="_blank"
          rel="noreferrer"
        >
          Get an OpenDota API key <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}
