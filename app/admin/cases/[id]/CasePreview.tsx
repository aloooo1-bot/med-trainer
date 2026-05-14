import { ROS_CATEGORIES } from '../../../lib/rosDetector'

// ──────────────────────────────────────────────────────────────────────────────
// Local type (mirrors app/trainer/page.tsx:121-172, defensive subset)
// ──────────────────────────────────────────────────────────────────────────────

interface LabComponent {
  name: string
  value: string
  unit: string
  referenceRange: string
  status: 'normal' | 'abnormal' | 'critical'
}

interface LabResult {
  components?: LabComponent[]
  result?: string; value?: string; unit?: string; referenceRange?: string; status?: string
}

interface RelevantTest {
  name: string
  category?: string
  isImaging?: boolean
  labResult?: LabResult
  imagingResult?: string
}

interface CaseDataShape {
  patientInfo?: { name?: string; age?: number; gender?: string; chiefComplaint?: string; height?: string; heightInches?: number }
  vitals?: { bp?: string; hr?: number; rr?: number; temp?: number; spo2?: number; weight?: string }
  hpi?: string; clinicalHpi?: string; advancedHpi?: string
  pastMedicalHistory?: { conditions?: string; surgeries?: string; hospitalizations?: string }
  currentMedications?: { medications?: string; otc?: string }
  socialHistory?: { smoking?: string; alcohol?: string; drugs?: string; occupation?: string; living?: string; other?: string }
  reviewOfSystems?: Record<string, string>
  physicalExam?: Record<string, string>
  availableLabs?: string[]
  availableImaging?: string[]
  labResults?: Record<string, LabResult>
  imagingResults?: Record<string, string>
  procedureResults?: Record<string, string>
  ecgFindings?: string; hematologyFindings?: string; urineFindings?: string
  skinFindings?: string; fundusFindings?: string; biopsyFindings?: string
  diagnosis?: string
  differentials?: string[]
  teachingPoints?: string[]
  keyQuestions?: string[]
  expectedLabs?: string[]
  expectedImaging?: string[]
  hiddenHistory?: { fullHistory?: string; socialHistory?: string; familyHistory?: string; medications?: string; hiddenSymptoms?: string; allergies?: string }
  relevantTests?: RelevantTest[]
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers (adapted from app/trainer/page.tsx:657-688)
// ──────────────────────────────────────────────────────────────────────────────

function parseDirection(valueStr: string, refRange: string): 'high' | 'low' | null {
  const val = parseFloat(valueStr)
  if (isNaN(val)) return null
  const r = refRange.trim()
  const rangeMatch = r.match(/^([\d.]+)\s*[-–]\s*([\d.]+)$/)
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1]), hi = parseFloat(rangeMatch[2])
    if (!isNaN(lo) && !isNaN(hi)) return val > hi ? 'high' : val < lo ? 'low' : null
  }
  const upperMatch = r.match(/^[<≤]\s*([\d.]+)$/)
  if (upperMatch) { const hi = parseFloat(upperMatch[1]); return (!isNaN(hi) && val > hi) ? 'high' : null }
  const lowerMatch = r.match(/^[>≥]\s*([\d.]+)$/)
  if (lowerMatch) { const lo = parseFloat(lowerMatch[1]); return (!isNaN(lo) && val < lo) ? 'low' : null }
  return null
}

function getVitalStatus(label: string, value: string): { abnormal: boolean; direction: 'high' | 'low' | null } {
  const n = Number(value)
  if (label === 'HR')   return n > 100 ? { abnormal: true, direction: 'high' } : n < 60  ? { abnormal: true, direction: 'low' } : { abnormal: false, direction: null }
  if (label === 'RR')   return n > 20  ? { abnormal: true, direction: 'high' } : n < 12  ? { abnormal: true, direction: 'low' } : { abnormal: false, direction: null }
  if (label === 'Temp') return n > 99.5 ? { abnormal: true, direction: 'high' } : n < 97 ? { abnormal: true, direction: 'low' } : { abnormal: false, direction: null }
  if (label === 'SpO₂') return n < 95 ? { abnormal: true, direction: 'low' } : { abnormal: false, direction: null }
  if (label === 'BP') {
    const parts = value.replace(/[^\d/]/g, '').split('/')
    const sys = parseInt(parts[0] ?? ''), dia = parseInt(parts[1] ?? '')
    if (!isNaN(sys) && !isNaN(dia)) {
      if (sys > 139 || dia > 89) return { abnormal: true, direction: 'high' }
      if (sys < 90  || dia < 60) return { abnormal: true, direction: 'low' }
    }
  }
  return { abnormal: false, direction: null }
}

