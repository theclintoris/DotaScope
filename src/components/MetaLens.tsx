import { ChevronDown } from 'lucide-react'
import { useMeta } from '../context/MetaContext'
import { POPULATIONS, RANKS } from '../lib/constants'
import { classNames } from '../lib/format'

export function MetaLens() {
  const { bracket, setBracket, population, setPopulation } = useMeta()
  const ranked = population === 'ranked'

  return (
    <div className="meta-lens">
      <div className="topbar-mode" role="group" aria-label="Match population">
        {POPULATIONS.map(({ value, short }) => (
          <button
            key={value}
            type="button"
            className={classNames('topbar-mode-btn', population === value && 'is-active')}
            onClick={() => setPopulation(value)}
            aria-pressed={population === value}
          >
            {short}
          </button>
        ))}
      </div>
      <div className="select-wrap lens-bracket">
        <select
          aria-label="Rank bracket"
          value={ranked ? bracket : ''}
          onChange={(event) => setBracket(Number(event.target.value))}
          disabled={!ranked}
        >
          {!ranked && <option value="">Ranked only</option>}
          {RANKS.map((rank) => <option key={rank.value} value={rank.value}>{rank.label}</option>)}
        </select>
        <ChevronDown size={14} className="select-chevron" aria-hidden="true" />
      </div>
    </div>
  )
}
