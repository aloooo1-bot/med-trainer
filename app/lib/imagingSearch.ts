export interface OpenIResult {
  uid: string
  imageUrl: string
  thumbnailUrl: string
  caption: string
  modality: string
  abstract?: string
  agentVerified?: boolean
  confidence?: number
  verificationReason?: string
}

type ModalityKey = 'xray' | 'ct' | 'mri' | 'us'

interface TestParams {
  it: string
  coll: string
  modality: ModalityKey
}

function normTest(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Body-part extraction from test name
// ---------------------------------------------------------------------------
const BODY_PART_TERMS: Array<[string, string[]]> = [
  ['knee',      ['knee', 'patella', 'patellar']],
  ['shoulder',  ['shoulder', 'glenohumeral', 'rotator cuff', 'ac joint', 'acromioclavicular']],
  ['hip',       ['hip', 'femoral head', 'acetabulum', 'pelvis']],
  ['ankle',     ['ankle', 'talar', 'talus', 'calcaneus', 'calcaneal']],
  ['wrist',     ['wrist', 'carpal', 'scaphoid', 'distal radius']],
  ['elbow',     ['elbow', 'olecranon', 'radial head']],
  ['foot',      ['foot', 'metatarsal', 'phalanges foot', 'plantar']],
  ['hand',      ['hand', 'metacarpal', 'finger', 'phalanges hand']],
  ['cervical',  ['cervical spine', 'c-spine', 'cervical vertebr']],
  ['lumbar',    ['lumbar spine', 'l-spine', 'lumbar vertebr', 'lower back']],
  ['thoracic',  ['thoracic spine', 't-spine', 'thoracic vertebr']],
  ['spine',     ['spine', 'spinal', 'vertebr']],
  ['brain',     ['brain', 'head', 'cranial', 'intracranial']],
  ['chest',     ['chest', 'thorax', 'thoracic']],
  // Before 'abdomen', so a renal study resolves to the organ rather than the
  // cavity — "Renal Ultrasound" previously matched no body part at all.
  ['kidney',    ['kidney', 'renal', 'nephro', 'ureter']],
  ['abdomen',   ['abdomen', 'abdominal', 'liver', 'spleen', 'pancreas', 'bowel']],
  ['pelvis',    ['pelvis', 'pelvic', 'bladder', 'uterus', 'ovary', 'prostate']],
  ['neck',      ['neck', 'thyroid', 'carotid', 'cervical soft tissue']],
]

function extractBodyPart(testName: string): string {
  const n = normTest(testName)
  for (const [part, terms] of BODY_PART_TERMS) {
    if (terms.some(t => n.includes(t))) return part
  }
  return ''
}

// ---------------------------------------------------------------------------
// Test name → imaging parameters
// ---------------------------------------------------------------------------

const TEST_PARAMS_MAP: Array<[string[], TestParams]> = [
  [
    ['chest x ray', 'chest xray', 'chest x-ray', 'chest radiograph', 'cxr'],
    { it: 'x', coll: 'cxr,mpx', modality: 'xray' },
  ],
  [
    ['ct chest', 'computed tomography chest', 'chest ct', 'ct thorax'],
    { it: 'xm', coll: 'mpx', modality: 'ct' },
  ],
  [
    ['ct abdomen and pelvis', 'ct abdomen pelvis', 'ct a p', 'ct ap'],
    { it: 'xm', coll: 'mpx', modality: 'ct' },
  ],
  [
    ['ct head', 'ct brain', 'head ct', 'brain ct', 'non-contrast ct head'],
    { it: 'xm', coll: 'mpx', modality: 'ct' },
  ],
  [
    ['ct pulmonary angiography', 'ctpa', 'ct pulmonary angiogram', 'ct angiography chest'],
    { it: 'xm', coll: 'mpx', modality: 'ct' },
  ],
  [
    ['ct abdomen', 'ct pelvis', 'abdominal ct', 'pelvic ct', 'ct scan abdomen'],
    { it: 'xm', coll: 'mpx', modality: 'ct' },
  ],
  [
    ['ct spine', 'ct lumbar', 'ct cervical', 'ct thoracic'],
    { it: 'xm', coll: 'mpx', modality: 'ct' },
  ],
  [
    ['mri brain', 'brain mri', 'mri head', 'head mri', 'flair mri brain', 'dwi brain'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri spine', 'spine mri', 'mri lumbar', 'lumbar mri', 'mri cervical', 'cervical mri',
     'mri thoracic', 'thoracic mri', 'mri l-spine', 'mri c-spine'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri knee', 'knee mri', 'mri right knee', 'mri left knee', 'knee magnetic resonance'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri shoulder', 'shoulder mri', 'mri right shoulder', 'mri left shoulder'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri hip', 'hip mri', 'mri pelvis', 'pelvis mri'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri ankle', 'ankle mri', 'mri foot', 'foot mri'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri wrist', 'wrist mri', 'mri hand', 'hand mri'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri elbow', 'elbow mri'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri abdomen', 'abdominal mri', 'mrcp', 'mri liver', 'liver mri', 'mri pancreas'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['mri cardiac', 'cardiac mri', 'cmr'],
    { it: 'm', coll: 'mpx', modality: 'mri' },
  ],
  [
    ['renal ultrasound', 'kidney ultrasound', 'renal us', 'kidney us'],
    { it: 'u', coll: 'mpx', modality: 'us' },
  ],
  [
    ['abdominal ultrasound', 'abdominal us', 'abdomen ultrasound', 'ruo abd'],
    { it: 'u', coll: 'mpx', modality: 'us' },
  ],
  [
    ['echocardiogram', 'transthoracic echocardiogram', 'tte', 'echo', 'cardiac ultrasound', '2d echo'],
    { it: 'u', coll: 'mpx', modality: 'us' },
  ],
  [
    ['pelvic ultrasound', 'pelvic us', 'ob ultrasound', 'transvaginal ultrasound', 'tvus'],
    { it: 'u', coll: 'mpx', modality: 'us' },
  ],
  [
    ['carotid ultrasound', 'carotid doppler', 'neck ultrasound'],
    { it: 'u', coll: 'mpx', modality: 'us' },
  ],
  [
    ['venous doppler', 'lower extremity ultrasound', 'leg ultrasound', 'dvt ultrasound',
     'venous duplex', 'duplex ultrasound', 'doppler ultrasound', 'venous compression ultrasound',
     'bilateral lower extremities', 'lower extremity venous'],
    { it: 'u', coll: 'mpx', modality: 'us' },
  ],
  [
    ['thyroid ultrasound', 'thyroid us'],
    { it: 'u', coll: 'mpx', modality: 'us' },
  ],
  [
    ['scrotal ultrasound', 'testicular ultrasound'],
    { it: 'u', coll: 'mpx', modality: 'us' },
  ],
  // Body-part-specific plain films
  [
    ['knee x-ray', 'knee xray', 'knee radiograph', 'x-ray knee', 'xray knee'],
    { it: 'x', coll: 'mpx', modality: 'xray' },
  ],
  [
    ['hip x-ray', 'hip xray', 'pelvis x-ray', 'pelvis xray', 'hip radiograph'],
    { it: 'x', coll: 'mpx', modality: 'xray' },
  ],
  [
    ['shoulder x-ray', 'shoulder xray', 'shoulder radiograph'],
    { it: 'x', coll: 'mpx', modality: 'xray' },
  ],
  [
    ['ankle x-ray', 'ankle xray', 'ankle radiograph', 'foot x-ray', 'foot xray'],
    { it: 'x', coll: 'mpx', modality: 'xray' },
  ],
  [
    ['wrist x-ray', 'wrist xray', 'wrist radiograph', 'hand x-ray', 'hand xray'],
    { it: 'x', coll: 'mpx', modality: 'xray' },
  ],
  [
    ['elbow x-ray', 'elbow xray', 'elbow radiograph'],
    { it: 'x', coll: 'mpx', modality: 'xray' },
  ],
  [
    ['spine x-ray', 'spinal x-ray', 'lumbar x-ray', 'lumbar xray', 'cervical x-ray'],
    { it: 'x', coll: 'mpx', modality: 'xray' },
  ],
  [
    ['abdominal x-ray', 'abdominal xray', 'kub', 'flat plate abdomen'],
    { it: 'x', coll: 'cxr,mpx', modality: 'xray' },
  ],
]

function getTestParams(orderedTest: string): TestParams | null {
  const n = normTest(orderedTest)
  for (const [aliases, params] of TEST_PARAMS_MAP) {
    if (aliases.some(a => n.includes(a) || a.includes(n))) return params
  }
  if (n.includes('ct ') || n.startsWith('ct') || n.includes('computed tomography')) return { it: 'xm', coll: 'mpx', modality: 'ct' }
  if (n.includes('mri') || n.includes('magnetic resonance')) return { it: 'm', coll: 'mpx', modality: 'mri' }
  if (n.includes('ultrasound') || n.includes('echo') || n.includes(' us ')) return { it: 'u', coll: 'mpx', modality: 'us' }
  if (n.includes('x-ray') || n.includes('xray') || n.includes('radiograph')) return { it: 'x', coll: 'cxr,mpx', modality: 'xray' }
  return null
}

// ---------------------------------------------------------------------------
// Diagnosis → search query map
// ---------------------------------------------------------------------------

/**
 * A modality's search query, optionally split by body part.
 *
 * A plain string is the query for every study in that modality. The record form
 * exists because one modality can be ordered at two different anatomies in the
 * same case, looking for two different things: an endocarditis patient gets an
 * MRI of the spine for discitis AND an MRI of the brain for septic emboli, and
 * a single "endocarditis MRI" query cannot serve both. Keys are body parts as
 * extractBodyPart returns them, plus `default` for anything unlisted.
 */
type ModalityQuery = string | ({ default?: string } & Partial<Record<string, string>>)

const DIAGNOSIS_QUERY_MAP: Array<[string[], Partial<Record<ModalityKey, ModalityQuery>>]> = [
  // ── Cardiovascular ───────────────────────────────────────────────────────
  [['stemi', 'st-elevation myocardial infarction'],
    { xray: 'cardiomegaly pulmonary edema', us: 'wall motion abnormality echocardiogram STEMI' }],
  [['nstemi', 'non-st elevation myocardial infarction', 'myocardial infarction', 'acute coronary syndrome', 'acs', 'unstable angina'],
    { xray: 'cardiomegaly pulmonary edema', us: 'wall motion abnormality echocardiogram' }],
  [['congestive heart failure', 'heart failure', 'chf', 'pulmonary edema', 'acute decompensated heart failure'],
    { xray: 'pulmonary edema cardiomegaly heart failure', us: 'heart failure echocardiogram reduced ejection fraction' }],
  [['aortic dissection', 'type a dissection', 'type b dissection'],
    { ct: 'aortic dissection intimal flap' }],
  [['aortic stenosis'],
    { us: 'aortic stenosis calcified valve echocardiogram', xray: 'aortic calcification stenosis' }],
  [['aortic regurgitation'],
    { us: 'aortic regurgitation echocardiogram doppler', xray: 'cardiomegaly aortic regurgitation' }],
  [['mitral stenosis'],
    { us: 'mitral stenosis echocardiogram calcification', xray: 'mitral stenosis left atrial enlargement' }],
  [['mitral regurgitation'],
    { us: 'mitral regurgitation echocardiogram doppler', xray: 'cardiomegaly mitral regurgitation' }],
  [['hypertrophic cardiomyopathy', 'hcm'],
    { us: 'hypertrophic cardiomyopathy echocardiogram septal', mri: 'hypertrophic cardiomyopathy cardiac MRI' }],
  [['dilated cardiomyopathy'],
    { us: 'dilated cardiomyopathy echocardiogram', xray: 'cardiomegaly dilated cardiomyopathy' }],
  [['pericardial effusion', 'cardiac tamponade', 'pericarditis'],
    { us: 'pericardial effusion echocardiogram tamponade', xray: 'cardiomegaly pericardial effusion' }],
  [['myocarditis'],
    { mri: 'myocarditis cardiac MRI late gadolinium enhancement', us: 'myocarditis echocardiogram' }],
  [['endocarditis', 'infective endocarditis'],
    { us: 'endocarditis vegetation echocardiogram valve',
      xray: 'endocarditis chest',
      // Both MRIs in these cases image a COMPLICATION, not the valve: the spine
      // for embolic discitis, the brain for septic emboli. Without these the
      // modality fallback reached for the xray query and searched a lumbar MRI
      // as "endocarditis chest".
      mri: {
        lumbar: 'discitis vertebral osteomyelitis endplate MRI',
        thoracic: 'discitis vertebral osteomyelitis endplate MRI',
        cervical: 'discitis vertebral osteomyelitis endplate MRI',
        spine: 'discitis vertebral osteomyelitis endplate MRI',
        brain: 'septic emboli cerebral infarction diffusion weighted MRI',
        default: 'septic embolic infarction MRI',
      } }],
  [['atrial fibrillation', 'afib', 'atrial flutter'],
    { xray: 'atrial fibrillation cardiomegaly' }],
  [['pulmonary hypertension'],
    { xray: 'pulmonary hypertension cardiomegaly right heart', us: 'pulmonary hypertension echocardiogram right ventricular' }],
  [['pulmonary embolism', 'pulmonary thromboembolism', 'pe saddle embolus'],
    { ct: 'pulmonary embolism filling defect', xray: 'pulmonary embolism chest' }],
  [['deep vein thrombosis', 'dvt'],
    { us: 'deep vein thrombosis non-compressible vein ultrasound' }],

  // ── Pulmonary ─────────────────────────────────────────────────────────────
  [['pneumothorax', 'tension pneumothorax', 'spontaneous pneumothorax'],
    { xray: 'pneumothorax lung collapse visceral pleural line' }],
  [['pleural effusion'],
    { xray: 'pleural effusion costophrenic angle blunting' }],
  [['pneumonia', 'community-acquired pneumonia', 'cap', 'lobar pneumonia', 'hospital-acquired pneumonia', 'aspiration pneumonia'],
    { xray: 'pneumonia consolidation opacity' }],
  [['copd', 'emphysema', 'chronic obstructive pulmonary disease'],
    { xray: 'emphysema hyperinflation copd flattened diaphragm' }],
  [['asthma', 'acute asthma exacerbation'],
    { xray: 'asthma hyperinflation peribronchial cuffing' }],
  [['lung cancer', 'pulmonary mass', 'pulmonary nodule', 'lung nodule', 'lung mass', 'non-small cell lung cancer', 'small cell lung cancer'],
    { xray: 'lung mass pulmonary nodule hilar', ct: 'lung cancer pulmonary mass spiculated' }],
  [['rib fracture', 'pneumohemothorax', 'hemothorax'],
    { xray: 'rib fracture hemothorax pneumothorax' }],
  [['tuberculosis', 'tb', 'miliary tuberculosis', 'pulmonary tuberculosis'],
    { xray: 'tuberculosis cavitation upper lobe infiltrate', ct: 'tuberculosis pulmonary cavitation' }],
  [['sarcoidosis'],
    { xray: 'sarcoidosis bilateral hilar lymphadenopathy', ct: 'sarcoidosis ground glass nodules' }],
  [['interstitial lung disease', 'ild', 'pulmonary fibrosis', 'ipf'],
    { xray: 'interstitial lung disease fibrosis honeycombing', ct: 'pulmonary fibrosis ground glass reticulation' }],
  [['pneumocystis', 'pcp', 'pneumocystis pneumonia'],
    { xray: 'pneumocystis pneumonia bilateral interstitial', ct: 'PCP ground glass bilateral' }],
  [['ards', 'acute respiratory distress syndrome'],
    { xray: 'ARDS bilateral opacities diffuse infiltrates', ct: 'ARDS bilateral consolidation' }],

  // ── Gastrointestinal ──────────────────────────────────────────────────────
  [['acute appendicitis', 'appendicitis'],
    { ct: 'appendicitis enlarged appendix periappendiceal fat stranding' }],
  [['bowel obstruction', 'small bowel obstruction', 'large bowel obstruction', 'intestinal obstruction'],
    { xray: 'bowel obstruction dilated loops air fluid levels', ct: 'small bowel obstruction transition point' }],
  [['pancreatitis', 'acute pancreatitis', 'necrotizing pancreatitis'],
    { ct: 'pancreatitis peripancreatic stranding necrotizing' }],
  [['chronic pancreatitis'],
    { ct: 'chronic pancreatitis calcification ductal dilation', xray: 'pancreatic calcification' }],
  [['diverticulitis', 'colonic diverticulitis'],
    { ct: 'diverticulitis sigmoid pericolic stranding' }],
  [['cholecystitis', 'gallstones', 'cholelithiasis', 'biliary colic', 'acute cholecystitis'],
    { us: 'gallstones cholecystitis biliary pericholecystic' }],
  [['choledocholithiasis', 'cholangitis'],
    { us: 'bile duct dilation choledocholithiasis', ct: 'biliary obstruction common bile duct' }],
  [['liver cirrhosis', 'hepatic mass', 'hepatocellular carcinoma', 'cirrhosis', 'hepatic fibrosis'],
    { ct: 'liver cirrhosis hepatic nodular', us: 'cirrhosis ascites portal hypertension' }],
  [['crohn disease', 'crohns disease', "crohn's disease"],
    { ct: 'crohn disease small bowel thickening', mri: 'crohn disease mri enterography' }],
  [['ulcerative colitis'],
    { ct: 'ulcerative colitis colonic wall thickening', xray: 'toxic megacolon ulcerative colitis' }],
  [['peptic ulcer disease', 'duodenal ulcer', 'gastric ulcer'],
    { ct: 'peptic ulcer free air perforation', xray: 'free air pneumoperitoneum perforation' }],
  [['esophageal varices', 'portal hypertension'],
    { ct: 'portal hypertension varices splenomegaly' }],
  [['colon cancer', 'colorectal cancer', 'rectal cancer', 'colonic mass'],
    { ct: 'colon cancer mass', xray: 'colon mass obstructing lesion' }],
  [['intestinal ischemia', 'mesenteric ischemia'],
    { ct: 'mesenteric ischemia bowel wall pneumatosis', xray: 'pneumatosis intestinalis' }],

  // ── Neurologic ────────────────────────────────────────────────────────────
  [['ischemic stroke', 'stroke', 'cerebrovascular accident', 'cva'],
    { ct: 'ischemic stroke hypodensity brain', mri: 'ischemic stroke diffusion restriction DWI' }],
  [['intracranial hemorrhage', 'subarachnoid hemorrhage', 'sah', 'subdural hematoma', 'epidural hematoma', 'intracerebral hemorrhage'],
    { ct: 'intracranial hemorrhage hyperdense blood' }],
  [['brain tumor', 'glioblastoma', 'glioma', 'meningioma', 'brain mass', 'brain metastasis', 'brain metastases'],
    { mri: 'brain tumor glioblastoma enhancement MRI', ct: 'brain mass ring enhancing' }],
  [['meningitis', 'bacterial meningitis', 'viral meningitis'],
    { ct: 'meningitis brain CT', mri: 'meningitis leptomeningeal enhancement MRI' }],
  [['encephalitis'],
    { mri: 'encephalitis temporal lobe FLAIR signal', ct: 'encephalitis brain' }],
  [['multiple sclerosis', 'ms'],
    { mri: 'multiple sclerosis white matter lesions FLAIR demyelination' }],
  [['brain abscess'],
    { mri: 'brain abscess ring enhancing rim enhancement', ct: 'brain abscess ring enhancing' }],
  [['hydrocephalus', 'normal pressure hydrocephalus'],
    { ct: 'hydrocephalus dilated ventricles', mri: 'hydrocephalus ventricular enlargement' }],
  [['spinal stenosis', 'lumbar stenosis', 'cervical stenosis'],
    { mri: 'spinal stenosis cord compression ligamentum flavum' }],
  [['herniated disc', 'disc herniation', 'lumbar radiculopathy', 'cervical radiculopathy', 'disc prolapse'],
    { mri: 'disc herniation nerve root compression foraminal stenosis' }],
  [['cauda equina syndrome'],
    { mri: 'cauda equina compression MRI lumbar' }],

  // ── Renal / Urologic ──────────────────────────────────────────────────────
  [['kidney stone', 'nephrolithiasis', 'ureterolithiasis', 'renal calculi', 'ureteral stone'],
    { ct: 'kidney stone nephrolithiasis calculus', xray: 'kidney stone radiopaque calculus' }],
  [['renal failure', 'acute kidney injury', 'aki', 'chronic kidney disease', 'ckd'],
    { us: 'kidney renal cortical thinning echogenicity' }],
  [['nephrotic syndrome', 'diabetic nephropathy', 'glomerulonephritis', 'nephritic syndrome', 'iga nephropathy'],
    { us: 'kidney nephropathy echogenicity', ct: 'nephrotic kidney' }],
  [['polycystic kidney disease', 'pkd'],
    { us: 'polycystic kidney multiple cysts', ct: 'polycystic kidney bilateral cysts' }],
  [['renal cell carcinoma', 'renal mass', 'kidney cancer'],
    { ct: 'renal cell carcinoma kidney mass', us: 'renal mass complex cyst' }],
  [['pyelonephritis'],
    { ct: 'pyelonephritis wedge-shaped hypoenhancement', us: 'pyelonephritis kidney swelling' }],
  [['bladder cancer'],
    { ct: 'bladder cancer intraluminal mass', us: 'bladder mass echogenic' }],
  [['ovarian cyst', 'ovarian torsion', 'ectopic pregnancy', 'ruptured ovarian cyst'],
    { us: 'ovarian cyst pelvic ultrasound complex' }],

  // ── MSK / Orthopedic ─────────────────────────────────────────────────────
  [['acl tear', 'anterior cruciate ligament', 'acl rupture', 'acl injury'],
    { mri: 'ACL tear anterior cruciate ligament knee MRI' }],
  [['meniscus tear', 'meniscal tear', 'medial meniscus', 'lateral meniscus'],
    { mri: 'meniscus tear knee MRI medial lateral' }],
  [['rotator cuff tear', 'rotator cuff rupture', 'supraspinatus tear', 'rotator cuff injury'],
    { mri: 'rotator cuff tear supraspinatus shoulder MRI' }],
  [['shoulder dislocation', 'glenohumeral dislocation', 'bankart lesion', 'hill-sachs'],
    { xray: 'shoulder dislocation glenohumeral', mri: 'bankart lesion shoulder instability MRI' }],
  [['hip fracture', 'femoral neck fracture', 'intertrochanteric fracture'],
    { xray: 'hip fracture femoral neck intertrochanteric', mri: 'hip fracture occult MRI' }],
  [['ankle fracture', 'bimalleolar fracture', 'trimalleolar fracture', 'distal fibula fracture'],
    { xray: 'ankle fracture malleolus bimalleolar' }],
  [['wrist fracture', 'colles fracture', 'distal radius fracture', 'scaphoid fracture'],
    { xray: 'distal radius fracture colles wrist' }],
  [['spine fracture', 'compression fracture', 'vertebral fracture', 'burst fracture'],
    { xray: 'vertebral compression fracture spine', mri: 'vertebral fracture bone marrow edema MRI' }],
  [['stress fracture'],
    { mri: 'stress fracture bone marrow edema MRI', xray: 'stress fracture periosteal reaction' }],
  [['osteomyelitis'],
    { mri: 'osteomyelitis bone marrow edema periosteal reaction MRI', xray: 'osteomyelitis periosteal bone destruction' }],
  [['septic arthritis'],
    { mri: 'septic arthritis joint effusion synovial enhancement MRI', xray: 'septic arthritis joint space' }],
  [['gout', 'gouty arthritis'],
    { xray: 'gout tophus juxta-articular erosion', mri: 'gout tophaceous deposits' }],
  [['osteoarthritis', 'degenerative joint disease'],
    { xray: 'osteoarthritis joint space narrowing osteophyte', mri: 'osteoarthritis cartilage loss MRI knee' }],
  [['rheumatoid arthritis'],
    { xray: 'rheumatoid arthritis joint erosions periarticular osteopenia', mri: 'rheumatoid synovitis MRI' }],
  [['fracture', 'bone fracture'],
    { xray: 'bone fracture radiograph' }],
  [['compartment syndrome'],
    { mri: 'compartment syndrome muscle edema MRI' }],
  [['avascular necrosis', 'osteonecrosis', 'avn'],
    { mri: 'avascular necrosis femoral head MRI osteonecrosis', xray: 'avascular necrosis sclerosis collapse' }],

  // ── Hematologic / Oncologic ───────────────────────────────────────────────
  [['hodgkin lymphoma', 'non-hodgkin lymphoma', 'lymphoma'],
    { ct: 'lymphadenopathy lymphoma mediastinal neck' }],
  [['multiple myeloma'],
    { xray: 'multiple myeloma lytic lesions punched out skull', ct: 'myeloma vertebral lytic lesions', mri: 'multiple myeloma bone marrow MRI' }],
  [['leukemia', 'cll', 'all', 'aml'],
    { ct: 'leukemia splenomegaly lymphadenopathy', xray: 'leukemia periosteal reaction' }],
  [['splenomegaly', 'splenic enlargement'],
    { us: 'splenomegaly enlarged spleen', ct: 'splenomegaly splenic enlargement' }],
  [['iron deficiency anemia'],
    { xray: 'anemia cardiomegaly chest' }],

  // ── Infectious ────────────────────────────────────────────────────────────
  [['septic joint', 'infectious arthritis'],
    { mri: 'septic joint synovial enhancement effusion MRI', xray: 'infectious arthritis joint effusion' }],
  [['liver abscess', 'hepatic abscess'],
    { ct: 'liver abscess hypodense rim enhancing', us: 'hepatic abscess complex fluid' }],
  [['lung abscess', 'pulmonary abscess'],
    { xray: 'lung abscess cavitation air fluid level', ct: 'pulmonary abscess thick-walled cavity' }],
  [['empyema', 'pleural empyema'],
    { ct: 'empyema pleural lenticular collection', us: 'empyema complex pleural effusion' }],
  [['epiglottitis'],
    { xray: 'epiglottitis thumb sign lateral neck' }],
  [['retroperitoneal abscess', 'psoas abscess'],
    { ct: 'psoas abscess iliopsoas retroperitoneal' }],
  [['diskitis', 'discitis', 'vertebral osteomyelitis'],
    { mri: 'discitis vertebral osteomyelitis endplate MRI' }],

  // ── Endocrine ─────────────────────────────────────────────────────────────
  [['adrenal mass', 'adrenal tumor', 'adrenal adenoma', "cushing's syndrome", 'pheochromocytoma', 'hyperaldosteronism'],
    { ct: 'adrenal mass adenoma CT lipid rich', mri: 'adrenal mass MRI adrenal adenoma' }],
  [['thyroid nodule', 'thyroid cancer', 'thyroid mass', 'goiter'],
    { us: 'thyroid nodule ultrasound hypoechoic', ct: 'thyroid mass goiter' }],
  [['pituitary tumor', 'pituitary adenoma', 'acromegaly'],
    { mri: 'pituitary adenoma sellar MRI macroadenoma' }],
  [['pancreatitis diabetic'],
    { ct: 'pancreatitis pancreatic' }],

  // ── Trauma ────────────────────────────────────────────────────────────────
  [['splenic laceration', 'splenic rupture', 'splenic injury'],
    { ct: 'splenic laceration hemoperitoneum FAST exam' }],
  [['liver laceration', 'hepatic laceration'],
    { ct: 'liver laceration hepatic injury hemoperitoneum' }],
  [['renal laceration', 'renal injury', 'renal contusion'],
    { ct: 'renal laceration kidney injury grade' }],
  [['diaphragmatic rupture', 'diaphragm injury'],
    { ct: 'diaphragmatic rupture herniation abdominal organs chest' }],
  [['pneumoperitoneum', 'bowel perforation', 'hollow viscus injury'],
    { xray: 'pneumoperitoneum free air subdiaphragmatic', ct: 'pneumoperitoneum free air bowel perforation' }],
  [['pelvic fracture'],
    { xray: 'pelvic fracture pubic rami acetabulum', ct: 'pelvic fracture complex CT' }],
  [['traumatic brain injury', 'tbi', 'cerebral contusion'],
    { ct: 'cerebral contusion traumatic brain injury hemorrhage', mri: 'diffuse axonal injury DAI MRI' }],
  [['pneumohemothorax', 'hemothorax'],
    { xray: 'hemothorax pleural opacity', ct: 'hemothorax hemopneumothorax' }],

  // ── Vascular ──────────────────────────────────────────────────────────────
  [['abdominal aortic aneurysm', 'aaa'],
    { ct: 'abdominal aortic aneurysm CT', us: 'aortic aneurysm ultrasound dilation' }],
  [['peripheral arterial disease', 'pad', 'arterial occlusion'],
    { ct: 'peripheral arterial disease occlusion', us: 'peripheral arterial disease doppler' }],
  [['carotid stenosis'],
    { us: 'carotid stenosis plaque doppler', ct: 'carotid stenosis CTA' }],

  // ── Hematologic / Oncologic (additional) ─────────────────────────────────
  [['waldenstrom', 'waldenstrom macroglobulinemia'],
    { ct: 'waldenstrom lymphadenopathy splenomegaly CT', xray: 'waldenstrom myeloma skeletal survey' }],
  [['carcinoid', 'neuroendocrine tumor', 'carcinoid syndrome'],
    { ct: 'carcinoid tumor mesenteric mass neuroendocrine CT abdomen' }],

  // ── Pulmonary (additional) ────────────────────────────────────────────────
  [['hypersensitivity pneumonitis', 'bird fancier', 'farmer lung', 'extrinsic allergic alveolitis'],
    { xray: 'hypersensitivity pneumonitis bilateral infiltrates', ct: 'hypersensitivity pneumonitis ground glass centrilobular nodules' }],
  [['ectopic acth', 'bronchial carcinoid', 'occult carcinoid'],
    { ct: 'bronchial carcinoid endobronchial lesion CT chest', xray: 'carcinoid lung nodule hilar' }],

  // ── Neurologic (additional) ───────────────────────────────────────────────
  [['subacute combined degeneration', 'vitamin b12 deficiency myelopathy', 'b12 deficiency'],
    { mri: 'subacute combined degeneration posterior cord signal dorsal column MRI spine' }],

  // ── MSK (additional) ──────────────────────────────────────────────────────
  [['atypical femoral fracture', 'bisphosphonate', 'stress fracture femur'],
    { xray: 'atypical femoral fracture bisphosphonate transverse lateral cortex', mri: 'femur stress fracture cortical MRI' }],

  // ── Trauma (additional) ───────────────────────────────────────────────────
  [['splenic injury', 'traumatic injury to the spleen', 'splenic trauma', 'spleen laceration'],
    { ct: 'splenic laceration hemoperitoneum FAST exam', xray: 'splenic injury trauma chest' }],

  // ── Toxicologic (additional) ──────────────────────────────────────────────
  [['lead poisoning', 'plumbism', 'lead toxicity'],
    { xray: 'lead lines long bones wrist knee radiograph lead poisoning' }],

  // ── Infectious (additional) ───────────────────────────────────────────────
  [['gonorrhea', 'neisseria gonorrhoeae', 'epididymo-orchitis', 'epididymitis'],
    { us: 'epididymitis epididymo-orchitis scrotal ultrasound' }],

  // ── Pediatric / Other ─────────────────────────────────────────────────────
  [['intussusception'],
    { us: 'intussusception target sign bowel', xray: 'intussusception soft tissue mass' }],
  [['pyloric stenosis'],
    { us: 'pyloric stenosis hypertrophic pylorus double track sign' }],
  [['hirschsprung disease'],
    { xray: 'hirschsprung disease transition zone', ct: 'hirschsprung disease megacolon' }],
]

/**
 * Anatomic regions, for deciding whether one study's query can stand in for
 * another's. Parts within a region are close enough to share a search; parts in
 * different regions are not.
 */
const REGION_OF: Record<string, string> = {
  cervical: 'spine', thoracic: 'spine', lumbar: 'spine', spine: 'spine',
  brain: 'head', neck: 'neck', chest: 'chest',
  abdomen: 'abdomen', pelvis: 'abdomen', kidney: 'abdomen',
  knee: 'limb', hip: 'limb', ankle: 'limb', wrist: 'limb',
  elbow: 'limb', foot: 'limb', hand: 'limb', shoulder: 'limb',
}

/**
 * True when a candidate query is about a different part of the body than the
 * study being ordered.
 *
 * The modality fallback below is worth keeping — a chest query written for
 * radiographs usually suits a chest CT — but it silently crossed anatomies too,
 * sending a lumbar spine MRI to Open-i as "endocarditis chest". Queries that
 * name no body part at all (most of them) never conflict.
 */
function conflictsWithBodyPart(query: string, bodyPart: string): boolean {
  if (!bodyPart || !query) return false
  const queryPart = extractBodyPart(query)
  if (!queryPart || queryPart === bodyPart) return false
  const a = REGION_OF[queryPart]
  const b = REGION_OF[bodyPart]
  return Boolean(a && b && a !== b)
}

/**
 * Modality nouns, stripped from a query borrowed across modalities.
 *
 * The Open-i request already constrains modality through its `it` and `coll`
 * parameters, so these words add nothing when they match and actively mislead
 * when they don't — a head CT borrowing the brain MRI query was searching a CT
 * collection for "diffusion weighted MRI".
 */
const MODALITY_TOKENS =
  /\b(mri|magnetic resonance|diffusion[- ]weighted|dwi|ct|computed tomography|radiograph|x-?ray|ultrasound|echocardiogram|echo)\b/gi

function stripModalityWords(query: string): string {
  return query.replace(MODALITY_TOKENS, ' ').replace(/\s+/g, ' ').trim()
}

function resolveModalityQuery(q: ModalityQuery | undefined, bodyPart: string): string {
  if (!q) return ''
  if (typeof q === 'string') return q
  return (bodyPart && q[bodyPart]) || q.default || ''
}

function getDiagnosisQuery(caseDiagnosis: string, modality: ModalityKey, bodyPart = ''): string {
  const n = caseDiagnosis.toLowerCase()
  for (const [keys, queries] of DIAGNOSIS_QUERY_MAP) {
    if (keys.some(k => n.includes(k) || k.includes(n))) {
      const exact = resolveModalityQuery(queries[modality], bodyPart)
      if (exact) return exact
      // Fall back across modalities, but never onto a different body region,
      // and never carrying the source modality's own vocabulary along.
      for (const alt of [queries.xray, queries.ct, queries.mri, queries.us]) {
        const candidate = resolveModalityQuery(alt, bodyPart)
        if (candidate && !conflictsWithBodyPart(candidate, bodyPart)) {
          return stripModalityWords(candidate)
        }
      }
      return ''
    }
  }
  return ''
}

/** Spine parts need the word "spine" to read as anatomy rather than an adjective. */
const BODY_PART_PHRASE: Record<string, string> = {
  lumbar: 'lumbar spine', thoracic: 'thoracic spine', cervical: 'cervical spine',
}

const MODALITY_WORD: Record<ModalityKey, string> = {
  xray: 'radiograph', ct: 'CT', mri: 'MRI', us: 'ultrasound',
}

/**
 * Last resort before falling back to the diagnosis words: search the anatomy.
 *
 * A generic but correct "lumbar spine MRI" returns usable films; the old
 * fallback pasted the diagnosis onto the body part ("Infective Endocarditis
 * lumbar") and returned nothing usable at all.
 */
function bodyPartQuery(bodyPart: string, modality: ModalityKey): string {
  if (!bodyPart) return ''
  return `${BODY_PART_PHRASE[bodyPart] ?? bodyPart} ${MODALITY_WORD[modality]}`
}

/**
 * Resolve an ordered study to the Open-i query and modality parameters.
 *
 * Split out of fetchImagingResults so the choice of query — the part that
 * decides whether a student sees a relevant film or an unrelated one — can be
 * asserted without a network round trip.
 *
 * Returns null when the test name resolves to no imaging modality at all.
 */
export function buildImagingQuery(params: {
  orderedTest: string
  caseDiagnosis: string
  imagingCategory?: string
}): { query: string; testParams: TestParams; bodyPart: string } | null {
  const { orderedTest, caseDiagnosis, imagingCategory } = params

  const testParams = getTestParams(orderedTest)
  if (!testParams) return null

  // Extract body part from the ordered test name (e.g. "Knee MRI" → "knee")
  const bodyPart = extractBodyPart(orderedTest)

  // The diagnosis map for this modality AND body part first, then the anatomy
  // alone, then the diagnosis words.
  let baseQuery = getDiagnosisQuery(caseDiagnosis, testParams.modality, bodyPart)
    || bodyPartQuery(bodyPart, testParams.modality)

  if (!baseQuery) {
    // Fallback: use first 3 words of diagnosis, enhanced with body part if available
    const diagWords = caseDiagnosis.split(/\s+/).slice(0, 3).join(' ')
    baseQuery = bodyPart ? `${diagWords} ${bodyPart}` : diagWords
  } else if (bodyPart && !baseQuery.toLowerCase().includes(bodyPart)) {
    // Enhance existing query with body-part context when it's not already there
    baseQuery = `${baseQuery} ${bodyPart}`
  }

  return {
    query: [baseQuery, imagingCategory].filter(Boolean).join(' ').trim(),
    testParams,
    bodyPart,
  }
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

export async function fetchImagingResults(params: {
  orderedTest: string
  caseDiagnosis: string
  imagingCategory?: string
  /** Absolute origin for server-side callers (relative fetch only works in the browser). */
  baseUrl?: string
}): Promise<OpenIResult[]> {
  const { orderedTest, caseDiagnosis, imagingCategory, baseUrl } = params

  const built = buildImagingQuery({ orderedTest, caseDiagnosis, imagingCategory })
  if (!built) return []
  const { query, testParams } = built

  try {
    const sp = new URLSearchParams({ query, it: testParams.it, m: '1', n: '6' })
    if (testParams.coll) sp.set('coll', testParams.coll)

    const res = await fetch(`${baseUrl ?? ''}/api/imaging?${sp}`)
    if (!res.ok) return []
    const results: OpenIResult[] = await res.json()
    if (!Array.isArray(results)) return []

    const diagWords = caseDiagnosis.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    return results.slice().sort((a, b) => {
      const textA = ((a.abstract ?? '') + ' ' + a.caption).toLowerCase()
      const textB = ((b.abstract ?? '') + ' ' + b.caption).toLowerCase()
      const scoreA = diagWords.filter(w => textA.includes(w)).length
      const scoreB = diagWords.filter(w => textB.includes(w)).length
      return scoreB - scoreA
    })
  } catch (err) {
    console.error('[imagingSearch] fetchImagingResults error:', err)
    return []
  }
}
