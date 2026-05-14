import { useState, useRef, useEffect } from 'react'

const DIAGNOSIS_LIST: string[] = [
  // Cardiovascular
  'Acute coronary syndrome (ACS)', 'Acute decompensated heart failure', 'Aortic dissection',
  'Aortic regurgitation', 'Aortic stenosis', 'Atrial fibrillation', 'Atrial flutter',
  'Cardiac tamponade', 'Congestive heart failure (CHF)', 'Deep vein thrombosis (DVT)',
  'Dilated cardiomyopathy', 'Endocarditis (infective)', 'Heart block (first-degree)',
  'Heart block (second-degree, Mobitz II)', 'Heart block (third-degree, complete)',
  'Hypertensive emergency', 'Hypertensive urgency', 'Hypertrophic cardiomyopathy (HCM)',
  'Mitral regurgitation', 'Mitral stenosis', 'Myocarditis',
  'NSTEMI (Non-ST elevation myocardial infarction)', 'Pericarditis',
  'STEMI (ST-elevation myocardial infarction)', 'Stable angina',
  'Supraventricular tachycardia (SVT)', 'Unstable angina', 'Ventricular tachycardia (VT)',
  'Wolff-Parkinson-White syndrome',
  // Pulmonary
  'Acute respiratory distress syndrome (ARDS)', 'Asthma exacerbation', 'Bronchitis',
  'COPD exacerbation', 'Community-acquired pneumonia (CAP)', 'Hospital-acquired pneumonia',
  'Aspiration pneumonia', 'Interstitial lung disease', 'Lung cancer',
  'Obstructive sleep apnea', 'Pleural effusion', 'Pneumothorax (spontaneous)',
  'Pneumothorax (tension)', 'Pulmonary edema', 'Pulmonary embolism (PE)',
  'Pulmonary hypertension', 'Sarcoidosis',
  // Gastrointestinal
  'Acute liver failure', 'Appendicitis', 'Bowel obstruction (large bowel)',
  'Bowel obstruction (small bowel)', 'Cholangitis', 'Cholecystitis', 'Choledocholithiasis',
  'Cirrhosis', 'C. difficile colitis', 'Colon cancer', "Crohn's disease",
  'Diverticulitis', 'GERD', 'Gastric cancer', 'Gastritis', 'GI bleeding (lower)',
  'GI bleeding (upper)', 'Hepatic encephalopathy', 'Hepatitis A', 'Hepatitis B',
  'Hepatitis C', 'Intestinal ischemia', 'Irritable bowel syndrome (IBS)',
  'Mallory-Weiss tear', 'Pancreatitis (acute)', 'Pancreatitis (chronic)',
  'Peptic ulcer disease', 'Spontaneous bacterial peritonitis', 'Ulcerative colitis',
  'Esophageal variceal bleeding',
  // Neurologic
  "Bell's palsy", 'Brain abscess', 'Cauda equina syndrome', 'Encephalitis',
  'Epidural hematoma', 'Guillain-Barré syndrome', 'Hemorrhagic stroke',
  'Ischemic stroke (CVA)', 'Lumbar radiculopathy', 'Meningitis (bacterial)',
  'Meningitis (viral)', 'Migraine', 'Multiple sclerosis', 'Myasthenia gravis',
  'Normal pressure hydrocephalus', "Parkinson's disease", 'Seizure disorder / Epilepsy',
  'Status epilepticus', 'Subarachnoid hemorrhage (SAH)', 'Subdural hematoma',
  'Tension headache', 'TIA (transient ischemic attack)', "Wernicke's encephalopathy",
  // Renal / Urologic
  'Acute kidney injury (AKI)', 'Benign prostatic hyperplasia', 'Bladder cancer',
  'Chronic kidney disease (CKD)', 'Glomerulonephritis', 'IgA nephropathy',
  'Nephrolithiasis (kidney stones)', 'Nephrotic syndrome', 'Polycystic kidney disease',
  'Prostate cancer', 'Pyelonephritis', 'Renal cell carcinoma', 'UTI (uncomplicated)',
  // Endocrine / Metabolic
  'Adrenal crisis', "Cushing's syndrome", 'Diabetic ketoacidosis (DKA)',
  'Hyperaldosteronism', 'Hypercalcemia', 'Hyperkalemia', 'Hypernatremia',
  'Hyperosmolar hyperglycemic state (HHS)', 'Hyperthyroidism', 'Hypocalcemia',
  'Hypoglycemia', 'Hypokalemia', 'Hyponatremia', 'Hypothyroidism',
  'Metabolic acidosis', 'Metabolic alkalosis', 'Myxedema coma', 'Thyroid storm',
  'Type 1 diabetes mellitus', 'Type 2 diabetes mellitus',
  // Infectious
  'COVID-19', 'Cellulitis', 'Influenza', 'Lyme disease', 'Malaria',
  'MRSA skin infection', 'Necrotizing fasciitis', 'Osteomyelitis',
  'Sepsis', 'Septic arthritis', 'Septic shock', 'Skin abscess',
  'Tuberculosis (TB)', 'HIV / AIDS',
  // Hematology / Oncology
  'Anemia of chronic disease', 'DIC (disseminated intravascular coagulation)',
  'Hemolytic anemia', 'Hodgkin lymphoma', 'Iron deficiency anemia',
  'Leukemia (acute myeloid)', 'Leukemia (chronic lymphocytic)', 'Multiple myeloma',
  'Neutropenic fever', 'Non-Hodgkin lymphoma', 'Polycythemia vera',
  'Sickle cell crisis', 'Thrombocytopenia',
  'Thrombotic thrombocytopenic purpura (TTP)', 'Vitamin B12 deficiency anemia',
  // Musculoskeletal / Rheumatology
  'Ankylosing spondylitis', 'Fibromyalgia', 'Giant cell arteritis', 'Gout',
  'Hip fracture', 'Osteoarthritis', 'Polymyalgia rheumatica', 'Psoriatic arthritis',
  'Pseudogout', 'Rhabdomyolysis', 'Rheumatoid arthritis',
  'Systemic lupus erythematosus (SLE)', 'Vertebral compression fracture',
  // Psychiatric / Toxicology
  'Alcohol use disorder', 'Alcohol withdrawal', 'Bipolar disorder', 'Delirium',
  'Delirium tremens', "Dementia (Alzheimer's disease)", 'Generalized anxiety disorder',
  'Major depressive disorder', 'Neuroleptic malignant syndrome', 'Opioid overdose',
  'Panic disorder', 'Schizophrenia', 'Serotonin syndrome',
  // OB/GYN
  'Ectopic pregnancy', 'Eclampsia', 'HELLP syndrome', 'Ovarian torsion',
  'Pelvic inflammatory disease', 'Placental abruption', 'Preeclampsia',
  'Ruptured ovarian cyst',
  // Dermatology / Other
  'Basal cell carcinoma', 'Contact dermatitis', 'Herpes zoster (shingles)',
  'Melanoma', 'Squamous cell carcinoma', 'Stevens-Johnson syndrome',
  'Toxic epidermal necrolysis', 'Urticaria (hives)',
]

