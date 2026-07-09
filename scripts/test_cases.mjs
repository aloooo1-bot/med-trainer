// End-to-end case tester — calls the live dev server API
// Generates + solves Foundations, Clinical, Advanced cases as a 4th-year med student

const BASE = 'http://localhost:3000';

// /api/claude (the open browser proxy) was removed in the security remediation;
// scripts call the Anthropic API directly with the key from .env.local.
const { config } = await import('dotenv');
config({ path: '.env.local' });

async function claude(system, messages, max_tokens = 10000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', system, messages, max_tokens }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message ?? r.status);
  return d.content[0].text;
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON found');
  return JSON.parse(m[0]);
}

// ── CASE GENERATION PROMPTS (mirrors app/page.tsx exactly) ──────────────────

const CLAUDE_SYSTEM = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.`;

const DIFF_RULES = {
  Foundations: `DIFFICULTY — FOUNDATIONS:
- Common, high-prevalence diagnosis
- Classic textbook symptom presentation
- No significant comorbidities
- Lab values clearly point toward diagnosis
- 1-2 obvious differentials
- Output required: Diagnosis only`,
  Clinical: `DIFFICULTY — CLINICAL:
- Moderate prevalence diagnosis
- 1-2 atypical or missing classic features
- One comorbidity that adds complexity
- Some lab values are ambiguous or mildly misleading
- 3-4 differentials worth considering
- Output required: SOAP note + Diagnosis`,
  Advanced: `DIFFICULTY — ADVANCED:
- Uncommon or rare diagnosis
- Atypical presentation with red herrings
- Multiple comorbidities
- Lab/imaging findings require synthesis
- Must justify top 3 differentials with evidence
- Output required: SOAP note + Diagnosis + Differential justification`,
};

const HPI_SPEC = {
  Foundations: '"<detailed 4-5 sentence HPI: onset, duration, character, radiation, associated symptoms>"',
  Clinical: '"<2-3 sentences ONLY. State age, sex, primary symptom, duration. STOP THERE.>"',
  Advanced: '"<1-2 sentences ONLY. Vague. ONE non-specific symptom, ONE misleading incidental detail.>"',
};

const SYSTEMS_LIST = ['Cardiovascular', 'Respiratory', 'Gastrointestinal', 'Renal', 'Neurologic', 'Infectious'];

function buildPrompt(system, difficulty) {
  return `Generate a realistic ${system} clinical case. Strictly follow the difficulty rules below.

${DIFF_RULES[difficulty]}

Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component.
{
  "patientInfo": {"name":"First Last","age":0,"gender":"Male or Female","chiefComplaint":"cc","height":"5'9\"","heightInches":69},
  "hpi": ${HPI_SPEC[difficulty]},
  "vitals": {"bp":"120/80","hr":80,"rr":16,"temp":98.6,"spo2":98,"weight":"170 lbs"},
  "reviewOfSystems": {"Constitutional":"","HEENT":"","Cardiovascular":"","Respiratory":"","Gastrointestinal":"","Genitourinary":"","Musculoskeletal":"","Neurological":"","Psychiatric":"","Integumentary":"","Endocrine":"","Hematologic/Lymphatic":"","Allergic/Immunologic":""},
  "physicalExam": {"General":"","HEENT":"","Neck":"","Cardiovascular":"","Pulmonary":"","Abdomen":"","Extremities":"","Neurological":"","Skin":""},
  "availableLabs": ["lab1","lab2"],
  "availableImaging": ["img1"],
  "labGroups": [{"name":"Complete Blood Count (CBC)","tests":["Complete Blood Count (CBC)"]}],
  "labResults": {"<panel name>":{"components":[{"name":"analyte","value":"val","unit":"unit","referenceRange":"range","status":"normal"}]}},
  "imagingResults": {"<imaging study name>":"<radiology report impression>"},
  "procedureResults": {},
  "hiddenHistory": {
    "fullHistory": "${difficulty === 'Foundations' ? 'N/A' : '<full hidden history>'}",
    "socialHistory":"","familyHistory":"","medications":"","hiddenSymptoms":"","allergies":""
  },
  "diagnosis": "<specific diagnosis>",
  "differentials": ["dx1","dx2","dx3"],
  "teachingPoints": ["point1","point2","point3"],
  "keyQuestions": ["q1","q2","q3"],
  "imagingCategory": "<1-3 word radiological descriptor>",
  "ecgFindings": "<ECG description or omit if not cardiac>",
  "pastMedicalHistory": {"conditions":"","surgeries":"","hospitalizations":""},
  "currentMedications": {"medications":"","otc":""},
  "socialHistory": {"smoking":"","alcohol":"","drugs":"","occupation":"","living":"","other":""}
}`;
}

// ── GRADING PROMPT (mirrors app exactly) ────────────────────────────────────

function buildGradingPrompt(caseData, orderedLabs, orderedImaging, chatSummary, userDiagnosis, userPresentation, difficulty, timedOut) {
  return `Case: ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, CC: "${caseData.patientInfo.chiefComplaint}"