function coalesceComponents(result: LabResult): LabComponent[] {
  if (result.components && result.components.length > 0) return result.components
  const name = ''
  const value = result.result ?? result.value ?? ''
  const unit = result.unit ?? ''
  const referenceRange = result.referenceRange ?? '—'
  const status = (result.status ?? 'normal') as LabComponent['status']
  if (!value) return []
  return [{ name, value, unit, referenceRange, status }]
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary mb-3">{children}</h3>
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-surface-3 bg-surface-1 p-5">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

export default function CasePreview({ caseData, difficulty }: {
  caseData: Record<string, unknown> | null
  difficulty: string
}) {
  if (!caseData) {
    return (
      <section className="rounded-lg border border-surface-3 bg-surface-1 px-5 py-8 text-center text-xs text-ink-tertiary">
        Empty case slot — no case data generated yet.
      </section>
    )
  }

  const d = caseData as unknown as CaseDataShape
  const pi = d.patientInfo ?? {}
  const v  = d.vitals ?? {}

  // Pick HPI variant
  const hpiText = difficulty === 'Advanced' ? (d.advancedHpi ?? d.clinicalHpi ?? d.hpi)
                : difficulty === 'Clinical'  ? (d.clinicalHpi ?? d.hpi)
                : d.hpi

  // BMI helper
  const bmi = (() => {
    const h = pi.heightInches
    const wStr = (v.weight ?? '').replace(/[^\d.]/g, '')
    const w = parseFloat(wStr)
    if (h && w && h > 0) return ((w / (h * h)) * 703).toFixed(1)
    return null
  })()

  // Vitals strip data
  const vitalItems: Array<{ label: string; value: string }> = [
    { label: 'BP',   value: v.bp   != null ? String(v.bp)   : '' },
    { label: 'HR',   value: v.hr   != null ? String(v.hr)   : '' },
    { label: 'RR',   value: v.rr   != null ? String(v.rr)   : '' },
    { label: 'Temp', value: v.temp != null ? String(v.temp) : '' },
    { label: 'SpO₂', value: v.spo2 != null ? String(v.spo2) : '' },
    { label: 'Wt',   value: v.weight ?? '' },
  ].filter(x => x.value)

  // ROS ordered by canonical categories then any extras
  const ros = d.reviewOfSystems ?? {}
  const rosOrdered: Array<[string, string]> = []
  for (const cat of ROS_CATEGORIES) {
    if (ros[cat]) rosOrdered.push([cat, ros[cat]])
  }
  for (const [k, v] of Object.entries(ros)) {
    if (!ROS_CATEGORIES.includes(k as never) && v) rosOrdered.push([k, v])
  }

  // Differentials with optional explanations
  const differentials = d.differentials ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diffExplanations: string[] = (caseData as any).differentialExplanations ?? []

  // *Findings fields
  const findingsEntries: Array<{ label: string; text: string }> = [
    { label: 'ECG', text: d.ecgFindings ?? '' },
    { label: 'Blood smear', text: d.hematologyFindings ?? '' },
    { label: 'Urine micro', text: d.urineFindings ?? '' },
    { label: 'Dermoscopy / skin biopsy', text: d.skinFindings ?? '' },
    { label: 'Fundus', text: d.fundusFindings ?? '' },
    { label: 'H&E biopsy', text: d.biopsyFindings ?? '' },
  ].filter(f => f.text.trim())

  const labEntries   = Object.entries(d.labResults ?? {})
  const imgEntries   = Object.entries(d.imagingResults ?? {})
  const procEntries  = Object.entries(d.procedureResults ?? {})
  const relTests     = d.relevantTests ?? []
  const hh           = d.hiddenHistory
  const pmh          = d.pastMedicalHistory
  const meds         = d.currentMedications
  const soc          = d.socialHistory

  return (
    <div className="space-y-4">

      {/* ── Patient banner ── */}
      <Card title="Patient">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold text-ink-primary">{pi.name ?? '—'}</span>
          <span className="text-ink-secondary">{pi.age != null ? `${pi.age} y/o` : ''} {pi.gender ?? ''}</span>
          {pi.height  && <span className="text-ink-tertiary text-xs">{pi.height}</span>}
          {v.weight   && <span className="text-ink-tertiary text-xs">{v.weight}</span>}
          {bmi        && <span className="text-ink-tertiary text-xs">BMI {bmi}</span>}
        </div>
        {pi.chiefComplaint && (
          <div className="mt-2">
            <span className="inline-block rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-secondary">
              CC: {pi.chiefComplaint}
            </span>
          </div>
        )}
      </Card>

      {/* ── Vitals strip ── */}
      {vitalItems.length > 0 && (
        <Card title="Vitals">
          <div className="flex flex-wrap gap-4">
            {vitalItems.map(({ label, value }) => {
              const stat = label !== 'Wt' ? getVitalStatus(label, value) : { abnormal: false, direction: null }
              const color = stat.abnormal ? 'text-yellow-400' : 'text-ink-primary'
              const arrow = stat.direction === 'high' ? ' ↑' : stat.direction === 'low' ? ' ↓' : ''
              return (
                <div key={label} className="text-center min-w-[48px]">
                  <div className="text-[10px] text-ink-tertiary mb-0.5">{label}</div>
                  <div className={`text-sm font-mono font-semibold ${color}`}>{value}{arrow}</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── HPI ── */}
      {hpiText && (
        <Card title={`HPI (${difficulty})`}>
          <p className="text-sm leading-relaxed text-ink-secondary">{hpiText}</p>
          {(d.clinicalHpi || d.advancedHpi) && (
            <div className="mt-3 space-y-2 border-t border-surface-3 pt-3">
              {[
                { label: 'Foundations', text: d.hpi },
                { label: 'Clinical',    text: d.clinicalHpi },
                { label: 'Advanced',    text: d.advancedHpi },
              ].filter(x => x.text && x.label !== difficulty).map(({ label, text }) => (
                <p key={label} className="text-xs text-ink-tertiary"><span className="text-ink-tertiary">{label}:</span> {text}</p>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Background history ── */}
      {(pmh || meds || soc) && (
        <Card title="Background History">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
            {pmh && (
              <div>
                <div className="text-ink-tertiary font-medium mb-1">Past Medical History</div>
                {[['Conditions', pmh.conditions], ['Surgeries', pmh.surgeries], ['Hospitalizations', pmh.hospitalizations]].filter(([, v]) => v).map(([l, v]) => (
                  <p key={l as string} className="text-ink-secondary mb-0.5"><span className="text-ink-tertiary">{l}: </span>{v}</p>
                ))}
              </div>
            )}
            {meds && (
              <div>
                <div className="text-ink-tertiary font-medium mb-1">Medications</div>
                {[['Rx', meds.medications], ['OTC', meds.otc]].filter(([, v]) => v).map(([l, v]) => (
                  <p key={l as string} className="text-ink-secondary mb-0.5"><span className="text-ink-tertiary">{l}: </span>{v}</p>
                ))}
              </div>
            )}
            {soc && (
              <div>
                <div className="text-ink-tertiary font-medium mb-1">Social History</div>
                {[
                  ['Smoking', soc.smoking], ['Alcohol', soc.alcohol], ['Drugs', soc.drugs],
                  ['Occupation', soc.occupation], ['Living', soc.living], ['Other', soc.other],
                ].filter(([, v]) => v).map(([l, v]) => (
                  <p key={l as string} className="text-ink-secondary mb-0.5"><span className="text-ink-tertiary">{l}: </span>{v}</p>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Review of Systems ── */}
      {rosOrdered.length > 0 && (
        <Card title="Review of Systems">
          <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-2 text-xs">
            {rosOrdered.map(([cat, text]) => (
              <div key={cat}>
                <span className="text-ink-tertiary font-medium">{cat}: </span>
                <span className="text-ink-secondary">{text}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Physical Exam ── */}
      {Object.keys(d.physicalExam ?? {}).length > 0 && (
        <Card title="Physical Exam">
          <div className="space-y-1.5 text-xs">
            {Object.entries(d.physicalExam!).map(([sys, finding]) => (
              <div key={sys}>
                <span className="text-ink-tertiary font-medium">{sys}: </span>
                <span className="text-ink-secondary">{finding}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Available workup ── */}
      {((d.availableLabs?.length ?? 0) > 0 || (d.availableImaging?.length ?? 0) > 0) && (
        <Card title="Available Workup">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
            {(d.availableLabs?.length ?? 0) > 0 && (
              <div>
                <div className="text-ink-tertiary font-medium mb-1">Labs</div>
                <ul className="space-y-0.5">
                  {d.availableLabs!.map(t => <li key={t} className="text-ink-secondary">{t}</li>)}
                </ul>
              </div>
            )}
            {(d.availableImaging?.length ?? 0) > 0 && (
              <div>
                <div className="text-ink-tertiary font-medium mb-1">Imaging / Procedures</div>
                <ul className="space-y-0.5">
                  {d.availableImaging!.map(t => <li key={t} className="text-ink-secondary">{t}</li>)}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Lab results ── */}
      {labEntries.length > 0 && (
        <Card title="Lab Results">
          <div className="space-y-4">
            {labEntries.map(([panelName, result]) => {
              const components = coalesceComponents(result)
              if (components.length === 0) return null
              return (
                <div key={panelName}>
                  <div className="text-xs font-medium text-ink-secondary mb-1.5">{panelName}</div>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-ink-tertiary text-left border-b border-surface-3">
                        <th className="py-1 pr-4 font-medium">Test</th>
                        <th className="py-1 pr-4 font-medium">Value</th>
                        <th className="py-1 pr-4 font-medium">Unit</th>
                        <th className="py-1 pr-4 font-medium">Ref Range</th>
                        <th className="py-1 font-medium text-right">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {components.map((comp, i) => {
                        const dir = parseDirection(comp.value, comp.referenceRange)
                        const isCrit = comp.status === 'critical'
                        const isAbn  = comp.status === 'abnormal'
                        const flagColor = isCrit ? 'text-red-400' : isAbn ? 'text-yellow-400' : 'text-ink-tertiary'
                        const valColor  = isCrit ? 'text-red-300' : isAbn ? 'text-yellow-300' : 'text-ink-primary'
                        const flag = isCrit ? 'CRIT' : dir === 'high' ? '↑' : dir === 'low' ? '↓' : isAbn ? 'A' : ''
                        return (
                          <tr key={i} className="border-b border-surface-3/40">
                            <td className="py-1 pr-4 text-ink-secondary">{comp.name}</td>
                            <td className={`py-1 pr-4 font-mono font-semibold ${valColor}`}>{comp.value}</td>
                            <td className="py-1 pr-4 text-ink-tertiary">{comp.unit}</td>
                            <td className="py-1 pr-4 text-ink-tertiary">{comp.referenceRange}</td>
                            <td className={`py-1 font-mono font-bold text-right ${flagColor}`}>{flag}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── Imaging results ── */}
      {imgEntries.length > 0 && (
        <Card title="Imaging Results">
          <div className="space-y-3">
            {imgEntries.map(([name, report]) => (
              <div key={name}>
                <div className="text-xs font-medium text-ink-secondary mb-1">{name}</div>
                <p className="text-xs leading-relaxed text-ink-secondary">{report}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Procedure results ── */}
      {procEntries.length > 0 && (
        <Card title="Procedure Results">
          <div className="space-y-3">
            {procEntries.map(([name, report]) => (
              <div key={name}>
                <div className="text-xs font-medium text-ink-secondary mb-1">{name}</div>
                <p className="text-xs leading-relaxed text-ink-secondary">{report}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── *Findings (special-modality text) ── */}
      {findingsEntries.length > 0 && (
        <Card title="Modality Findings">
          <div className="space-y-3">
            {findingsEntries.map(({ label, text }) => (
              <div key={label}>
                <div className="text-xs font-medium text-ink-secondary mb-1">{label}</div>
                <p className="text-xs leading-relaxed text-ink-secondary">{text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Diagnosis ── */}
      {d.diagnosis && (
        <Card title="Diagnosis & Differentials">
          <div className="mb-4">
            <div className="text-xs text-ink-tertiary mb-1">Final Diagnosis</div>
            <div className="text-sm font-semibold text-green-400">{d.diagnosis}</div>
          </div>
          {differentials.length > 0 && (
            <div>
              <div className="text-xs text-ink-tertiary mb-2">Differentials</div>
              <ol className="space-y-2">
                {differentials.map((dx, i) => (
                  <li key={i} className="text-xs">
                    <span className="text-ink-primary font-medium">{i + 1}. {dx}</span>
                    {diffExplanations[i] && (
                      <p className="mt-0.5 text-ink-tertiary leading-relaxed">{diffExplanations[i]}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}

      {/* ── Teaching points + Key questions ── */}
      {((d.teachingPoints?.length ?? 0) > 0 || (d.keyQuestions?.length ?? 0) > 0) && (
        <Card title="Teaching">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
            {(d.teachingPoints?.length ?? 0) > 0 && (
              <div>
                <div className="text-ink-tertiary font-medium mb-2">Teaching Points</div>
                <ul className="space-y-1">
                  {d.teachingPoints!.map((p, i) => (
                    <li key={i} className="flex gap-2 text-ink-secondary"><span className="text-ink-tertiary shrink-0">•</span>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {(d.keyQuestions?.length ?? 0) > 0 && (
              <div>
                <div className="text-ink-tertiary font-medium mb-2">Key Questions</div>
                <ul className="space-y-1">
                  {d.keyQuestions!.map((q, i) => (
                    <li key={i} className="flex gap-2 text-ink-secondary"><span className="text-ink-tertiary shrink-0">•</span>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Expected workup ── */}
      {((d.expectedLabs?.length ?? 0) > 0 || (d.expectedImaging?.length ?? 0) > 0) && (
        <Card title="Expected Workup (Grader)">
          <div className="flex flex-wrap gap-1.5">
            {[...(d.expectedLabs ?? []), ...(d.expectedImaging ?? [])].map(t => (
              <span key={t} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-secondary">{t}</span>
            ))}
          </div>
        </Card>
      )}

      {/* ── Relevant tests (advanced) ── */}
      {relTests.length > 0 && (
        <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
          <details>
            <summary className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary cursor-pointer select-none hover:text-ink-secondary">
              Relevant / Specialty Tests ({relTests.length})
            </summary>
            <div className="px-5 pb-5 space-y-4 text-xs">
              {relTests.map((t, i) => {
                const comps = t.labResult ? coalesceComponents(t.labResult) : []
                return (
                  <div key={i} className="border-t border-surface-3 pt-3 first:border-0 first:pt-0">
                    <div className="font-medium text-ink-secondary mb-0.5">{t.name}</div>
                    {t.category && <div className="text-ink-tertiary mb-1">{t.category} · {t.isImaging ? 'Imaging' : 'Lab'}</div>}
                    {comps.length > 0 && (
                      <table className="w-full border-collapse">
                        <tbody>
                          {comps.map((c, j) => {
                            const dir = parseDirection(c.value, c.referenceRange)
                            const isCrit = c.status === 'critical'
                            const isAbn  = c.status === 'abnormal'
                            const flag = isCrit ? 'CRIT' : dir === 'high' ? '↑' : dir === 'low' ? '↓' : isAbn ? 'A' : ''
                            const valCls = isCrit ? 'text-red-300' : isAbn ? 'text-yellow-300' : 'text-ink-primary'
                            const flagCls = isCrit ? 'text-red-400' : isAbn ? 'text-yellow-400' : 'text-ink-tertiary'
                            return (
                              <tr key={j} className="border-b border-surface-3/40">
                                <td className="py-0.5 pr-4 text-ink-secondary">{c.name}</td>
                                <td className={`py-0.5 pr-4 font-mono font-semibold ${valCls}`}>{c.value}</td>
                                <td className="py-0.5 pr-4 text-ink-tertiary">{c.unit}</td>
                                <td className="py-0.5 pr-4 text-ink-tertiary">{c.referenceRange}</td>
                                <td className={`py-0.5 font-mono font-bold text-right ${flagCls}`}>{flag}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                    {t.imagingResult && <p className="text-ink-secondary leading-relaxed mt-1">{t.imagingResult}</p>}
                  </div>
                )
              })}
            </div>
          </details>
        </section>
      )}

      {/* ── Hidden history (spoiler) ── */}
      {hh && (
        <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
          <details>
            <summary className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary cursor-pointer select-none hover:text-ink-secondary">
              Hidden History (spoiler — not shown to students)
            </summary>
            <div className="px-5 pb-5 space-y-2 text-xs border-t border-surface-3 pt-4">
              {[
                ['Full History',    hh.fullHistory],
                ['Social',         hh.socialHistory],
                ['Family',         hh.familyHistory],
                ['Medications',    hh.medications],
                ['Hidden Symptoms',hh.hiddenSymptoms],
                ['Allergies',      hh.allergies],
              ].filter(([, v]) => v).map(([label, text]) => (
                <div key={label as string}>
                  <span className="text-ink-tertiary font-medium">{label}: </span>
                  <span className="text-ink-secondary">{text}</span>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

    </div>
  )
}
