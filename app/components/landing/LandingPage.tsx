import styles from '../../landing.module.css'
import { HERO_CASE, SYSTEM_HEATMAP, STUDY_QUEUE, ANIMATION_DIAGNOSIS, EXAM_FINDINGS, LAB_ROWS, IMAGING_RESULT, CLINICAL_REASONING } from './_fixtures/heroCase'

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function Nav({ anonUsed }: { anonUsed: boolean }) {
  return (
    <nav className={styles.nav}>
      <div className={styles.navInner}>
        <a href="/" className={styles.navLogo}>
          <div className={styles.navLogoMark}>Rx</div>
          <span className={styles.navWordmark}>MedTrainer</span>
        </a>
        <div className={styles.navLinks}>
          <a href="#scorecard" className={styles.navLink}>Scorecard</a>
          <a href="#focus" className={styles.navLink}>Focus Areas</a>
          <a href="#pricing" className={styles.navLink}>Pricing</a>
        </div>
        <a href="/auth/login" className={styles.navSignin}>Sign in</a>
        <a
          href={anonUsed ? '/auth/login' : '/trainer'}
          className={styles.navCta}
        >
          {anonUsed ? 'Create account' : 'Start a case'}
        </a>
      </div>
    </nav>
  )
}

function ChartMockup() {
  const c = HERO_CASE
  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartGlow} />
      <div className={styles.chart}>

        {/* Header */}
        <div className={styles.chartHeader}>
          <div className={styles.chartHeaderRow}>
            <div>
              <div className={styles.chartLabel}>Patient</div>
              <div className={styles.chartName}>{c.patient.name}</div>
              <div className={styles.chartMeta}>
                {c.patient.age} {c.patient.sex} &nbsp;·&nbsp; {c.patient.height}
              </div>
            </div>
            <div className={styles.chartTriage}>{c.triage}</div>
          </div>
          <div className={styles.chartCC}>
            <div className={styles.chartCCLabel}>CC</div>
            <div className={styles.chartCCText}>{c.chiefComplaint}</div>
          </div>
        </div>

        {/* Vitals */}
        <div className={styles.chartVitals}>
          {c.vitals.map(({ label, val, unit, crit }) => (
            <div
              key={label}
              className={`${styles.chartVital}${crit ? ' ' + styles.chartVitalCrit : ''}`}
            >
              <div className={styles.chartVitalLabel}>{label}</div>
              <div className={styles.chartVitalVal}>{val}</div>
              <div className={styles.chartVitalUnit}>{unit}</div>
            </div>
          ))}
        </div>

        {/* HPI */}
        <div className={styles.chartHpi}>
          <div className={styles.chartHpiLabel}>HPI</div>
          <div className={styles.chartHpiText}>{c.hpi}</div>
        </div>

        {/* Real 12-lead ECG (PTB-XL dataset SVG, served from /public) */}
        <div className={styles.chartEcg}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.ecg.src}
            alt={c.ecg.alt}
            width={1100}
            height={850}
            className={styles.chartEcgImg}
          />
          <div className={styles.chartEcgFindings}>
            <span className={styles.chartEcgFindingsLabel}>ECG read · </span>
            {c.ecg.findings}
          </div>
        </div>

        {/* Footer chips */}
        <div className={styles.chartChips}>
          <span className={styles.chartChip}>{c.systemShort}</span>
          <span className={styles.chartChip}>{c.difficulty}</span>
          <span className={styles.chartChip}>{c.timerLabel}</span>
        </div>

      </div>
    </div>
  )
}

