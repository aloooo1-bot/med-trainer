/**
 * Diagnosis manifest for the case library.
 * 4 diagnoses × 12 systems × 3 difficulties = 144 slots × 3 variants = 432 cases.
 * System names match the app SYSTEMS dropdown exactly.
 */

export const MANIFEST = {
  Cardiovascular: {
    Foundations: [
      'ST-Elevation Myocardial Infarction (Inferior STEMI)',
      'Acute Heart Failure Exacerbation',
      'Atrial Fibrillation with Rapid Ventricular Response',
      'Hypertensive Emergency',
    ],
    Clinical: [
      'Non-ST-Elevation Myocardial Infarction (NSTEMI)',
      'Acute Pericarditis',
      'Aortic Stenosis',
      'Dilated Cardiomyopathy',
    ],
    Advanced: [
      'Cardiac Tamponade',
      'Type A Aortic Dissection',
      'Takotsubo Cardiomyopathy',
      'Brugada Syndrome',
    ],
  },
  Respiratory: {
    Foundations: [
      'Community-Acquired Pneumonia',
      'Acute Asthma Exacerbation',
      'Pulmonary Embolism',
      'Spontaneous Pneumothorax',
    ],
    Clinical: [
      'COPD Exacerbation',
      'Exudative Pleural Effusion',
      'Lung Abscess',
      'Pulmonary Arterial Hypertension',
    ],
    Advanced: [
      'Sarcoidosis',
      'Hypersensitivity Pneumonitis',
      'Goodpasture Syndrome',
      'Pulmonary Alveolar Proteinosis',
    ],
  },
  Neurologic: {
    Foundations: [
      'Acute Ischemic Stroke',
      'Bacterial Meningitis',
      'First Unprovoked Seizure',
      'Migraine with Aura',
    ],
    Clinical: [
      'Chronic Subdural Hematoma',
      'Guillain-Barré Syndrome',
      'Transient Ischemic Attack',
      'Bell\'s Palsy',
    ],
    Advanced: [
      'Anti-NMDAR Autoimmune Encephalitis',
      'Cerebral Venous Sinus Thrombosis',
      'Normal Pressure Hydrocephalus',
      'Neuromyelitis Optica Spectrum Disorder',
    ],
  },
  Gastrointestinal: {
    Foundations: [
      'Acute Appendicitis',
      'Acute Pancreatitis',
      'Acute Cholecystitis',
      'Peptic Ulcer Disease with Upper GI Bleed',
    ],
    Clinical: [
      'Crohn\'s Disease Flare',
      'Small Bowel Obstruction',
      'Acute Diverticulitis',
      'Acute Hepatitis B',
    ],
    Advanced: [
      'Whipple\'s Disease',
      'Primary Sclerosing Cholangitis',
      'Autoimmune Hepatitis',
      'Ischemic Colitis',
    ],
  },
  Renal: {
    Foundations: [
      'Prerenal Acute Kidney Injury',
      'Acute Pyelonephritis',
      'Ureterolithiasis (Ureteral Stone)',
      'Severe Hyperkalemia',
    ],
    Clinical: [
      'Nephrotic Syndrome',
      'SIADH with Symptomatic Hyponatremia',
      'Rhabdomyolysis with Acute Kidney Injury',
      'Acute Interstitial Nephritis',
    ],
    Advanced: [
      'Granulomatosis with Polyangiitis (ANCA-Associated Vasculitis)',
      'IgA Nephropathy',
      'Membranous Nephropathy',
      'Thrombotic Microangiopathy (TMA)',
    ],
  },
  'Endocrine / Metabolic': {
    Foundations: [
      'Diabetic Ketoacidosis',
      'Hypothyroidism',
      'Severe Hypoglycemia',
      'Graves\' Disease (Hyperthyroidism)',
    ],
    Clinical: [
      'Hyperosmolar Hyperglycemic State',
      'Addison\'s Disease (Primary Adrenal Insufficiency)',
      'Cushing\'s Syndrome',
      'Primary Hyperparathyroidism',
    ],
    Advanced: [
      'Pheochromocytoma',
      'Acute Intermittent Porphyria',
      'Carcinoid Syndrome',
      'MEN1 Syndrome',
    ],
  },
  Infectious: {
    Foundations: [
      'Sepsis (Bacterial — Urinary Source)',
      'Cellulitis',
      'Influenza',
      'Meningococcal Meningitis',
    ],
    Clinical: [
      'Infective Endocarditis',
      'Pneumocystis Jirovecii Pneumonia (PCP)',
      'Acute Osteomyelitis',
      'Pulmonary Tuberculosis',
    ],
    Advanced: [
      'Rocky Mountain Spotted Fever',
      'Disseminated Histoplasmosis',
      'Leptospirosis',
      'Strongyloidiasis with Hyperinfection Syndrome',
    ],
  },
  'Hematologic / Oncologic': {
    Foundations: [
      'Iron Deficiency Anemia',
      'Deep Vein Thrombosis',
      'Immune Thrombocytopenia (ITP)',
      'Acute Myeloid Leukemia',
    ],
    Clinical: [
      'Vitamin B12 Deficiency Megaloblastic Anemia',
      'Warm Autoimmune Hemolytic Anemia',
      'Multiple Myeloma',
      'Diffuse Large B-Cell Lymphoma',
    ],
    Advanced: [
      'CLL with Autoimmune Hemolytic Anemia',
      'Waldenström Macroglobulinemia',
      'Paroxysmal Nocturnal Hemoglobinuria',
      'Myelodysplastic Syndrome',
    ],
  },
  Musculoskeletal: {
    Foundations: [
      'Acute Gouty Arthritis',
      'Lumbar Disc Herniation with Radiculopathy',
      'Rheumatoid Arthritis',
      'Osteoporotic Vertebral Compression Fracture',
    ],
    Clinical: [
      'Septic Arthritis',
      'Pseudogout (CPPD Crystal Arthropathy)',
      'Polymyalgia Rheumatica',
      'Reactive Arthritis',
    ],
    Advanced: [
      'Dermatomyositis',
      'Antiphospholipid Syndrome',
      'Adult-Onset Still\'s Disease',
      'Systemic Lupus Erythematosus with Nephritis',
    ],
  },
  Psychiatric: {
    Foundations: [
      'Major Depressive Episode',
      'Panic Disorder',
      'First-Episode Psychosis',
      'Opioid Use Disorder with Withdrawal',
    ],
    Clinical: [
      'Bipolar I Disorder — Manic Episode',
      'Alcohol Withdrawal Syndrome',
      'PTSD',
      'Generalized Anxiety Disorder',
    ],
    Advanced: [
      'Neuroleptic Malignant Syndrome',
      'Serotonin Syndrome',
      'Wernicke\'s Encephalopathy',
      'Lithium Toxicity',
    ],
  },
  Toxicologic: {
    Foundations: [
      'Acetaminophen Overdose',
      'Opioid Toxidrome',
      'Carbon Monoxide Poisoning',
      'Benzodiazepine Overdose',
    ],
    Clinical: [
      'Tricyclic Antidepressant Overdose',
      'Salicylate Toxicity',
      'Digoxin Toxicity',
      'Methanol Ingestion',
    ],
    Advanced: [
      'Organophosphate Poisoning',
      'Anticholinergic Toxidrome',
      'Arsenic Poisoning (Chronic)',
      'Beta-Blocker Overdose',
    ],
  },
  Trauma: {
    Foundations: [
      'Tension Pneumothorax',
      'Hemorrhagic Shock',
      'Epidural Hematoma',
      'Splenic Laceration',
    ],
    Clinical: [
      'Traumatic Aortic Injury',
      'Rib Fractures with Hemothorax',
      'Compartment Syndrome',
      'Pelvic Fracture',
    ],
    Advanced: [
      'Fat Embolism Syndrome',
      'Traumatic Rhabdomyolysis with Multi-organ Dysfunction',
      'Abdominal Compartment Syndrome',
      'Crush Syndrome',
    ],
  },
}

export const VARIANT_SEEDS = [
  null,
  'Choose an age and gender that differs from the most typical demographic for this diagnosis. Use a chief complaint that is slightly less classic but still accurate.',
  'Patient is from a distinct ethnic or immigrant background. Include one relevant social, occupational, or travel risk factor. State the chief complaint in lay terms as the patient would say it.',
]
