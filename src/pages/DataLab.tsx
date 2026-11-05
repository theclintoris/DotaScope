import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Download,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Table2,
} from 'lucide-react'
import type { ExplorerResponse } from '../types'
import { fetchTableSchema, runExplorer } from '../lib/api'
import { useDocumentTitle } from '../lib/hooks'
import { classNames, formatNumber } from '../lib/format'
import { PageHeader, SectionHeading } from '../components/ui'

type SchemaColumn = { name: string; type: string }

const TABLES = [
  { name: 'heroes', description: 'Reference table for every hero and their attributes.', icon: 'reference' },
  { name: 'items', description: 'Item definitions, costs and qualities.', icon: 'reference' },
  { name: 'leagues', description: 'Tournament leagues indexed by OpenDota.', icon: 'reference' },
  { name: 'teams', description: 'Pro teams, ratings and lifetime records.', icon: 'pro' },
  { name: 'notable_players', description: 'Curated professional player registry.', icon: 'pro' },
  { name: 'matches', description: 'Parsed match headers. One row per match.', icon: 'core' },
  { name: 'player_matches', description: 'Per-player rows for parsed matches — the deep archive.', icon: 'core' },
  { name: 'picks_bans', description: 'Draft order and hero picks/bans per match.', icon: 'core' },
  { name: 'public_matches', description: 'Public match headers; lighter than full match data.', icon: 'core' },
  { name: 'team_match', description: 'Team participation and results per match.', icon: 'pro' },
  { name: 'team_rating', description: 'Historical team rating snapshots.', icon: 'pro' },
  { name: 'match_patch', description: 'Patch mapping for parsed matches.', icon: 'core' },
] as const

const EXAMPLES = [
  {
    title: 'Newest public matches',
    note: 'Inspect the live public feed schema and recent pacing.',
    sql: `SELECT match_id, start_time, duration, radiant_win, game_mode, lobby_type
FROM public_matches
ORDER BY start_time DESC`,
  },
  {
    title: 'Team Elo leaderboard',
    note: 'Teams with a rating, sorted by OpenDota Elo.',
    sql: `SELECT name, tag, rating, wins, losses
FROM teams
WHERE rating > 0
ORDER BY rating DESC`,
  },
  {
    title: 'Hero reference sheet',
    note: 'Attributes, roles and base stats for every hero.',
    sql: `SELECT localized_name, primary_attr, attack_type, roles, base_health, move_speed
FROM heroes
ORDER BY localized_name`,
  },
  {
    title: 'League directory',
    note: 'Most recently indexed leagues and their tiers.',
    sql: `SELECT leagueid, name, tier
FROM leagues
ORDER BY leagueid DESC`,
  },
] as const

const DEFAULT_SQL = EXAMPLES[0].sql

const SAMPLE_QUERY = `-- Every query is read-only and capped at 100 rows.
-- Try joining the reference tables to the archive.
SELECT match_id, start_time, duration, radiant_win
FROM public_matches
ORDER BY start_time DESC`

