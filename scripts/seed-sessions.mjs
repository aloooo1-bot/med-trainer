/**
 * Seed realistic case sessions for a user account.
 * Usage: node scripts/seed-sessions.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://igspdqzkvinjjggovfnv.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnc3BkcXprdmluampnZ292Zm52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzU2NDQ4NSwiZXhwIjoyMDkzMTQwNDg1fQ.HXihLxazSCS1zikAoel4KZMKj_5U9F2dK9SLp-02qoQ'
const USER_EMAIL = 'jorellana9100@gmail.com'

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// Lookup user by email via admin endpoint
async function getUserId(email) {
  const { data, error } = await db.auth.admin.listUsers()
  if (error) throw error
  const user = data.users.find(u => u.email === email)
  if (!user) throw new Error(`No user found for ${email}`)
  return user.id
}

function makeId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function daysAgo(n, offsetHours = 0) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(d.getHours() - offsetHours)
  return d.toISOString()
}

// 12 varied, realistic case sessions
function makeSessions(userId) {
  const cases = [
    {
      system: 'Cardiovascular', difficulty: 'Foundations',
      diagnosis: 'ST-Elevation Myocardial Infarction (STEMI)', userDiagnosis: 'Myocardial Infarction',
      correct: true, score: 88, questionCount: 9, elapsedSeconds: 480,
      daysBack: 14, hoursBack: 3,
      grading_result: {
        score: 88, correct: true,
        feedback: 'Strong clinical reasoning. You correctly identified the STEMI pattern and ordered appropriate initial workup. Consider asking about prior cardiac history earlier in the encounter.',
        dimensions: {
          historyInterview: { score: 15, feedback: 'Good targeted history. Missed family cardiac history and prior cath.', max: 18 },
          testOrdering:     { score: 16, feedback: 'Ordered Troponin and ECG promptly. Slightly over-ordered imaging.', max: 18 },
          diagnosisAccuracy:{ score: 25, feedback: 'Correct diagnosis. Excellent identification of STEMI pattern.', max: 27 },
          diagnosisCompleteness: { score: 12, feedback: 'Named the key diagnosis and main differentials.', max: 13 },
          clinicalReasoning: { score: 13, feedback: 'Clear stepwise reasoning documented.', max: 14 },
        },
        strengths: ['Ordered Troponin and ECG within first 3 questions', 'Asked about radiation and associated symptoms', 'Identified correct diagnosis confidently'],
        missedQuestions: ['Family history of coronary artery disease', 'Prior cardiac catheterization or stents'],
        teachingPoints: ['STEMI requires activation of cath lab within 90 minutes (door-to-balloon time)', 'Always check prior cath history — it changes your reperfusion strategy', 'Right-sided ECG leads should be obtained for inferior STEMI to rule out RV involvement'],
        differentials: ['NSTEMI', 'Unstable Angina', 'Aortic Dissection', 'Pericarditis'],
      },
    },
    {
      system: 'Respiratory', difficulty: 'Foundations',
      diagnosis: 'Community-Acquired Pneumonia', userDiagnosis: 'Pneumonia',
      correct: true, score: 79, questionCount: 7, elapsedSeconds: 390,
      daysBack: 12, hoursBack: 1,
      grading_result: {
        score: 79, correct: true,
        feedback: 'Solid foundational approach. You reached the correct diagnosis with efficient questioning. Lab workup was appropriate but imaging could have been ordered sooner.',
        dimensions: {
          historyInterview: { score: 14, feedback: 'Good symptom characterization. Did not ask about vaccination status or recent sick contacts.', max: 18 },
          testOrdering:     { score: 14, feedback: 'Ordered chest X-ray and CBC appropriately. Sputum culture was a good add.', max: 18 },
          diagnosisAccuracy:{ score: 22, feedback: 'Correct diagnosis. Differentiated from bronchitis appropriately.', max: 27 },
          diagnosisCompleteness: { score: 11, feedback: 'Named CAP with some supporting reasoning.', max: 13 },
          clinicalReasoning: { score: 11, feedback: 'Reasonable reasoning chain, could be more systematic.', max: 14 },
        },
        strengths: ['Asked about productive cough characteristics', 'Ordered chest X-ray early', 'Correctly excluded PE from differential'],
        missedQuestions: ['Vaccination history (pneumococcal, flu)', 'Recent sick contacts or travel', 'HIV status or immunocompromise'],
        teachingPoints: ['PSI/PORT or CURB-65 score guides admission vs outpatient decision', 'Atypical pathogens (Mycoplasma, Legionella) require macrolide coverage', 'Blood cultures add yield in hospitalized patients with severe CAP'],
        differentials: ['Bronchitis', 'Pulmonary Embolism', 'Lung Abscess', 'Tuberculosis'],
      },
    },
    {
      system: 'Neurologic', difficulty: 'Clinical',
      diagnosis: 'Subarachnoid Hemorrhage', userDiagnosis: 'Tension Headache',
      correct: false, score: 41, questionCount: 6, elapsedSeconds: 720,
      daysBack: 10, hoursBack: 5,
      grading_result: {
        score: 41, correct: false,
        feedback: 'The "thunderclap headache" descriptor and meningismus on exam should have raised immediate concern for SAH. Tension headache does not typically present with sudden maximal-onset pain. Always rule out life-threatening causes before attributing headache to benign etiologies.',
        dimensions: {
          historyInterview: { score: 10, feedback: 'Asked basic headache questions but did not probe onset character (thunderclap vs gradual).', max: 18 },
          testOrdering:     { score: 9,  feedback: 'Did not order CT head or LP. These are mandatory for thunderclap headache.', max: 18 },
          diagnosisAccuracy:{ score: 8,  feedback: 'Incorrect diagnosis. SAH was the correct answer.', max: 27 },
          diagnosisCompleteness: { score: 7,  feedback: 'Differential did not include hemorrhagic causes.', max: 13 },
          clinicalReasoning: { score: 7,  feedback: 'Reasoning anchored on benign diagnosis without ruling out emergent causes first.', max: 14 },
        },
        strengths: ['Asked about prior headache history', 'Asked about photophobia'],
        missedQuestions: ['Exact onset — did it reach maximum intensity within seconds?', 'Any loss of consciousness at onset?', 'Neck stiffness or meningismus?'],
        teachingPoints: ['"Worst headache of my life" + thunderclap onset = SAH until proven otherwise', 'Non-contrast CT head first; if negative, LP for xanthochromia', 'Aneurysmal SAH has 30-day mortality of ~45% — time is brain'],
        differentials: ['Subarachnoid Hemorrhage', 'Meningitis', 'Cervical Artery Dissection', 'Hypertensive Emergency'],
      },
    },
    {
      system: 'Gastrointestinal', difficulty: 'Foundations',
      diagnosis: 'Acute Appendicitis', userDiagnosis: 'Acute Appendicitis',
      correct: true, score: 92, questionCount: 11, elapsedSeconds: 540,
      daysBack: 9, hoursBack: 2,
      grading_result: {
        score: 92, correct: true,
        feedback: 'Excellent systematic approach. You correctly identified the classic migration of pain, elicited Rovsing sign, and ordered appropriate imaging. Very efficient workup.',
        dimensions: {
          historyInterview: { score: 17, feedback: 'Thorough history including pain migration, anorexia, and nausea. Well done.', max: 18 },
          testOrdering:     { score: 17, feedback: 'CBC, CRP, and CT abdomen/pelvis were the right choices.', max: 18 },
          diagnosisAccuracy:{ score: 26, feedback: 'Correct diagnosis with high confidence.', max: 27 },
          diagnosisCompleteness: { score: 13, feedback: 'Complete reasoning including surgical consultation recommendation.', max: 13 },
          clinicalReasoning: { score: 14, feedback: 'Excellent stepwise clinical reasoning throughout.', max: 14 },
        },
        strengths: ['Asked about pain migration from periumbilical to RLQ', 'Noted anorexia as supporting feature', 'Ordered CT with contrast appropriately', 'Identified rebound tenderness as peritoneal sign'],
        missedQuestions: ['Last menstrual period (to exclude ectopic pregnancy in female patients)'],
        teachingPoints: ['Alvarado score ≥7 strongly suggests appendicitis', 'Perforation risk increases significantly after 72 hours of symptoms', 'Ultrasound first in children and pregnant women to avoid radiation'],
        differentials: ['Mesenteric Adenitis', 'Ovarian Torsion', 'Meckel\'s Diverticulitis', 'Right-sided Colitis'],
      },
    },
    {
      system: 'Endocrine / Metabolic', difficulty: 'Clinical',
      diagnosis: 'Diabetic Ketoacidosis (DKA)', userDiagnosis: 'Diabetic Ketoacidosis',
      correct: true, score: 84, questionCount: 10, elapsedSeconds: 660,
      daysBack: 7, hoursBack: 4,
      grading_result: {
        score: 84, correct: true,
        feedback: 'Good management of a complex metabolic case. You identified the triad of hyperglycemia, ketosis, and acidosis efficiently. The fluid resuscitation approach was appropriate.',
        dimensions: {
          historyInterview: { score: 15, feedback: 'Asked about polyuria, polydipsia, and precipitating illness. Good coverage.', max: 18 },
          testOrdering:     { score: 16, feedback: 'BMP, urinalysis, and blood gas were the key tests — all ordered correctly.', max: 18 },
          diagnosisAccuracy:{ score: 24, feedback: 'Correct diagnosis identified from lab pattern.', max: 27 },
          diagnosisCompleteness: { score: 12, feedback: 'Named DKA and identified precipitating factor.', max: 13 },
          clinicalReasoning: { score: 12, feedback: 'Solid reasoning with appropriate urgency.', max: 14 },
        },
        strengths: ['Identified anion gap metabolic acidosis from labs', 'Asked about insulin compliance', 'Recognized precipitating infection'],
        missedQuestions: ['Any recent changes to insulin regimen?', 'Sick-day management plan?'],
        teachingPoints: ['DKA management: fluid resuscitation first, then insulin drip only after K+ ≥3.5', 'Never give insulin until potassium is repleted — risk of fatal hypokalemia', 'Phosphate replacement indicated if <1.0 mg/dL'],
        differentials: ['Hyperosmolar Hyperglycemic State (HHS)', 'Alcoholic Ketoacidosis', 'Starvation Ketosis', 'Sepsis with Stress Hyperglycemia'],
      },
    },
    {
      system: 'Renal', difficulty: 'Foundations',
      diagnosis: 'Acute Kidney Injury — Prerenal Azotemia', userDiagnosis: 'Dehydration / Prerenal AKI',
      correct: true, score: 76, questionCount: 8, elapsedSeconds: 420,
      daysBack: 6, hoursBack: 1,
      grading_result: {
        score: 76, correct: true,
        feedback: 'Good recognition of prerenal pattern. The FENa calculation and urine osmolality interpretation were correctly applied. Volume assessment history could be more thorough.',
        dimensions: {
          historyInterview: { score: 13, feedback: 'Asked about fluid intake and output, but missed NSAID use history.', max: 18 },
          testOrdering:     { score: 15, feedback: 'BMP, urinalysis, and FENa — all appropriate. Good test efficiency.', max: 18 },
          diagnosisAccuracy:{ score: 21, feedback: 'Correct diagnosis. Differentiated prerenal from intrinsic AKI well.', max: 27 },
          diagnosisCompleteness: { score: 10, feedback: 'Identified prerenal cause but management plan was vague.', max: 13 },
          clinicalReasoning: { score: 11, feedback: 'Reasonable reasoning, minor gaps in reversible cause identification.', max: 14 },
        },
        strengths: ['Interpreted FENa <1% correctly as prerenal', 'Asked about oral intake and vomiting', 'Ordered urine osmolality to confirm prerenal state'],
        missedQuestions: ['NSAID or ACE inhibitor use (common prerenal contributors)', 'Recent diarrhea or GI losses', 'Urine output trend over past 24 hours'],
        teachingPoints: ['FENa <1% suggests prerenal; >2% suggests intrinsic renal injury (less reliable on diuretics)', 'Muddy brown casts = ATN; hyaline casts = prerenal', 'Catheterize to accurately measure urine output before diagnosing oliguria'],
        differentials: ['Intrinsic AKI / ATN', 'Obstructive Uropathy', 'Glomerulonephritis', 'Hepatorenal Syndrome'],
      },
    },
    {
      system: 'Infectious', difficulty: 'Clinical',
      diagnosis: 'Bacterial Meningitis', userDiagnosis: 'Viral Meningitis',
      correct: false, score: 55, questionCount: 9, elapsedSeconds: 810,
      daysBack: 5, hoursBack: 6,
      grading_result: {
        score: 55, correct: false,
        feedback: 'You correctly recognized meningitis but the CSF findings (high WBC >1000, low glucose, high protein, neutrophilic pleocytosis) are classic for bacterial etiology, not viral. The presence of petechiae and altered mental status also point to a more severe bacterial process requiring immediate antibiotics.',
        dimensions: {
          historyInterview: { score: 13, feedback: 'Good triad history (headache, fever, neck stiffness). Asked about sick contacts.', max: 18 },
          testOrdering:     { score: 14, feedback: 'LP was appropriate. Blood cultures before LP were correctly ordered.', max: 18 },
          diagnosisAccuracy:{ score: 13, feedback: 'Incorrect — bacterial vs viral distinction is clinically critical.', max: 27 },
          diagnosisCompleteness: { score: 9,  feedback: 'Identified meningitis but wrong pathogen category.', max: 13 },
          clinicalReasoning: { score: 9,  feedback: 'Reasoning did not weight CSF glucose and WBC appropriately.', max: 14 },
        },
        strengths: ['Recognized meningitic syndrome', 'Ordered LP after CT to rule out herniation', 'Noted petechial rash as alarming feature'],
        missedQuestions: ['Immunization history (meningococcal vaccine)', 'Close-contact settings (dorms, military barracks)', 'Speed of symptom onset — hours vs days'],
        teachingPoints: ['Bacterial CSF: WBC >100 (neutrophils), glucose <40 mg/dL, protein >200 mg/dL', 'Do NOT delay antibiotics for CT or LP — give ceftriaxone + vancomycin immediately if bacterial suspected', 'Dexamethasone reduces mortality in pneumococcal meningitis when given before or with first antibiotic dose'],
        differentials: ['Bacterial Meningitis (Neisseria meningitidis, S. pneumoniae)', 'Viral Meningitis (Enterovirus)', 'HSV Encephalitis', 'Subarachnoid Hemorrhage'],
      },
    },
    {
      system: 'Hematologic / Oncologic', difficulty: 'Foundations',
      diagnosis: 'Iron-Deficiency Anemia', userDiagnosis: 'Iron-Deficiency Anemia',
      correct: true, score: 85, questionCount: 8, elapsedSeconds: 450,
      daysBack: 4, hoursBack: 2,
      grading_result: {
        score: 85, correct: true,
        feedback: 'Well-executed approach to a common clinical presentation. You efficiently identified the microcytic hypochromic pattern and worked up for a source of blood loss. Good GI workup suggestion.',
        dimensions: {
          historyInterview: { score: 15, feedback: 'Asked about diet, menstrual history, and GI symptoms appropriately.', max: 18 },
          testOrdering:     { score: 16, feedback: 'CBC, peripheral smear, ferritin, TIBC — correct and efficient panel.', max: 18 },
          diagnosisAccuracy:{ score: 24, feedback: 'Correct diagnosis based on lab pattern.', max: 27 },
          diagnosisCompleteness: { score: 12, feedback: 'Named the diagnosis and source investigation plan.', max: 13 },
          clinicalReasoning: { score: 12, feedback: 'Systematic approach to anemia with good differential narrowing.', max: 14 },
        },
        strengths: ['Interpreted low ferritin and high TIBC correctly', 'Asked about menorrhagia', 'Recommended colonoscopy for occult GI blood loss'],
        missedQuestions: ['Pica (ice, dirt) — classic in IDA', 'NSAID or aspirin use', 'Previous anemia diagnoses or blood transfusions'],
        teachingPoints: ['Ferritin is an acute phase reactant — can be falsely normal in IDA with concurrent inflammation', 'Treat the underlying cause, not just the anemia', 'Oral iron causes GI side effects; IV iron preferred for malabsorption or intolerance'],
        differentials: ['Thalassemia Trait', 'Anemia of Chronic Disease', 'Sideroblastic Anemia', 'Lead Poisoning'],
      },
    },
    {
      system: 'Musculoskeletal', difficulty: 'Clinical',
      diagnosis: 'Septic Arthritis', userDiagnosis: 'Gout',
      correct: false, score: 48, questionCount: 7, elapsedSeconds: 600,
      daysBack: 3, hoursBack: 3,
      grading_result: {
        score: 48, correct: false,
        feedback: 'Both gout and septic arthritis present with hot, swollen, exquisitely tender joints — the key distinguishing factor is joint aspiration. The synovial fluid WBC >50,000 with predominant neutrophils and positive gram stain/culture confirms septic arthritis, which is a surgical emergency. The absence of prior gout history, fever, and elevated WBC should have pointed away from gout.',
        dimensions: {
          historyInterview: { score: 11, feedback: 'Missed asking about prior gout attacks, fever duration, and recent infection/procedure.', max: 18 },
          testOrdering:     { score: 10, feedback: 'Did not order joint aspiration — this is mandatory for any suspected septic joint.', max: 18 },
          diagnosisAccuracy:{ score: 11, feedback: 'Incorrect. Urate crystals distinguish gout; absence of crystals + high WBC = septic.', max: 27 },
          diagnosisCompleteness: { score: 8,  feedback: 'Differential was too narrow; did not include septic arthritis prominently.', max: 13 },
          clinicalReasoning: { score: 8,  feedback: 'Anchoring bias toward gout without confirming with synovial fluid analysis.', max: 14 },
        },
        strengths: ['Identified monoarticular joint involvement', 'Ordered uric acid level', 'Noted inflammatory pattern of pain'],
        missedQuestions: ['Any recent fever or chills?', 'Recent skin infection, procedure, or IV drug use?', 'Prior episodes of joint swelling?'],
        teachingPoints: ['Every hot joint requires arthrocentesis — "when in doubt, tap it out"', 'Septic arthritis can destroy cartilage within 24-48 hours — it is a surgical emergency', 'Gout crystals are needle-shaped and negatively birefringent; pseudogout crystals are rhomboid and positively birefringent'],
        differentials: ['Septic Arthritis', 'Gout', 'Pseudogout (CPPD)', 'Reactive Arthritis'],
      },
    },
    {
      system: 'Cardiovascular', difficulty: 'Clinical',
      diagnosis: 'Acute Decompensated Heart Failure', userDiagnosis: 'Acute Decompensated Heart Failure',
      correct: true, score: 81, questionCount: 10, elapsedSeconds: 750,
      daysBack: 2, hoursBack: 5,
      grading_result: {
        score: 81, correct: true,
        feedback: 'Good recognition of acute decompensated heart failure. You appropriately identified volume overload and ordered BNP. The management plan was reasonable, though diuretic dose selection could have been more specific.',
        dimensions: {
          historyInterview: { score: 14, feedback: 'Orthopnea and PND were elicited. Medication compliance history was important and you asked.', max: 18 },
          testOrdering:     { score: 15, feedback: 'BNP, CXR, echo were correctly prioritized. Troponin to rule out ACS was appropriate.', max: 18 },
          diagnosisAccuracy:{ score: 23, feedback: 'Correct diagnosis with good supporting evidence.', max: 27 },
          diagnosisCompleteness: { score: 12, feedback: 'Named ADHF and identified likely precipitant.', max: 13 },
          clinicalReasoning: { score: 11, feedback: 'Solid reasoning. Volume status assessment was systematic.', max: 14 },
        },
        strengths: ['Identified 3-pillow orthopnea as classic HF symptom', 'Ordered BNP promptly', 'Checked medication adherence as precipitant', 'Auscultated for S3 gallop and bibasilar rales'],
        missedQuestions: ['Dietary sodium and fluid restriction compliance', 'Recent NSAID or steroid use (both worsen fluid retention)', 'Recent cardiac procedure or hospitalization'],
        teachingPoints: ['BNP >500 pg/mL is highly specific for decompensated HF', 'Furosemide IV dose should be ≥ oral home dose for adequate diuresis', 'Four precipitants of ADHF: dietary indiscretion, medication non-adherence, new arrhythmia, ischemia'],
        differentials: ['Cardiac Tamponade', 'Constrictive Pericarditis', 'ARDS', 'Bilateral Pneumonia'],
      },
    },
    {
      system: 'Psychiatric', difficulty: 'Foundations',
      diagnosis: 'Major Depressive Disorder', userDiagnosis: 'Major Depressive Disorder',
      correct: true, score: 73, questionCount: 9, elapsedSeconds: 510,
      daysBack: 1, hoursBack: 8,
      grading_result: {
        score: 73, correct: true,
        feedback: 'You correctly identified MDD and applied DSM-5 criteria systematically. Safety assessment was thorough. The differential consideration of hypothyroidism as a medical cause was good clinical thinking.',
        dimensions: {
          historyInterview: { score: 13, feedback: 'Good SIGECAPS assessment. Suicidality screen was appropriate and thorough.', max: 18 },
          testOrdering:     { score: 14, feedback: 'TSH and CBC to rule out organic causes were appropriate. PHQ-9 validated the diagnosis.', max: 18 },
          diagnosisAccuracy:{ score: 20, feedback: 'Correct diagnosis. DSM-5 criteria were met and documented.', max: 27 },
          diagnosisCompleteness: { score: 11, feedback: 'Named diagnosis and identified impact on functioning.', max: 13 },
          clinicalReasoning: { score: 10, feedback: 'Good use of validated screening tools.', max: 14 },
        },
        strengths: ['Applied SIGECAPS mnemonic systematically', 'Asked about suicidal ideation with plan and intent', 'Ruled out hypothyroidism and anemia with labs', 'Assessed functional impairment and duration'],
        missedQuestions: ['Prior episodes of depression or mania (to rule out bipolar)', 'Family psychiatric history', 'Substance use — alcohol and cannabis can mimic and worsen MDD'],
        teachingPoints: ['MDD requires ≥5 SIGECAPS symptoms for ≥2 weeks including depressed mood or anhedonia', 'Always screen for hypomania/mania before starting antidepressants — SSRIs can precipitate mania in bipolar patients', 'PHQ-9 score ≥10 has good sensitivity/specificity for MDD; use for monitoring treatment response'],
        differentials: ['Bipolar Disorder (Depressive Episode)', 'Persistent Depressive Disorder (Dysthymia)', 'Hypothyroidism', 'Adjustment Disorder with Depressed Mood'],
      },
    },
    {
      system: 'Toxicologic', difficulty: 'Advanced',
      diagnosis: 'Acetaminophen Toxicity', userDiagnosis: 'Acetaminophen Overdose',
      correct: true, score: 89, questionCount: 12, elapsedSeconds: 900,
      daysBack: 0, hoursBack: 6,
      grading_result: {
        score: 89, correct: true,
        feedback: 'Excellent management of a toxicological emergency. You correctly used the Rumack-Matthew nomogram interpretation, initiated NAC early, and arranged hepatology consultation. Time to ingestion determination was systematic.',
        dimensions: {
          historyInterview: { score: 16, feedback: 'Thorough ingestion history: dose, time, formulation (extended-release vs regular), coingestants.', max: 18 },
          testOrdering:     { score: 17, feedback: 'APAP level at 4 hours, LFTs, INR, and renal function — all critical and ordered correctly.', max: 18 },
          diagnosisAccuracy:{ score: 25, feedback: 'Correct diagnosis and timely initiation of antidote.', max: 27 },
          diagnosisCompleteness: { score: 12, feedback: 'Complete workup and appropriate escalation plan.', max: 13 },
          clinicalReasoning: { score: 13, feedback: 'Excellent integration of nomogram with clinical picture.', max: 14 },
        },
        strengths: ['Determined time of ingestion accurately', 'Used Rumack-Matthew nomogram to guide NAC decision', 'Checked for coingestants (salicylates)', 'Monitored LFTs and INR as markers of hepatotoxicity', 'Arranged hepatology consultation proactively'],
        missedQuestions: ['Any prior liver disease that would lower the toxicity threshold?', 'Chronic alcohol use (increases susceptibility to APAP hepatotoxicity)', 'Other acetaminophen-containing products taken recently?'],
        teachingPoints: ['NAC is most effective within 8-10 hours of ingestion; do not wait for symptoms', 'Extended-release formulations require a second APAP level at 8 hours', 'King\'s College Criteria guide liver transplant listing in acute liver failure from APAP'],
        differentials: ['Salicylate Toxicity', 'Acute Viral Hepatitis', 'Alcoholic Hepatitis', 'Ischemic Hepatopathy'],
      },
    },
  ]

  return cases.map((c, i) => {
    const completedAt = daysAgo(c.daysBack, c.hoursBack)
    const startedAt   = new Date(new Date(completedAt).getTime() - c.elapsedSeconds * 1000).toISOString()
    return {
      id: makeId(),
      user_id: userId,
      started_at: startedAt,
      completed_at: completedAt,
      system: c.system,
      difficulty: c.difficulty,
      diagnosis: c.diagnosis,
      user_diagnosis: c.userDiagnosis,
      correct: c.correct,
      score: c.score,
      question_count: c.questionCount,
      elapsed_seconds: c.elapsedSeconds,
      total_cost_usd: parseFloat((Math.random() * 0.08 + 0.02).toFixed(4)),
      total_input_tokens: Math.floor(Math.random() * 15000 + 8000),
      total_output_tokens: Math.floor(Math.random() * 2000 + 800),
      api_calls: [],
      grading_result: c.grading_result,
    }
  })
}

async function main() {
  console.log(`Looking up user: ${USER_EMAIL}`)
  const userId = await getUserId(USER_EMAIL)
  console.log(`Found user ID: ${userId}`)

  const sessions = makeSessions(userId)
  console.log(`Inserting ${sessions.length} case sessions…`)

  const { error } = await db.from('case_sessions').insert(sessions)
  if (error) {
    console.error('Insert failed:', error)
    process.exit(1)
  }

  console.log(`✓ Inserted ${sessions.length} sessions successfully`)

  // Also mark first_case_completed on the profile so the dashboard shows stats
  const { error: pe } = await db
    .from('profiles')
    .update({ first_case_completed: true })
    .eq('id', userId)
  console.log(!pe ? '✓ Profile updated (first_case_completed = true)' : `⚠ Profile update error: ${pe.message}`)
}

main().catch(err => { console.error(err); process.exit(1) })
