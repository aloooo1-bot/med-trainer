'use client'

import { useState, useEffect } from 'react'
import '@/app/dashboard.css'
import Sidebar from '@/app/components/dashboard/Sidebar'
import { createClient } from '@/app/lib/supabase/client'

const FOUNDATIONS_DIMS = [
  { name: 'History & Interview',    pts: 24, desc: 'Did you ask the right questions? Covers chief complaint, HPI, relevant past history, medications, social history, and pertinent negatives.' },
  { name: 'Test Ordering',          pts: 24, desc: 'Did you order the core diagnostic workup? Scored against a curated "must-order" list for the diagnosis. Supplementary / subspecialty tests are not required for full marks.' },
  { name: 'Diagnosis Accuracy',     pts: 36, desc: 'Is your submitted diagnosis correct? Clinically equivalent terms are accepted. Partial credit for the right organ system or syndrome with a meaningfully wrong pathological process.' },
  { name: 'Diagnosis Completeness', pts: 16, desc: 'At Foundations, a correct core diagnosis earns full or near-full marks — you are not required to add etiology, staging, or severity details.' },
]

const CLINICAL_ADVANCED_DIMS = [
  { name: 'History & Interview',    pts: 20, desc: 'Did you ask the right questions? Covers chief complaint, HPI, relevant past history, medications, social history, and pertinent negatives.' },
  { name: 'Test Ordering',          pts: 20, desc: 'Did you order the core diagnostic workup? Scored against a curated "must-order" list for the diagnosis. Supplementary / subspecialty tests are not required for full marks.' },
  { name: 'Diagnosis Accuracy',     pts: 30, desc: 'Is your submitted diagnosis correct? Clinically equivalent terms are accepted. Partial credit for the right organ system or syndrome with a meaningfully wrong pathological process.' },
  { name: 'Diagnosis Completeness', pts: 15, desc: 'How complete and specific is your diagnosis? At Clinical, a correct core diagnosis earns 10–15. At Advanced, etiology, staging, or complication details are expected.' },
  { name: 'Clinical Reasoning',     pts: 15, desc: 'Do your interview choices and written reasoning link specific findings to the diagnosis? Penalised for fabricated findings or wrong conclusions, not for brevity.' },
]

const EFFICIENCY_NOTE = 'Efficiency (/10, shown separately): At Clinical and Advanced difficulty, a timer tracks how quickly you complete the case. Efficiency is displayed as a separate /10 indicator on the scorecard and is not included in the /100 score.'

const FAQS = [
  {
    q: 'Why did I get partial credit for the right diagnosis?',
    a: 'If you named the correct pathological entity but omitted a qualifying modifier (e.g. "pneumothorax" instead of "spontaneous pneumothorax"), that\'s still marked correct. Partial credit is reserved for cases where you identified the right organ system but the wrong pathological process.',
  },
  {
    q: 'Why does my score vary even on similar cases?',
    a: 'Each case is graded individually by Claude based on the specific questions you asked, tests you ordered, and the case\'s unique key-question list. Rewording a question that surfaces the same clinical information still earns credit.',
  },
  {
    q: 'What\'s the difference between Free and Pro?',
    a: 'Free: 2 cases per day, core scorecard (dimensions + score). Pro: unlimited cases, full scorecard including teaching points, strengths, missed questions, and differential diagnosis explanations.',
  },
  {
    q: 'How does the recommendation algorithm choose what to study?',
    a: 'Systems are ranked by urgency = (100 − avg score) × recency weight. Single-case systems get a 1.2× multiplier because one data point is less reliable. Your weekly plan then fills active days with the top-urgency systems in order.',
  },
  {
    q: 'How do I redo a case?',
    a: 'Open any case in Case History, expand its scorecard, and click "↻ Redo this case". A new session is created with a fresh patient demographic and presentation — your original score is preserved separately.',
  },
  {
    q: 'What does STEMI vs NSTEMI mean for my score?',
    a: 'STEMI and NSTEMI are not clinically equivalent — they differ in ECG findings, cath-lab activation, and management. Submitting one when the other is correct caps Diagnosis Accuracy at 12/27 and marks the case incorrect, regardless of other correct elements.',
  },
]

