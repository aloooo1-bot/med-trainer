import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPatientSystemPrompt } from '../patientPrompt.mjs'

// A Clinical endocarditis case gated its bicuspid aortic valve behind the exact
// phrasing "have you ever been told about a heart valve abnormality". A student
// asked "what current medical conditions do you have?" — which the grading
// rubric credits as a full proactive hit for every key question in that domain —
// the patient answered diabetes, hypertension and CKD, and the grade then
// deducted four points for not eliciting the valve. The simulation refused to
// answer the question the rubric rewards.

const caseData = {
  patientInfo: { name: 'Dmitri Lee', age: 56, gender: 'Male', chiefComplaint: 'Fever and fatigue' },
  hpi: 'Three weeks of fever, night sweats and fatigue after a dental extraction.',
  clinicalHpi: '56-year-old male with 3 weeks of daily fevers and progressive fatigue.',
  pastMedicalHistory: { conditions: 'Type 2 diabetes, hypertension', surgeries: '', hospitalizations: '' },
  physicalExam: { Cardiovascular: 'Grade III/VI holosystolic murmur at the apex.', Skin: 'Osler nodes.' },
  reviewOfSystems: { Constitutional: 'Night sweats, 8lb weight loss.' },
  hiddenHistory: {
    fullHistory:
      'Known bicuspid aortic valve found incidentally 8 years ago, told it was "mild" and never followed up — ' +
      'the patient will only disclose this if directly asked whether he has ever been told about a heart valve abnormality.',
    socialHistory: 'Warehouse supervisor. Former light smoker.',
    familyHistory: "Father had heart valve surgery in his late 60s.",
    medications: 'Metformin, lisinopril, atorvastatin, aspirin.',
    allergies: 'Penicillin — hives as a child, never formally tested.',
    hiddenSymptoms: 'Two brief episodes of left arm numbness lasting five minutes.',
  },
}

const build = (difficulty = 'Clinical') =>
  buildPatientSystemPrompt(caseData, difficulty, new Set(['Cardiovascular']))

test('a question naming the domain counts as asking directly', () => {
  const p = build()
  assert.ok(p.includes("HOW TO TELL IF YOU'VE BEEN ASKED ABOUT SOMETHING"))
  assert.ok(p.includes('counts as asking about that fact directly'))
  assert.ok(p.includes('they cannot name it in advance'),
    'the rationale must travel with the rule, or the model applies it narrowly')
})

test('conditions dismissed as mild or incidental are explicitly in scope', () => {
  const p = build()
  assert.ok(p.includes('INCLUDING ones you were told were mild, incidental, or not worth following up'),
    'the bicuspid valve is exactly this kind of fact — dismissed years ago, never followed up')
  assert.ok(p.includes('found on a scan or test years ago'))
})

test("the rule overrides a case's own narrower prose gate", () => {
  const p = build()
  assert.ok(p.includes('that note does NOT override this'),
    'cases spell out narrower gates in hiddenHistory prose; without this they win and the trap reopens')
  // The case's gate text still reaches the model — it is only outranked.
  assert.ok(p.includes('will only disclose this if directly asked'))
})

test('contentless prompts still buy nothing', () => {
  const p = build()
  assert.ok(p.includes('What does NOT count as asking'))
  for (const prompt of ['Tell me more', 'Anything else?', 'What else is going on?']) {
    assert.ok(p.includes(prompt), `${prompt} must be named as insufficient`)
  }
  assert.ok(p.includes('Never use them as a cue to unload your history'),
    'the rubric half-credits these as incidental — the simulation must not reward them fully')
})

test('the standing "answer only what is asked" rule no longer contradicts the domain rule', () => {
  const p = build()
  assert.ok(p.includes('including when they ask by naming the area rather than the specific thing'))
  assert.ok(!p.includes('Answer only what the student directly asks you about.'),
    'the old absolute phrasing is what the domain rule had to fight')
  assert.ok(p.includes('Never summarize your full symptom list unprompted'),
    'anti-volunteering survives — this widens what counts as being asked, not what is volunteered')
})

test('the domain rule reaches every difficulty', () => {
  for (const difficulty of ['Foundations', 'Clinical', 'Advanced']) {
    assert.ok(build(difficulty).includes("HOW TO TELL IF YOU'VE BEEN ASKED ABOUT SOMETHING"),
      `missing at ${difficulty}`)
  }
})

// ── Gating that must survive the change ──────────────────────────────────────

test('hidden history is still withheld from the presenting story', () => {
  const p = build()
  assert.ok(p.includes('do NOT volunteer these proactively'))
  assert.ok(p.includes('56-year-old male with 3 weeks of daily fevers'),
    'Clinical opens from the short HPI the student was shown')
  assert.ok(!p.includes('after a dental extraction'),
    'the full HPI names the dental work — it must not leak into the Clinical patient prompt')
})

test('unexamined regions stay out of the prompt at Clinical', () => {
  const p = build()
  assert.ok(p.includes('holosystolic murmur'), 'the examined region is present')
  assert.ok(!p.includes('Osler nodes'), 'an unexamined region must not be describable')
})

test('Foundations is handed the whole exam', () => {
  const p = build('Foundations')
  assert.ok(p.includes('Osler nodes'))
  assert.ok(!p.includes('Your complete history'), 'the gated history block is Clinical/Advanced only')
})
