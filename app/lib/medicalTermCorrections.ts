export const MEDICAL_CORRECTIONS: Array<{ heard: string[]; correct: string }> = [
  // Arrhythmias
  { heard: ['a fib', 'a-fib'], correct: 'AFib' },
  { heard: ['a flutter', 'a-flutter'], correct: 'atrial flutter' },
  { heard: ['s v t'], correct: 'SVT' },
  { heard: ['w p w'], correct: 'WPW' },
  { heard: ['l b b b'], correct: 'LBBB' },
  { heard: ['r b b b'], correct: 'RBBB' },

  // Cardiac conditions
  { heard: ['s t e m i'], correct: 'STEMI' },
  { heard: ['n s t e m i'], correct: 'NSTEMI' },
  { heard: ['a c s'], correct: 'ACS' },
  { heard: ['c h f', 'congestive heart failure'], correct: 'CHF' },
  { heard: ['l v h', 'l v h'], correct: 'LVH' },
  { heard: ['l v e f'], correct: 'LVEF' },

  // Pulmonary
  { heard: ['c o p d'], correct: 'COPD' },
  { heard: ['p e', 'pulmonary embolus'], correct: 'PE' },
  { heard: ['c t p a'], correct: 'CTPA' },

  // Renal / metabolic
  { heard: ['a k i'], correct: 'AKI' },
  { heard: ['c k d'], correct: 'CKD' },
  { heard: ['e g f r'], correct: 'eGFR' },
  { heard: ['u p c r'], correct: 'UPCR' },
  { heard: ['d k a'], correct: 'DKA' },
  { heard: ['h h n s', 'h h n k s'], correct: 'HHNS' },

  // Hematology / oncology
  { heard: ['d v t'], correct: 'DVT' },
  { heard: ['d i c'], correct: 'DIC' },
  { heard: ['t t p'], correct: 'TTP' },
  { heard: ['h u s'], correct: 'HUS' },

  // Infectious
  { heard: ['u t i'], correct: 'UTI' },
  { heard: ['h i v'], correct: 'HIV' },
  { heard: ['m r s a'], correct: 'MRSA' },
  { heard: ['c a p', 'community acquired pneumonia'], correct: 'CAP' },
  { heard: ['p c p'], correct: 'PCP' },
  { heard: ['s b e', 'subacute bacterial endocarditis'], correct: 'SBE' },

  // Endocrine
  { heard: ['t s h'], correct: 'TSH' },
  { heard: ['f t 4', 'free t 4'], correct: 'FT4' },
  { heard: ['f t 3', 'free t 3'], correct: 'FT3' },
  { heard: ['h b a 1 c', 'hemoglobin a 1 c', 'a 1 c'], correct: 'HbA1c' },

  // Neurologic
  { heard: ['c v a'], correct: 'CVA' },
  { heard: ['t i a'], correct: 'TIA' },
  { heard: ['s a h'], correct: 'SAH' },
  { heard: ['s d h'], correct: 'SDH' },
  { heard: ['e d h'], correct: 'EDH' },
  { heard: ['i c h'], correct: 'ICH' },
  { heard: ['m s'], correct: 'MS' },
  { heard: ['g b s'], correct: 'GBS' },
  { heard: ['m g'], correct: 'MG' },

  // Rheumatology
  { heard: ['a n a'], correct: 'ANA' },
  { heard: ['a n c a'], correct: 'ANCA' },
  { heard: ['s l e'], correct: 'SLE' },
  { heard: ['r a'], correct: 'RA' },

  // Labs
  { heard: ['c b c'], correct: 'CBC' },
  { heard: ['c m p'], correct: 'CMP' },
  { heard: ['b m p'], correct: 'BMP' },
  { heard: ['b n p'], correct: 'BNP' },
  { heard: ['l f t', 'l f ts', 'liver function tests'], correct: 'LFTs' },
  { heard: ['a l t'], correct: 'ALT' },
  { heard: ['a s t'], correct: 'AST' },
  { heard: ['g g t'], correct: 'GGT' },
  { heard: ['i n r'], correct: 'INR' },
  { heard: ['e s r'], correct: 'ESR' },
  { heard: ['c r p'], correct: 'CRP' },
  { heard: ['w b c'], correct: 'WBC' },
  { heard: ['r b c'], correct: 'RBC' },
  { heard: ['s p o 2', 's p o2', 'o 2 sat', 'oxygen sat', 'o2 sat'], correct: 'SpO₂' },
  { heard: ['p c o 2', 'p c o2'], correct: 'PCO₂' },
  { heard: ['p o 2', 'p o2'], correct: 'PO₂' },
  { heard: ['p h'], correct: 'pH' },

  // Imaging / procedures
  { heard: ['e c g', 'e k g'], correct: 'ECG' },
  { heard: ['c x r'], correct: 'CXR' },
  { heard: ['m r i'], correct: 'MRI' },
  { heard: ['t t e', 'transthoracic echo'], correct: 'TTE' },
  { heard: ['t e e', 'transesophageal echo'], correct: 'TEE' },
  { heard: ['l p', 'lumbar tap'], correct: 'LP' },
  { heard: ['e g d', 'upper endoscopy'], correct: 'EGD' },
  { heard: ['e r c p'], correct: 'ERCP' },

  // Medications / drug classes
  { heard: ['n s a i d', 'n s a ids'], correct: 'NSAID' },
  { heard: ['p p i'], correct: 'PPI' },
  { heard: ['a c e inhibitor', 'ace inhibitor'], correct: 'ACE inhibitor' },
  { heard: ['a r b'], correct: 'ARB' },
  { heard: ['s s r i'], correct: 'SSRI' },
  { heard: ['s n r i'], correct: 'SNRI' },
  { heard: ['t c a'], correct: 'TCA' },
  { heard: ['g l p 1', 'g l p one'], correct: 'GLP-1' },

  // Vitals shorthand
  { heard: ['b p'], correct: 'BP' },
  { heard: ['h r'], correct: 'HR' },
  { heard: ['r r'], correct: 'RR' },
  { heard: ['m a p'], correct: 'MAP' },
]