export function DataLabPage() {
  useDocumentTitle('Data Lab')
  const [sql, setSql] = useState<string>(DEFAULT_SQL)
  const [result, setResult] = useState<ExplorerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [table, setTable] = useState('heroes')
  const [schema, setSchema] = useState<SchemaColumn[]>([])
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const startedAt = useRef(0)

  const activeTable = TABLES.find((entry) => entry.name === table) ?? TABLES[0]
  const columns = useMemo(() => (result?.rows[0] ? Object.keys(result.rows[0]) : []), [result])

  useEffect(() => {
    let cancelled = false
    setSchemaLoading(true)
    setSchemaError(null)
    fetchTableSchema(table)
      .then((rows) => {
        if (!cancelled) setSchema(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setSchema([])
          setSchemaError(cause instanceof Error ? cause.message : 'Could not load table schema.')
        }
      })
      .finally(() => {
        if (!cancelled) setSchemaLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [table])

  const execute = async () => {
    const statement = sql.trim()
    if (!statement || running) return
    setRunning(true)
    setError(null)
    setDownloaded(false)
    startedAt.current = Date.now()
    try {
      const response = await runExplorer(statement)
      setResult(response)
      setElapsed(Date.now() - startedAt.current)
    } catch (cause: unknown) {
      setResult(null)
      setElapsed(Date.now() - startedAt.current)
      setError(cause instanceof Error ? cause.message : 'The query did not return a result.')
    } finally {
      setRunning(false)
    }
  }

  const copyQuery = async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      textareaRef.current?.select()
    }
  }

  const downloadCsv = () => {
    if (!result || !columns.length) return
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const body = [
      columns.map(escape).join(','),
      ...result.rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
    ].join('\n')
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'dotascope-query.csv'
    anchor.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
    window.setTimeout(() => setDownloaded(false), 1600)
  }

  return (
    <div className="page-stack data-lab-page">
      <PageHeader
        eyebrow="OpenDota SQL explorer"
        title="Data Lab"
        description="Ask the archive directly. Write read-only SQL against OpenDota's public Postgres replica, inspect the schema, and export the answer."
        actions={
          <a href="https://www.opendota.com/explorer" target="_blank" rel="noreferrer" className="btn btn-ghost">
            <Database size={14} /> OpenDota explorer
          </a>
        }
      />

      <div className="lab-banner">
        <div className="lab-banner-icon"><Code2 size={19} /></div>
        <div>
          <strong>Read-only by design</strong>
          <p>
            Queries must begin with <code>SELECT</code> or <code>WITH</code>. Dotascope appends a <code>LIMIT 100</code> when you omit one,
            and the public replica is rate limited. Keep exploratory queries narrow.
          </p>
        </div>
        <span className="lab-limit-pill">MAX 100 ROWS</span>
      </div>

      <div className="lab-layout">
        <section className="panel lab-editor-panel">
          <SectionHeading
            eyebrow="Query editor"
            title="Write a statement"
            hint="Ctrl / ⌘ + Enter to run"
            action={
              <div className="lab-editor-actions">
                <button className="icon-btn" onClick={copyQuery} title="Copy query">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button className="icon-btn" onClick={() => { setSql(SAMPLE_QUERY); textareaRef.current?.focus() }} title="Load starter query">
                  <RefreshCw size={14} />
                </button>
              </div>
            }
          />
          <div className="sql-editor">
            <div className="sql-editor-bar">
              <span><span className="editor-dot is-red" /><span className="editor-dot is-amber" /><span className="editor-dot is-green" /></span>
              <span className="sql-editor-title">dotascope.sql</span>
              <span className="sql-editor-mode">POSTGRES · READ ONLY</span>
            </div>
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void execute()
                }
              }}
              spellCheck={false}
              aria-label="SQL query"
            />
          </div>
          <div className="lab-run-row">
            <button className="btn btn-primary" onClick={() => void execute()} disabled={running || !sql.trim()}>
              {running ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
              {running ? 'Running query…' : 'Run query'}
            </button>
            <span className="lab-run-meta">
              {running ? 'Waiting on OpenDota…' : elapsed !== null ? `Last run ${formatNumber(elapsed)} ms` : 'Results are cached only in this tab'}
            </span>
          </div>

          <div className="lab-examples">
            <span className="eyebrow">Starting points</span>
            <div className="lab-example-grid">
              {EXAMPLES.map((example) => (
                <button
                  className="lab-example"
                  key={example.title}
                  onClick={() => { setSql(example.sql); textareaRef.current?.focus() }}
                >
                  <span>{example.title}</span>
                  <p>{example.note}</p>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="panel lab-schema-panel">
          <SectionHeading eyebrow="Schema" title="Public tables" hint={`${TABLES.length} tables`} />
          <div className="schema-table-list">
            {TABLES.map((entry) => (
              <button
                key={entry.name}
                className={classNames('schema-table', table === entry.name && 'is-active')}
                onClick={() => setTable(entry.name)}
              >
                <Table2 size={13} />
                <span>{entry.name}</span>
                <ChevronRight size={12} />
              </button>
            ))}
          </div>

          <div className="schema-detail">
            <div className="schema-detail-head">
              <div>
                <span className="eyebrow">Selected table</span>
                <h3>{activeTable.name}</h3>
              </div>
              {schemaLoading && <Loader2 size={14} className="spin" />}
            </div>
            <p>{activeTable.description}</p>
            {schemaError ? (
              <div className="inline-error"><AlertTriangle size={13} /> {schemaError}</div>
            ) : schemaLoading ? (
              <div className="schema-columns">
                {[0, 1, 2, 3, 4, 5].map((key) => <span key={key} className="skeleton" style={{ height: 20 }} />)}
              </div>
            ) : (
              <div className="schema-columns">
                {schema.map((column) => (
                  <div className="schema-column" key={column.name}>
                    <code>{column.name}</code>
                    <span>{column.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="aside-note">
            <Info size={14} />
            <p>
              Schema metadata is fetched through the same read-only endpoint. Large joins over{' '}
              <code>player_matches</code> can exceed the API timeout — constrain by time or match id first.
            </p>
          </div>
        </aside>
      </div>

      <section className="panel lab-results-panel">
        <SectionHeading
          eyebrow="Output"
          title="Query results"
          hint={result ? `${formatNumber(result.rowCount)} rows returned` : 'No query executed yet'}
          action={
            <button className="btn btn-ghost btn-sm" onClick={downloadCsv} disabled={!columns.length}>
              {downloaded ? <Check size={13} /> : <Download size={13} />} {downloaded ? 'Saved CSV' : 'Export CSV'}
            </button>
          }
        />

        {error ? (
          <div className="query-error">
            <AlertTriangle size={17} />
            <div>
              <strong>Query failed</strong>
              <p>{error}</p>
              <span>Check column names in the schema panel, then try again.</span>
            </div>
          </div>
        ) : !result ? (
          <div className="result-empty">
            <div className="result-empty-icon"><Sparkles size={21} /></div>
            <h3>Your result set will appear here</h3>
            <p>Run the starter query or write your own. Results are tabular and exportable as CSV.</p>
            <div className="result-empty-keys">
              <span><kbd>SELECT</kbd> read rows</span>
              <span><kbd>WHERE</kbd> narrow the archive</span>
              <span><kbd>LIMIT</kbd> stay under 100</span>
            </div>
          </div>
        ) : result.rows.length === 0 ? (
          <div className="result-empty">
            <div className="result-empty-icon"><Table2 size={21} /></div>
            <h3>No rows matched</h3>
            <p>The query ran successfully but returned an empty set. Broaden your filters or check the time range.</p>
          </div>
        ) : (
          <div className="result-table-wrap">
            <table className="result-table">
              <thead>
                <tr>
                  <th className="result-index">#</th>
                  {columns.map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index}>
                    <td className="result-index">{index + 1}</td>
                    {columns.map((column) => (
                      <td key={column}>{formatCell(row[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="panel-footnote">
          Free OpenDota access supports roughly 60 requests per minute. The explorer also has server-side statement limits;
          export a smaller result set if a query times out.
        </p>
      </section>
    </div>
  )
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return <span className="cell-null">null</span>
  if (typeof value === 'boolean') return <span className={value ? 'cell-bool-true' : 'cell-bool-false'}>{String(value)}</span>
  if (typeof value === 'object') return <code>{JSON.stringify(value)}</code>
  return String(value)
}
