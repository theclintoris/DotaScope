import { Link } from 'react-router-dom'
import { ArrowLeft, Compass, Search, Swords } from 'lucide-react'
import { useDocumentTitle } from '../lib/hooks'
import { LogoMark } from '../components/Brand'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="not-found">
      <div className="not-found-grid" aria-hidden="true" />
      <div className="not-found-scope" aria-hidden="true">
        <span className="not-found-ring ring-one" />
        <span className="not-found-ring ring-two" />
        <span className="not-found-ring ring-three" />
        <Compass size={42} />
      </div>
      <div className="not-found-copy">
        <span className="eyebrow">Signal lost · 404</span>
        <h1>Off the map.</h1>
        <p>
          This coordinate doesn't exist in the archive. The lane may have been renamed, the match
          unparsed, or the page moved.
        </p>
        <div className="not-found-actions">
          <Link to="/" className="btn btn-primary"><ArrowLeft size={14} /> Back to overview</Link>
          <Link to="/heroes" className="btn btn-ghost"><Swords size={14} /> Browse heroes</Link>
          <Link to="/players" className="btn btn-ghost"><Search size={14} /> Find a player</Link>
        </div>
        <div className="not-found-brand">
          <LogoMark />
          <span>DOTASCOPE · META INTELLIGENCE</span>
        </div>
      </div>
    </div>
  )
}