export function DiagnosisInput({ value, onChange, onKeyDown, disabled }: {
  value: string
  onChange: (val: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  const matches = value.trim().length >= 2
    ? DIAGNOSIS_LIST.filter(d => d.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectItem = (d: string) => { onChange(d); setOpen(false); setActiveIdx(-1) }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(-1) }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder="e.g., Community-acquired pneumonia"
        className="w-full rounded-md border border-surface-4 bg-surface-2 px-4 py-3 text-[15px] text-ink-primary placeholder-ink-tertiary focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/20 transition-colors"
        onKeyDown={e => {
          if (open && matches.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, matches.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)) }
            else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectItem(matches[activeIdx]) }
            else if (e.key === 'Escape') setOpen(false)
            else onKeyDown?.(e)
          } else onKeyDown?.(e)
        }}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-surface-4 bg-surface-2 shadow-2xl">
          {matches.map((d, i) => (
            <button
              key={d}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectItem(d) }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full px-4 py-2.5 text-left text-[13px] transition-colors ${i === activeIdx ? 'bg-primary-50 text-primary-700' : 'text-ink-primary hover:bg-surface-3'}`}
            >
              {d}
            </button>
          ))}
          <p className="border-t border-surface-4 px-4 py-1.5 text-[11px] text-ink-tertiary italic">
            Select or keep typing your own diagnosis
          </p>
        </div>
      )}
    </div>
  )
}