export default function HelpPage() {
  const [displayName, setDisplayName] = useState('User')
  const [tier, setTier]               = useState('free')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any).from('profiles').select('display_name,tier').eq('id', user.id).single()
        .then(({ data: p }: { data: { display_name?: string; tier?: string } | null }) => {
          if (!p) return
          setDisplayName(p.display_name ?? user.email?.split('@')[0] ?? 'User')
          setTier(p.tier ?? 'free')
        })
    })
  }, [])

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName} tier={tier} activePage="help" />
      <div className="dx-main">
        <div className="dx-content">

          <div style={{ marginBottom: 28 }}>
            <h1 className="heading-display text-[22px]"><span className="heading-accent">Help</span> &amp; documentation</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              How MedTrainer works, scoring explained, and common questions
            </p>
          </div>

          {/* Scoring */}
          <div className="dx-card">
            <div className="dx-card-header">
              <div style={{ fontWeight: 700 }}>How scoring works</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                Each case is graded out of 100 points. The categories differ by difficulty.
              </div>
            </div>
            <div className="dx-card-body">
              <div className="dx-help-section">
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Foundations — 4 categories, 100 pts total
                </div>
                {FOUNDATIONS_DIMS.map(d => (
                  <div className="dx-help-rubric-row" key={d.name}>
                    <span className="dx-help-dim-name">{d.name}</span>
                    <span className="dx-help-dim-pts">/{d.pts} pts</span>
                    <span className="dx-help-dim-desc">{d.desc}</span>
                  </div>
                ))}
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', marginTop: 14, marginBottom: 6 }}>
                  Clinical &amp; Advanced — 5 categories, 100 pts total
                </div>
                {CLINICAL_ADVANCED_DIMS.map(d => (
                  <div className="dx-help-rubric-row" key={d.name}>
                    <span className="dx-help-dim-name">{d.name}</span>
                    <span className="dx-help-dim-pts">/{d.pts} pts</span>
                    <span className="dx-help-dim-desc">{d.desc}</span>
                  </div>
                ))}
                <div style={{ paddingTop: 10, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  {EFFICIENCY_NOTE}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 4 }}>
                  {[
                    { label: 'Correct', threshold: '≥ 75', color: 'var(--green)' },
                    { label: 'Partial', threshold: '60 – 74', color: 'var(--amber)' },
                    { label: 'Incorrect', threshold: '< 60', color: 'var(--red)' },
                  ].map(t => (
                    <div key={t.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.color, marginBottom: 2 }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>{t.threshold}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tiers */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Plans</div>
            <div className="dx-card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  {
                    name: 'Free', badge: '',
                    features: ['2 cases per day', 'Core scorecard (5 dimensions + score)', 'Case history (last 50 cases)', 'Bookmarks and search', 'Focus areas & study queue'],
                  },
                  {
                    name: 'Pro', badge: 'pro',
                    features: ['Unlimited cases per day', 'Full scorecard with teaching points', 'Missed questions analysis', 'Strengths breakdown', 'Differential diagnosis explanations', 'Everything in Free'],
                  },
                ].map(plan => (
                  <div key={plan.name} style={{ border: plan.badge ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', background: 'var(--surface2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{plan.name}</span>
                      {plan.badge && <span className="dx-plan-badge pro" style={{ fontSize: 11 }}>Pro</span>}
                    </div>
                    <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {plan.features.map(f => (
                        <li key={f} style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recommendation algorithm */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>How the recommendation algorithm works</div>
            <div className="dx-card-body">
              <div className="dx-help-section">
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                  Each system you&apos;ve practiced is assigned an <strong style={{ color: 'var(--text)' }}>urgency score</strong>:
                </p>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--accent)' }}>
                  urgency = (100 − avg_score) × (1.2 if only 1 case, else 1.0)
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                  A higher urgency means you need more practice. The 1.2× multiplier for single-case systems reflects
                  that one data point is less reliable than multiple attempts. Systems are sorted by urgency
                  descending; your weekly training plan fills active days in that order.
                </p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                  You can customize rest days, volume, and difficulty mix in{' '}
                  <a href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Settings</a>,
                  or skip individual systems from the{' '}
                  <a href="/focus" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Focus Areas</a> tab.
                </p>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Frequently asked questions</div>
            <div className="dx-card-body">
              <div className="dx-help-section">
                {FAQS.map((faq, i) => (
                  <div className="dx-help-faq-item" key={i}>
                    <p className="dx-help-faq-q">{faq.q}</p>
                    <p className="dx-help-faq-a">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feedback link */}
          <div className="dx-card" style={{ padding: '20px 24px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>
              Found a bug or have a suggestion?
            </p>
            <a
              href="mailto:jorellana9100@gmail.com?subject=MedTrainer feedback"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
            >
              Send feedback →
            </a>
          </div>

        </div>
      </div>
    </div>
  )
}