function Hero({ anonUsed }: { anonUsed: boolean }) {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <div className={styles.heroEyebrow}>
              <div className={styles.heroEyebrowDot} />
              <span>Clinical Reasoning Practice</span>
            </div>

            <h1 className={styles.heroH1}>
              Bridge the gap between
              <span className={styles.heroH1Accent}>the textbook and the bedside.</span>
            </h1>

            <p className={styles.heroSub}>
              Work full patient encounters end to end — interview, examine, order, decide.
              Get scored on the reasoning, not just the answer.
            </p>

            <div className={styles.heroActions}>
              {!anonUsed && (
                <a href="/trainer" className={styles.heroBtnPrimary}>
                  Start a free case
                </a>
              )}
              <a
                href="/auth/login"
                className={anonUsed ? styles.heroBtnPrimary : styles.heroBtnSecondary}
              >
                {anonUsed ? 'Create a free account' : 'Create an account'}
              </a>
              {anonUsed && (
                <a href="/auth/login" className={styles.heroBtnSecondary}>
                  Sign in
                </a>
              )}
            </div>

            <p className={styles.heroProof}>
              {anonUsed
                ? "You've used your free encounter. Create an account to keep going — still free."
                : 'No signup for the first case. One full encounter, full scorecard, no card on file.'}
            </p>

            <div className={styles.heroTiers} role="list" aria-label="Three difficulty levels">
              <div className={styles.heroTier} role="listitem">
                <span className={`${styles.heroTierBadge} ${styles.heroTierBadgeF}`}>F</span>
                <div className={styles.heroTierText}>
                  <div className={styles.heroTierName}>Foundations</div>
                  <div className={styles.heroTierMeta}>No timer · diagnosis only</div>
                </div>
              </div>
              <div className={styles.heroTier} role="listitem">
                <span className={`${styles.heroTierBadge} ${styles.heroTierBadgeC}`}>C</span>
                <div className={styles.heroTierText}>
                  <div className={styles.heroTierName}>Clinical</div>
                  <div className={styles.heroTierMeta}>22-min clock · dx + reasoning</div>
                </div>
              </div>
              <div className={styles.heroTier} role="listitem">
                <span className={`${styles.heroTierBadge} ${styles.heroTierBadgeA}`}>A</span>
                <div className={styles.heroTierText}>
                  <div className={styles.heroTierName}>Advanced</div>
                  <div className={styles.heroTierMeta}>15-min clock · SOAP + oral</div>
                </div>
              </div>
            </div>
          </div>

          <ChartMockup />
        </div>
      </section>

      <div className={styles.useStrip}>
        <div className={styles.useStripInner}>
          <span className={styles.useStripText}>
            Used to prep for{' '}
            <span className={styles.useStripAccent}>Step 1</span>,{' '}
            <span className={styles.useStripAccent}>Step 2 CK</span>,{' '}
            <span className={styles.useStripAccent}>Step 3</span>,{' '}
            <span className={styles.useStripAccent}>OSCEs</span>,{' '}
            and to stay sharp through clerkship rotations.
          </span>
        </div>
      </div>
    </>
  )
}

function InterviewAnimation() {
  return (
    <div
      className={styles.hiwAnim}
      role="img"
      aria-label="Animated chat: clinician asks about cough and sputum, patient describes a productive cough with yellow-green mucus, an HPI detail unlocks below"
    >
      <div className={styles.hiwAnimHeader}>Patient Chat</div>
      <div className={styles.hiwAnimBody}>
        <div className={styles.hiwAnimMsgU}>
          <div className={styles.hiwAnimBubbleU}>
            Do you have a cough, and are you coughing up mucus?
          </div>
        </div>
        <div className={styles.hiwAnimMsgP}>
          <div className={styles.hiwAnimBubbleP}>
            Yes — started dry, but now I'm bringing up yellow-green mucus.
          </div>
        </div>
        <div className={styles.hiwAnimLock}>
          <div className={styles.hiwAnimLockLabel}>HPI · unlocked</div>
          <div className={styles.hiwAnimLockRow}>
            <span className={styles.hiwAnimCheck}>✓</span>
            Productive cough with yellow-green sputum
          </div>
        </div>
      </div>
    </div>
  )
}

