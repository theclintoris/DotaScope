import { useEffect } from 'react'
import { BadgeCheck, MonitorDown, MoreVertical, Share, Smartphone, X } from 'lucide-react'
import { useLockBodyScroll } from '../lib/hooks'
import { LogoMark } from './Brand'

function platformHint(): 'android' | 'ios' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent.toLowerCase()
  if (/android/.test(ua)) return 'android'
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  return 'desktop'
}

export function InstallDialog({
  open,
  onClose,
  canInstall,
  installed,
  onInstall,
}: {
  open: boolean
  onClose: () => void
  canInstall: boolean
  installed: boolean
  onInstall: () => Promise<boolean>
}) {
  useLockBodyScroll(open)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const platform = platformHint()

  return (
    <div className="overlay modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Close install guide">
          <X size={18} />
        </button>
        <div className="install-mark">
          <LogoMark size={52} />
        </div>
        <span className="eyebrow">Install · PC &amp; Android</span>
        <h2 id="install-title">Put DotaScope on your home screen</h2>
        <p className="install-lede">
          DotaScope is an installable web app. It opens like a native app on Windows, Android, and
          anything else with a modern browser — same data, no store required.
        </p>

        {installed ? (
          <div className="install-installed">
            <BadgeCheck size={19} /> DotaScope is already installed on this device.
          </div>
        ) : (
          <div className="install-platforms">
            <div className={`install-platform ${platform === 'desktop' ? 'is-current' : ''}`}>
              <span className="install-platform-icon">
                <MonitorDown size={19} />
              </span>
              <div>
                <strong>Windows · Chrome / Edge</strong>
                <p>Use the install icon in the address bar, or open the browser menu → Install DotaScope.</p>
              </div>
            </div>
            <div className={`install-platform ${platform === 'android' ? 'is-current' : ''}`}>
              <span className="install-platform-icon">
                <Smartphone size={19} />
              </span>
              <div>
                <strong>Android · Chrome</strong>
                <p>Open the ⋮ menu → Add to Home screen / Install app. DotaScope gets its own launcher icon.</p>
              </div>
            </div>
            <div className={`install-platform ${platform === 'ios' ? 'is-current' : ''}`}>
              <span className="install-platform-icon">
                <Share size={19} />
              </span>
              <div>
                <strong>iPhone / iPad · Safari</strong>
                <p>Tap Share → Add to Home Screen. Full-screen layout is supported.</p>
              </div>
            </div>
          </div>
        )}

        <div className="install-actions">
          {canInstall && !installed && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void onInstall().then((accepted) => {
                  if (accepted) onClose()
                })
              }}
            >
              <MonitorDown size={15} /> Install now
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {installed ? 'Close' : 'Maybe later'}
          </button>
        </div>
        <p className="install-note">
          <MoreVertical size={12} /> Installation requires a secure origin (HTTPS or localhost). The deployed
          build is installable; live data is cached for offline viewing after the first load.
        </p>
      </div>
    </div>
  )
}
