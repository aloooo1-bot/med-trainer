export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-surface-4 bg-surface-1 p-5">
      <h2 className="eyebrow mb-4">{title}</h2>
      {children}
    </div>
  )
}