function ExamineAnimation() {
  return (
    <div
      className={styles.hiwAnim}
      role="img"
      aria-label="Animated physical exam panel cycling through 9 body systems with real findings: General, HEENT, Neck, Cardiovascular, Pulmonary, Abdomen, Extremities, Neurological, Skin"
    >
      <div className={styles.hiwAnimHeader}>Physical Exam · 9 systems</div>
      <div className={styles.hiwAnimExScrollWindow}>
        <div className={styles.hiwAnimExScrollTrack}>
          {EXAM_FINDINGS.map(({ system, finding }) => (
            <div key={system} className={styles.hiwAnimExRow}>
              <div className={styles.hiwAnimExSystem}>{system}</div>
              <div className={styles.hiwAnimExFinding}>{finding}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrderAnimation() {
  const labStatusStyle: Record<'critical' | 'abnormal' | 'normal', string> = {
    critical: styles.hiwAnimOrLabCritical,
    abnormal: styles.hiwAnimOrLabAbnormal,
    normal:   styles.hiwAnimOrLabNormal,
  }
  return (
    <div
      className={styles.hiwAnim}
      role="img"
      aria-label="Animated test results panel: lab values appear with abnormal flags, then a chest X-ray returns with its interpretation"
    >
      <div className={styles.hiwAnimHeader}>Test Results</div>
      <div className={styles.hiwAnimOrStage}>
        {/* Scene 1 — labs table */}
        <div className={styles.hiwAnimOrLabs}>
          {LAB_ROWS.map(({ test, value, unit, status }) => (
            <div key={test} className={styles.hiwAnimOrLabRow}>
              <span className={styles.hiwAnimOrLabName}>{test}</span>
              <span className={`${styles.hiwAnimOrLabValue} ${labStatusStyle[status]}`}>
                {value}{unit ? ` ${unit}` : ''}
              </span>
              {status !== 'normal' && (
                <span className={`${styles.hiwAnimOrLabFlag} ${labStatusStyle[status]}`}>
                  {status === 'critical' ? 'CRIT' : '↑'}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* Scene 2 — chest X-ray */}
        <div className={styles.hiwAnimOrImaging}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={IMAGING_RESULT.src} alt={IMAGING_RESULT.alt} className={styles.hiwAnimOrImg} loading="lazy" />
          <div className={styles.hiwAnimOrImgCaption}>
            <div className={styles.hiwAnimOrImgTitle}>{IMAGING_RESULT.test}</div>
            <div className={styles.hiwAnimOrImgRead}>{IMAGING_RESULT.interpretation}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SubmitAnimation() {
  return (
    <div
      className={styles.hiwAnim}
      role="img"
      aria-label="Animated submit panel: diagnosis fills in, then clinical reasoning appears line by line, then the Submit Diagnosis button is pressed"
    >
      <div className={styles.hiwAnimHeader}>Submit Your Diagnosis</div>
      <div className={styles.hiwAnimSbField}>
        <div className={styles.hiwAnimSbLabel}>Diagnosis</div>
        <div className={styles.hiwAnimSbDxBox}>
          <span className={styles.hiwAnimSbDxText}>{ANIMATION_DIAGNOSIS}</span>
        </div>
      </div>
      <div className={styles.hiwAnimSbField}>
        <div className={styles.hiwAnimSbLabel}>Clinical Reasoning</div>
        <div className={styles.hiwAnimSbBox}>
          <div className={styles.hiwAnimSbLine1}>{CLINICAL_REASONING[0]}</div>
          <div className={styles.hiwAnimSbLine2}>{CLINICAL_REASONING[1]}</div>
          <div className={styles.hiwAnimSbLine3}>{CLINICAL_REASONING[2]}</div>
        </div>
      </div>
      <button type="button" tabIndex={-1} aria-hidden className={styles.hiwAnimSbBtn}>
        Submit Diagnosis
      </button>
    </div>
  )
}

type Step = {
  num: string
  title: string
  body: string
  caption: string
} & (
  | { kind: 'image'; img: string; imgAlt: string }
  | { kind: 'animation'; variant: 'interview' | 'examine' | 'order' | 'submit' }
)

function HowItWorks() {
  const steps: Step[] = [
    {
      num: '01',
      title: 'Interview',
      body: "Ask the patient questions in plain language. Their history opens up only when you ask the right things.",
      kind: 'animation',
      variant: 'interview',
      caption: 'Question → response → HPI unlocks',
    },
    {
      num: '02',
      title: 'Examine',
      body: "Choose targeted physical exam findings. Get back what you'd actually find — not what you wish you would.",
      kind: 'animation',
      variant: 'examine',
      caption: 'Real findings · 9 systems',
    },
    {
      num: '03',
      title: 'Order',
      body: 'Pick labs, imaging, cultures, biopsies. Results come back flagged and timed like the real ones.',
      kind: 'animation',
      variant: 'order',
      caption: 'Labs flagged → imaging back',
    },
    {
      num: '04',
      title: 'Submit',
      body: 'Type your reasoning, name the diagnosis, and read your scorecard, missed questions, and what to study next.',
      kind: 'animation',
      variant: 'submit',
      caption: 'Reasoning → Submit Diagnosis',
    },
  ]

  return (
    <section className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.wrap}>
        <div className={styles.eyebrow}>How it works</div>
        <h2 className={styles.sectionH2}>Four steps. The same ones you&apos;d take on the floor.</h2>
        <p className={styles.sectionSub}>
          Pick a system, see the patient, do the workup, commit to a diagnosis. The clock and the difficulty scale with you.
        </p>
        <div className={styles.hiwSteps}>
          {steps.map((step, i) => (
            <div key={step.num} className={styles.hiwStep}>
              <div className={styles.hiwStepThumb}>
                {step.kind === 'animation' ? (
                  step.variant === 'examine' ? <ExamineAnimation /> :
                  step.variant === 'order'   ? <OrderAnimation />   :
                  step.variant === 'submit'  ? <SubmitAnimation />  :
                  <InterviewAnimation />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={step.img} alt={step.imgAlt} className={styles.hiwStepImg} loading="lazy" />
                )}
                <div className={styles.hiwStepCaption}>{step.caption}</div>
              </div>
              <div className={styles.hiwStepNum}>
                {step.num}
                {i < steps.length - 1 && <span className={styles.hiwStepNumLine} />}
              </div>
              <div className={styles.hiwStepTitle}>{step.title}</div>
              <div className={styles.hiwStepBody}>{step.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const SCORECARD_DIMENSIONS: readonly { name: string; score: number; max: number; note: string }[] = [
  { name: 'History & Interview',      score: 16, max: 18, note: 'Asked productive cough and dyspnea early; missed wife-witnessed confusion.' },
  { name: 'Test Ordering',            score: 17, max: 18, note: 'WBC, procalcitonin, and PA/lateral CXR — full bacterial workup.' },
  { name: 'Diagnosis Accuracy',       score: 25, max: 27, note: 'Correct primary; could have specified bacterial etiology.' },
  { name: 'Diagnosis Completeness',   score: 11, max: 13, note: 'Named CAP and cited consolidation; CURB-65 stratification implied not stated.' },
  { name: 'Clinical Reasoning',       score: 12, max: 14, note: 'Linked WBC 18.4 + procalcitonin 3.8 to bacterial pneumonia clearly.' },
]

function Scorecard() {
  const subtotal = SCORECARD_DIMENSIONS.reduce((s, d) => s + d.score, 0)
  const subtotalMax = SCORECARD_DIMENSIONS.reduce((s, d) => s + d.max, 0)
  const total = subtotal

  return (
    <section id="scorecard" className={`${styles.section} ${styles.scorecardSection}`}>
      <div className={styles.wrap}>
        <div className={styles.eyebrow}>Scorecard</div>
        <h2 className={styles.sectionH2}>Every case ends with a graded scorecard.</h2>
        <p className={styles.sectionSub}>
          Here&apos;s what comes back after the Community-Acquired Pneumonia case above — a real score across history, tests, accuracy, completeness, and reasoning, plus what to study next.
        </p>

        <div className={styles.scoreCard}>
          <div className={styles.scoreCardHeader}>
            <div>
              <div className={styles.scoreCaseLabel}>Case · Respiratory · Clinical</div>
              <div className={styles.scoreCaseName}>Bogdan Horvatić · 58 M</div>
            </div>
            <div className={styles.scoreDx}>
              <div className={styles.scoreDxLabel}>Submitted diagnosis</div>
              <div className={styles.scoreDxValue}>
                <span>Community-Acquired Pneumonia</span>
                <span className={styles.scoreDxOk} aria-label="Correct">✓</span>
              </div>
            </div>
          </div>

          <div className={styles.scoreBody}>
            <div className={styles.scoreTotal}>
              <div className={styles.scoreTotalRing}>
                <div className={styles.scoreTotalNum}>{total}</div>
                <div className={styles.scoreTotalDen}>/ 100</div>
              </div>
              <div className={styles.scoreTotalLabel}>Strong performance</div>
              <div className={styles.scoreTotalSub}>
                {subtotal}/{subtotalMax} rubric · 9:42 of 22:00
              </div>
            </div>

            <div className={styles.scoreDims}>
              {SCORECARD_DIMENSIONS.map(({ name, score, max, note }) => (
                <div key={name} className={styles.scoreDim}>
                  <div className={styles.scoreDimRow}>
                    <div className={styles.scoreDimName}>{name}</div>
                    <div className={styles.scoreDimScore}>
                      {score}<span className={styles.scoreDimMax}> / {max}</span>
                    </div>
                  </div>
                  <div className={styles.scoreDimBar}>
                    <div
                      className={styles.scoreDimBarFill}
                      style={{ width: `${(score / max) * 100}%` }}
                    />
                  </div>
                  <div className={styles.scoreDimNote}>{note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.scoreFooter}>
            <div className={styles.scoreFootCol}>
              <div className={`${styles.scoreFootLabel} ${styles.scoreFootLabelOk}`}>Strengths</div>
              <ul className={styles.scoreFootList}>
                <li className={styles.scoreFootItem}>Procalcitonin and CRP nailed the bacterial pattern</li>
                <li className={styles.scoreFootItem}>CXR ordered before broad-spectrum antibiotics</li>
                <li className={styles.scoreFootItem}>Egophony + bronchial breath sounds linked to RLL consolidation</li>
              </ul>
            </div>
            <div className={styles.scoreFootCol}>
              <div className={`${styles.scoreFootLabel} ${styles.scoreFootLabelMiss}`}>What you missed</div>
              <ul className={styles.scoreFootList}>
                <li className={styles.scoreFootItem}>Wife-witnessed confusion — CURB-65 component, changes admit/discharge</li>
                <li className={styles.scoreFootItem}>Pleuritic chest pain on inspection</li>
              </ul>
            </div>
            <div className={styles.scoreFootCol}>
              <div className={`${styles.scoreFootLabel} ${styles.scoreFootLabelTeach}`}>Teaching points</div>
              <ul className={styles.scoreFootList}>
                <li className={styles.scoreFootItem}>CURB-65 ≥ 2 → admit; ≥ 3 → consider ICU</li>
                <li className={styles.scoreFootItem}>Procalcitonin &gt; 0.5 ng/mL strongly favors bacterial etiology</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

type HeatVariant = 'ok' | 'warn' | 'bad'

function HeatmapMockup() {
  const variantCell: Record<HeatVariant, string> = {
    ok:   styles.heatOk,
    warn: styles.heatWarn,
    bad:  styles.heatBad,
  }
  const variantText: Record<HeatVariant, string> = {
    ok:   styles.heatOkText,
    warn: styles.heatWarnText,
    bad:  styles.heatBadText,
  }

  return (
    <div className={styles.heatCard}>
      <div className={styles.heatCardHeader}>
        <div className={styles.heatCardTitle}>12 organ systems</div>
        <div className={styles.heatCardSub}>last 30 encounters</div>
      </div>
      <div className={styles.heatGrid}>
        {SYSTEM_HEATMAP.map(({ full, short, score, v }) => (
          <div
            key={full}
            className={`${styles.heatCell} ${variantCell[v]}`}
            title={full}
          >
            <div className={`${styles.heatCellLabel} ${variantText[v]}`}>{short}</div>
            <div className={`${styles.heatCellScore} ${variantText[v]}`}>{score}</div>
          </div>
        ))}
      </div>
      <div className={styles.queueSection}>
        <div className={styles.queueSectionLabel}>Study Queue</div>
        {STUDY_QUEUE.map(({ short, title, diff }) => (
          <div key={title} className={styles.queueRow}>
            <span className={styles.queueSystem}>{short}</span>
            <span className={styles.queueTitle}>{title}</span>
            <span className={styles.queueDiff}>{diff}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FocusSection() {
  const bullets = [
    {
      title: 'Weakness heatmap',
      text: 'Your last 30 cases plotted across 12 organ systems and 3 difficulties so you see the gap at a glance.',
    },
    {
      title: 'Study Queue',
      text: 'A short list of high-yield cases pulled from your weakest systems, refreshed as you improve.',
    },
    {
      title: 'Weekly Training Plan',
      text: 'A light schedule that points at the systems you\'re behind on without telling you to study everything.',
    },
    {
      title: 'Searchable case history',
      text: 'Every scorecard, teaching point, and missed question saved for review.',
    },
  ]

  return (
    <section id="focus" className={`${styles.section} ${styles.sectionAlt} ${styles.focus}`}>
      <div className={styles.wrap}>
        <div className={styles.focusInner}>
          <div>
            <div className={styles.focusKicker}>Focus Areas</div>
            <h2 className={styles.focusH2}>Your next case knows where you&apos;re weak.</h2>
            <p className={styles.focusSub}>
              Every encounter is scored across history, tests, accuracy, completeness, and reasoning.
              We map those scores back to organ systems and difficulty so the next study session isn&apos;t a guess.
            </p>
            <div className={styles.focusBullets}>
              {bullets.map(({ title, text }) => (
                <div key={title} className={styles.focusBullet}>
                  <div className={styles.focusBulletDot} />
                  <div>
                    <div className={styles.focusBulletTitle}>{title}</div>
                    <div className={styles.focusBulletText}>{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <HeatmapMockup />
        </div>
      </div>
    </section>
  )
}

function PricingSection({ anonUsed }: { anonUsed: boolean }) {
  return (
    <section id="pricing" className={`${styles.section} ${styles.pricing}`}>
      <div className={styles.wrap}>
        <div className={styles.eyebrow}>Pricing</div>
        <h2 className={styles.sectionH2}>Free to start. Always free to keep practicing.</h2>
        <p className={styles.sectionSub}>No card on file. Pro adds the analytics and the unlock.</p>

        <div className={styles.pricingGrid}>

          {/* Free */}
          <div className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
            <div className={styles.priceCardBadge}>Most popular</div>
            <div className={styles.priceTier}>Free</div>
            <div className={styles.priceName}>Student</div>
            <div className={styles.priceAmount}>
              <span className={styles.priceNum}>$0</span>
              <span className={styles.pricePeriod}>/ forever</span>
            </div>
            <div className={styles.priceTag}>Enough to build the habit.</div>
            <hr className={styles.priceDivider} />
            <ul className={styles.priceFeats}>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                First case fully unlocked, no signup
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                2 cases per day after signup
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Foundations difficulty, random system
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Full scorecard + teaching point on every case
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Case history saved across devices
              </li>
              <li className={`${styles.priceFeat} ${styles.priceFeatOff}`}>
                <span className={styles.priceFeatX}><XIcon /></span>
                Clinical and Advanced difficulties locked
              </li>
              <li className={`${styles.priceFeat} ${styles.priceFeatOff}`}>
                <span className={styles.priceFeatX}><XIcon /></span>
                No system picker — random only
              </li>
            </ul>
            <a href="/auth/login" className={styles.priceCtaPrimary}>
              {anonUsed ? 'Create your free account' : 'Sign up free'}
            </a>
          </div>

          {/* Pro */}
          <div className={styles.priceCard}>
            <div className={styles.priceTier}>Pro</div>
            <div className={styles.priceName}>Pro</div>
            <div className={styles.priceAmount}>
              <span className={styles.priceNumSoon}>Coming soon</span>
            </div>
            <div className={styles.priceTag}>Unlimited cases, plus the analytics that tell you what to study.</div>
            <hr className={styles.priceDivider} />
            <ul className={styles.priceFeats}>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Unlimited cases, every difficulty
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Pick any of 13 organ systems
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Weakness heatmap across systems and tiers
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Study Queue + Weekly Training Plan
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Missed-question analysis on every case
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                SOAP and oral case grading on Advanced
              </li>
              <li className={styles.priceFeat}>
                <span className={styles.priceFeatCheck}><CheckIcon /></span>
                Searchable history of every encounter
              </li>
            </ul>
            <span className={styles.priceCtaDim}>Notify me when Pro lands</span>
          </div>

        </div>
      </div>
    </section>
  )
}

function FinalCta({ anonUsed }: { anonUsed: boolean }) {
  return (
    <div className={styles.finalCta}>
      <h2 className={styles.finalCtaH2}>Pick a system. Take a case.</h2>
      <p className={styles.finalCtaSub}>One encounter. Full scorecard. No card on file.</p>
      <div className={styles.finalCtaActions}>
        <a
          href={anonUsed ? '/auth/login' : '/trainer'}
          className={styles.heroBtnPrimary}
        >
          {anonUsed ? 'Create a free account' : 'Start a free case'}
        </a>
        {!anonUsed && (
          <a href="/auth/login" className={styles.heroBtnSecondary}>
            Create an account
          </a>
        )}
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <a href="/" className={styles.footerLogo}>
          <div className={styles.footerLogoMark}>Rx</div>
          <span className={styles.footerLogoText}>MedTrainer</span>
        </a>
        <div className={styles.footerCopy}>Clinical reasoning practice for medical students and trainees.</div>
        <div className={styles.footerMark}>&copy; 2026 MedTrainer</div>
      </div>
    </footer>
  )
}

export default function LandingPage({ anonUsed }: { anonUsed: boolean }) {
  return (
    <div className={styles.landing}>
      <Nav anonUsed={anonUsed} />
      <Hero anonUsed={anonUsed} />
      <div className={styles.lightBody}>
        <HowItWorks />
        <Scorecard />
        <FocusSection />
        <PricingSection anonUsed={anonUsed} />
      </div>
      <FinalCta anonUsed={anonUsed} />
      <Footer />
    </div>
  )
}