HPI: ${caseData.hpi}
Difficulty: ${difficulty}

Tests ordered:
${orderedLabs || '(no labs ordered)'}
${orderedImaging || '(no imaging ordered)'}

Patient interview transcript:
${chatSummary || '(physician did not interview the patient)'}

${userPresentation ? `Trainee's written clinical reasoning:\n"""\n${userPresentation}\n"""` : '(No clinical reasoning text provided)'}

Trainee's submitted diagnosis: "${userDiagnosis}"
Correct diagnosis: "${caseData.diagnosis}"
Key clinical information: ${caseData.keyQuestions.join(' | ')}
Teaching points: ${caseData.teachingPoints.join(' | ')}
Differentials: ${caseData.differentials.join(', ')}

SCORING WEIGHTS (must sum to 90):
- History & Interview (historyInterview): 18 points
- Test Ordering (testOrdering): 18 points
- Diagnosis Accuracy (diagnosisAccuracy): 27 points
- Diagnosis Completeness (diagnosisCompleteness): 13 points
- Clinical Reasoning (clinicalReasoning): 14 points

Return ONLY valid JSON:
{
  "score": <0-90>,
  "correct": <true/false>,
  "feedback": "<2-3 sentences>",
  "strengths": ["<item>"],
  "dimensions": {
    "historyInterview": {"score":<0-18>,"feedback":"<1 sentence>"},
    "testOrdering": {"score":<0-18>,"feedback":"<1 sentence>"},
    "diagnosisAccuracy": {"score":<0-27>,"feedback":"<1 sentence>"},
    "diagnosisCompleteness": {"score":<0-13>,"feedback":"<1 sentence>"},
    "clinicalReasoning": {"score":<0-14>,"feedback":"<1 sentence>"}
  },
  "missedQuestions": ["<q>"],
  "teachingPoints": ${JSON.stringify(caseData.teachingPoints)},
  "differentials": ["<dx>: <1 sentence>"]
}`;
}

const GRADING_SYSTEM = `You are a medical education evaluator grading a trainee's diagnostic performance.
You are grading a medical student, not a resident or attending. Apply a standard appropriate for someone still developing clinical reasoning. Reward correct thinking and penalize genuine errors, but do not penalize for absence of advanced clinical nuance unless the difficulty level is Advanced. When choosing between two scores, choose the higher one. The goal is accurate, encouraging feedback that motivates improvement — not a score that discourages continued learning.
Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

// ── PATIENT INTERVIEW (simulates student asking questions) ───────────────────

async function askPatient(caseData, question, history, difficulty) {
  const sys = `You are roleplaying as a patient named ${caseData.patientInfo.name}, a ${caseData.patientInfo.age}-year-old ${caseData.patientInfo.gender} who came to the clinic with "${caseData.patientInfo.chiefComplaint}".
What you have told them so far: ${caseData.hpi}
Other info only if asked directly:
- Social history: ${caseData.hiddenHistory.socialHistory}
- Family history: ${caseData.hiddenHistory.familyHistory}
- Medications: ${caseData.hiddenHistory.medications}
- Allergies: ${caseData.hiddenHistory.allergies}
- Hidden symptoms: ${caseData.hiddenHistory.hiddenSymptoms}
Rules: Respond naturally as a patient. Keep answers 2-3 sentences. Use lay terms.`;
  const msgs = [...history, { role: 'user', content: question }];
  const reply = await claude(sys, msgs, 200);
  return reply;
}

// ── SEPARATOR ────────────────────────────────────────────────────────────────

function sep(title) {
  console.log('\n' + '═'.repeat(70));
  console.log('  ' + title);
  console.log('═'.repeat(70));
}

