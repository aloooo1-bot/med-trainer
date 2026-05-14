export function Badge({ text, color = 'blue' }: { text: string; color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' }) {
  const colors = {
    blue:   'bg-primary-50 text-primary-700 border-primary-200',
    green:  'bg-confirmed-bg text-confirmed border-confirmed-border',
    yellow: 'bg-caution-bg text-caution border-caution-border',
    red:    'bg-critical-bg text-critical border-critical-border',
    purple: 'bg-insight-bg text-insight border-insight-border',
  }
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${colors[color]}`}>
      {text}
    </span>
  )
}
