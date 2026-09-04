export function ProgressBar({ value, total, tone = 'default' }: { value: number; total: number; tone?: 'default' | 'gold' }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill ${pct === 100 ? 'is-complete' : ''} tone-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
