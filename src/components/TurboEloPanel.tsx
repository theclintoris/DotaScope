import { ArrowUpRight, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { classNames } from '../lib/format'
import { useTurboElo, type TurboEloPlayer } from '../lib/turboElo'

function rating(value: number) {
  return Math.round(value).toLocaleString()
}

function deltaLabel(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) return 'No change'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}

function sparkPoints(history: { rating: number }[]) {
  const values = history.length ? history.map((point) => point.rating) : [1000]
  if (values.length === 1) values.push(values[0])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 280
      const y = 54 - ((value - min) / range) * 42
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function PlayerName({
  player,
  viewerAccountId,
  viewerName,
}: {
  player: TurboEloPlayer
  viewerAccountId: number | null
  viewerName: string | null
}) {
  const name =
    player.personaname ??
    (viewerName && player.accountId === viewerAccountId ? viewerName : null) ??
    `Player #${player.accountId}`
  if (player.accountId) {
    return <Link to={`/players/${player.accountId}`}>{name}</Link>
  }
  return <span>{name}</span>
}

export function TurboEloPanel({
  accountId,
  playerName,
}: {
  accountId: number | null
  playerName: string | null
}) {
  const { data } = useTurboElo(accountId)
  const player = data?.player
  if (!data || !player) return null
  const positive = player.lastDelta >= 0
  const recent = player.history.slice(-20).reverse()

  return (
    <section className="turbo-elo-panel">
      <div className="turbo-elo-head">
        <div>
          <span className="eyebrow">Turbo Elo · local ladder</span>
          <h2>Your Turbo rating</h2>
        </div>
        <span className="badge badge-muted">
          <Trophy size={12} /> {data.matchesProcessed} parsed matches
        </span>
      </div>

      <div className="turbo-elo-grid">
        <div className="turbo-elo-main">
          <div className="turbo-elo-score-row">
            <div>
              <div className="turbo-elo-rating">{rating(player.rating)}</div>
              <div className={classNames('turbo-elo-delta', positive ? 'is-up' : 'is-down')}>
                {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {deltaLabel(player.lastDelta)} last game
              </div>
            </div>
            <span className="turbo-elo-rank">
              {player.rank != null ? `#${player.rank}` : '—'}
              <small>of {data.playersTracked}</small>
            </span>
          </div>

          <div className="turbo-elo-spark-wrap">
            <svg className="turbo-elo-spark" viewBox="0 0 280 60" role="img" aria-label="Turbo Elo history">
              <polyline points={sparkPoints(player.history)} />
            </svg>
            <div className="turbo-elo-meta">
              <span>Peak {rating(player.peak)}</span>
              <span>{player.wins}–{player.losses} record</span>
              <span>Since {rating(data.baseline)}</span>
            </div>
          </div>

          <div className="turbo-elo-games">
            {recent.length ? (
              recent.slice(0, 5).map((point) => (
                <Link className="turbo-elo-game" key={point.matchId} to={`/matches/${point.matchId}`}>
                  <span className={classNames('turbo-elo-game-dot', point.delta >= 0 ? 'is-up' : 'is-down')}>
                    {point.delta >= 0 ? '+' : ''}{point.delta.toFixed(1)}
                  </span>
                  <span>Match {point.matchId}</span>
                  <ArrowUpRight size={12} />
                </Link>
              ))
            ) : (
              <p className="muted-copy">No parsed Turbo matches in the ledger yet.</p>
            )}
          </div>
        </div>

        <div className="turbo-elo-leaderboard">
          <div className="turbo-elo-leaderboard-head">
            <span className="eyebrow">Top of your lobbies</span>
            <span className="muted-label">All tracked players</span>
          </div>
          <div className="turbo-elo-list">
            {data.leaderboard.slice(0, 7).map((entry) => (
              <div
                className={classNames('turbo-elo-row', entry.accountId === accountId && 'is-you')}
                key={entry.accountId}
              >
                <span className="turbo-elo-place">{entry.rank ?? '—'}</span>
                <span className="turbo-elo-name">
                  <PlayerName player={entry} viewerAccountId={accountId} viewerName={playerName} />
                  <small>{entry.games} games</small>
                </span>
                <strong>{rating(entry.rating)}</strong>
                <span className={classNames('turbo-elo-row-delta', entry.lastDelta >= 0 ? 'is-up' : 'is-down')}>
                  {entry.lastDelta >= 0 ? '+' : ''}{entry.lastDelta.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          {player.rank != null && player.rank > 7 ? (
            <div className="turbo-elo-row is-you turbo-elo-row-self">
              <span className="turbo-elo-place">{player.rank}</span>
              <span className="turbo-elo-name">
                <PlayerName player={player} viewerAccountId={accountId} viewerName={playerName} />
                <small>You</small>
              </span>
              <strong>{rating(player.rating)}</strong>
              <span className={classNames('turbo-elo-row-delta', player.lastDelta >= 0 ? 'is-up' : 'is-down')}>
                {player.lastDelta >= 0 ? '+' : ''}{player.lastDelta.toFixed(1)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <p className="turbo-elo-note">
        <Trophy size={13} /> Every tracked player starts at {rating(data.baseline)}. Ratings use team-average
        Elo (K=32) over locally parsed Turbo games; this is a DotaScope ladder, not Valve MMR. More parsed
        games move the ladder.
      </p>
    </section>
  )
}