function sub(title) {
  console.log('\n── ' + title + ' ──');
}

// ── MAIN TEST ────────────────────────────────────────────────────────────────

async function testCase(bodySystem, difficulty) {
  sep(`CASE: ${difficulty.toUpperCase()} — ${bodySystem}`);

  // 1. Generate case
  console.log('Generating case...');
  const prompt = buildPrompt(bodySystem, difficulty);
  const rawText = await claude(CLAUDE_SYSTEM, [{ role: 'user', content: prompt }], 11000);
  let caseData;
  try {
    caseData = parseJSON(rawText);
  } catch (e) {
    console.error('PARSE ERROR:', e.message);
    console.error('Raw text (first 500):', rawText.substring(0, 500));
    return;
  }

  // Print case summary
  sub('CASE SUMMARY');
  console.log(`Patient: ${caseData.patientInfo.name}, ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}`);
  console.log(`CC: ${caseData.patientInfo.chiefComplaint}`);
  console.log(`HPI: ${caseData.hpi}`);
  console.log(`Vitals: BP ${caseData.vitals.bp} | HR ${caseData.vitals.hr} | RR ${caseData.vitals.rr} | Temp ${caseData.vitals.temp}°F | SpO₂ ${caseData.vitals.spo2}%`);
  console.log(`Correct diagnosis: ${caseData.diagnosis}`);

  // 2. Evaluate case quality
  sub('CASE QUALITY CHECK');
  const labs = caseData.availableLabs || [];
  const imaging = caseData.availableImaging || [];
  const labResults = caseData.labResults || {};
  const imgResults = caseData.imagingResults || {};

  console.log(`Labs available (${labs.length}): ${labs.join(', ')}`);
  console.log(`Imaging available (${imaging.length}): ${imaging.join(', ')}`);

  // Check every lab has results
  const labsMissingResults = labs.filter(l => {
    const norm = l.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
    return !Object.keys(labResults).some(k => {
      const kn = k.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
      return kn === norm || kn.includes(norm) || norm.includes(kn);
    });
  });
  if (labsMissingResults.length > 0) {
    console.log(`⚠ LABS WITH NO RESULT IN labResults: ${labsMissingResults.join(', ')}`);
  } else {
    console.log(`✓ All labs have corresponding labResults entries`);
  }

  // Check component arrays
  let missingComponents = [];
  Object.entries(labResults).forEach(([k, v]) => {
    if (!Array.isArray(v.components) || v.components.length === 0) {
      missingComponents.push(k);
    }
  });
  if (missingComponents.length > 0) {
    console.log(`⚠ LABS MISSING components array: ${missingComponents.join(', ')}`);
  } else {
    console.log(`✓ All labResults have components arrays`);
  }

  // Check imaging has results
  const imgMissing = imaging.filter(i => {
    const norm = i.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
    return !Object.keys(imgResults).some(k => {
      const kn = k.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
      return kn === norm || kn.includes(norm) || norm.includes(kn);
    });
  });
  if (imgMissing.length > 0) {
    console.log(`⚠ IMAGING WITH NO RESULT: ${imgMissing.join(', ')}`);
  } else {
    console.log(`✓ All imaging has results`);
  }

  // Check ECG
  const hasCardiacIndication = (bodySystem === 'Cardiovascular' || (caseData.patientInfo.chiefComplaint||'').toLowerCase().includes('chest'));
  const hasECGInImaging = imaging.some(i => /ecg|ekg|electrocardiogram/i.test(i));
  if (hasCardiacIndication && !hasECGInImaging) {
    console.log(`⚠ CARDIAC CASE: ECG missing from availableImaging`);
  } else if (hasCardiacIndication) {
    console.log(`✓ Cardiac case includes ECG in imaging`);
  }
  console.log(`ECG findings: ${caseData.ecgFindings || '(none)'}`);
  console.log(`Imaging category: ${caseData.imagingCategory || '(none)'}`);

  // Check HPI length/detail for difficulty
  const hpiWords = caseData.hpi.trim().split(/\s+/).length;
  if (difficulty === 'Foundations' && hpiWords < 40) console.log(`⚠ Foundations HPI too short (${hpiWords} words, expected 50+)`);
  else if (difficulty === 'Clinical' && hpiWords > 80) console.log(`⚠ Clinical HPI too detailed (${hpiWords} words, should be 20-40)`);
  else if (difficulty === 'Advanced' && hpiWords > 50) console.log(`⚠ Advanced HPI too revealing (${hpiWords} words, should be <30)`);
  else console.log(`✓ HPI length appropriate for difficulty (${hpiWords} words)`);

  // Print some key abnormal labs
  sub('KEY ABNORMAL LABS');
  Object.entries(labResults).forEach(([k, v]) => {
    const abn = (v.components || []).filter(c => c.status === 'abnormal' || c.status === 'critical');
    if (abn.length > 0) {
      console.log(`  ${k}: ${abn.map(c => `${c.name} ${c.value}${c.unit} [${c.status}]`).join(', ')}`);
    }
  });

  // Print imaging reports
  sub('IMAGING REPORTS');
  Object.entries(imgResults).forEach(([k, v]) => {
    console.log(`  [${k}]: ${v.substring(0, 200)}`);
  });

  // 3. Simulate patient interview (3-5 questions)
  sub('PATIENT INTERVIEW SIMULATION');
  const questions = difficulty === 'Foundations' ? [
    'Can you describe your pain — where is it, and does it go anywhere?',
    'How long have you had this, and what makes it better or worse?',
    'Do you have any other symptoms like shortness of breath, sweating, or nausea?',
  ] : difficulty === 'Clinical' ? [
    'Tell me more about when this started and how it has progressed.',
    'Do you have any shortness of breath, fever, or other symptoms?',
    'Any relevant medical history — chronic conditions, hospitalizations, or family history?',
    'What medications are you currently taking, and do you smoke or drink?',
  ] : [
    'Tell me exactly when your symptoms started and how they have changed over time.',
    'Have you had any fever, night sweats, or unintentional weight loss?',
    'Any family history of similar illness or relevant conditions?',
    'Do you have any other symptoms — even ones that seem unrelated?',
    'Have you traveled recently or had any unusual exposures?',
  ];

  const chatHistory = [];
  for (const q of questions) {
    console.log(`STUDENT: ${q}`);
    const reply = await askPatient(caseData, q, chatHistory, difficulty);
    console.log(`PATIENT: ${reply}`);
    chatHistory.push({ role: 'user', content: q });
    chatHistory.push({ role: 'assistant', content: reply });
    console.log();
  }

  // 4. Order tests (pick the most relevant ones as a 4th-year student)
  sub('TESTS ORDERED');
  const orderedLabNames = labs.slice(0, Math.min(labs.length, 5));
  const orderedImgNames = imaging.slice(0, Math.min(imaging.length, 3));
  console.log('Labs:', orderedLabNames.join(', '));
  console.log('Imaging:', orderedImgNames.join(', '));

  // Build lab/imaging result strings for grading
  const orderedLabStr = orderedLabNames.map(name => {
    const norm = name.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
    const key = Object.keys(labResults).find(k => {
      const kn = k.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
      return kn === norm || kn.includes(norm) || norm.includes(kn);
    });
    if (!key) return `${name}: (no result)`;
    const v = labResults[key];
    if (v.components?.length > 0) {
      return `${name}:\n` + v.components.map(c => `  ${c.name}: ${c.value} ${c.unit} (ref: ${c.referenceRange}) [${c.status}]`).join('\n');
    }
    return `${name}: ${v.value || v.result} [${v.status}]`;
  }).join('\n');

  const orderedImgStr = orderedImgNames.map(name => {
    const norm = name.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
    const key = Object.keys(imgResults).find(k => {
      const kn = k.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
      return kn === norm || kn.includes(norm) || norm.includes(kn);
    });
    return key ? `${name}: ${imgResults[key]}` : `${name}: (no result)`;
  }).join('\n');

  const chatSummary = chatHistory.map(m => `${m.role === 'user' ? 'Physician' : 'Patient'}: ${m.content}`).join('\n');

  // 5. Submit diagnosis
  sub('DIAGNOSIS SUBMISSION');
  // As a 4th-year student, make a reasonable diagnosis
  const studentDiagnosis = caseData.diagnosis; // we know the answer — test if grading is fair for a correct Dx
  let reasoning = '';
  if (difficulty === 'Clinical' || difficulty === 'Advanced') {
    // Build reasoning from what we know from labs and exam
    const physExam = Object.entries(caseData.physicalExam || {}).slice(0,3).map(([k,v])=>`${k}: ${v}`).join('; ');
    const abnLabs = Object.entries(labResults).flatMap(([k,v]) =>
      (v.components||[]).filter(c=>c.status!=='normal').map(c=>`${c.name} ${c.value}${c.unit}`)
    ).slice(0,5).join(', ');
    reasoning = `This patient's presentation is consistent with ${caseData.diagnosis}. ` +
      `Key findings supporting this diagnosis include: ${physExam ? 'Physical exam showed ' + physExam + '. ' : ''}` +
      `${abnLabs ? 'Notably abnormal labs: ' + abnLabs + '. ' : ''}` +
      `The clinical picture, combined with the history and test results, strongly supports this diagnosis. ` +
      `Main differentials considered were ${caseData.differentials.slice(0,2).join(' and ')}, but these were less likely given the overall clinical context.`;
  }
  console.log(`Diagnosis: ${studentDiagnosis}`);
  if (reasoning) console.log(`Reasoning (${reasoning.split(' ').length} words): ${reasoning.substring(0,300)}...`);

  // 6. Grade
  sub('GRADING');
  const gradingPrompt = buildGradingPrompt(caseData, orderedLabStr, orderedImgStr, chatSummary, studentDiagnosis, reasoning, difficulty, false);
  const gradeText = await claude(GRADING_SYSTEM, [{ role: 'user', content: gradingPrompt }], 2000);
  let grade;
  try {
    grade = parseJSON(gradeText);
  } catch(e) {
    console.error('GRADING PARSE ERROR:', e.message);
    return;
  }

  console.log(`SCORE: ${grade.score}/90 (correct: ${grade.correct})`);
  console.log(`FEEDBACK: ${grade.feedback}`);
  if (grade.dimensions) {
    Object.entries(grade.dimensions).forEach(([k,v]) => {
      const maxes = {historyInterview:18, testOrdering:18, diagnosisAccuracy:27, diagnosisCompleteness:13, clinicalReasoning:14};
      console.log(`  ${k}: ${v.score}/${maxes[k]} — ${v.feedback}`);
    });
  }
  console.log(`Strengths: ${(grade.strengths||[]).join('; ')}`);
  console.log(`Missed: ${(grade.missedQuestions||[]).join('; ') || 'none'}`);

  // 7. Evaluation
  sub('EVALUATION NOTES');
  if (!grade.correct) console.log('⚠ GRADER: Marked INCORRECT even though we submitted the exact correct diagnosis!');
  else console.log('✓ Grader correctly identified the diagnosis as correct');
  if (grade.score < 60) console.log(`⚠ Score ${grade.score}/90 seems LOW for a correct diagnosis with relevant workup`);
  else if (grade.score >= 80) console.log(`✓ Score ${grade.score}/90 seems appropriate for correct dx`);
  else console.log(`~ Score ${grade.score}/90 — moderate, review dimension feedback`);

  const dimScores = grade.dimensions || {};
  if (dimScores.historyInterview?.score < 10) console.log(`⚠ History score ${dimScores.historyInterview.score}/18 seems harsh — we asked ${questions.length} relevant questions`);
  if (dimScores.testOrdering?.score < 12) console.log(`⚠ Test ordering score ${dimScores.testOrdering.score}/18 seems harsh`);

  return { caseData, grade, difficulty, bodySystem };
}

// ── RUN ALL THREE ────────────────────────────────────────────────────────────

(async () => {
  try {
    console.log('MedTrainer — 4th Year Medical Student Case Evaluation');
    console.log('Testing: Foundations (Cardiovascular), Clinical (Respiratory), Advanced (Infectious)');

    const r1 = await testCase('Cardiovascular', 'Foundations');
    const r2 = await testCase('Respiratory', 'Clinical');
    const r3 = await testCase('Infectious', 'Advanced');

    sep('SUMMARY REPORT');
    [r1, r2, r3].filter(Boolean).forEach(r => {
      const total = r.grade.score;
      const label = total >= 80 ? 'Excellent' : total >= 65 ? 'Pass' : 'Needs review';
      console.log(`${r.difficulty} (${r.bodySystem}): ${r.caseData.diagnosis} → ${total}/90 — ${label} (correct: ${r.grade.correct})`);
    });
  } catch(e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  }
})();
