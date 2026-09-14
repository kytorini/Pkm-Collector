export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill ${pct === 100 ? 'is-complete' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
