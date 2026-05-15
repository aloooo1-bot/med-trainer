export const MANIFEST: Record<string, Record<string, string[]>> = {
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
      // cascaded from Foundations
      'ST-Elevation Myocardial Infarction (Inferior STEMI)',
      'Acute Heart Failure Exacerbation',
      'Atrial Fibrillation with Rapid Ventricular Response',
      'Hypertensive Emergency',
    ],
    Advanced: [
      'Cardiac Tamponade',
      'Type A Aortic Dissection',
      'Takotsubo Cardiomyopathy',
      'Brugada Syndrome',
      // cascaded from Clinical
      'Non-ST-Elevation Myocardial Infarction (NSTEMI)',
      'Acute Pericarditis',
      'Aortic Stenosis',
      'Dilated Cardiomyopathy',
      // cascaded from Foundations
      'ST-Elevation Myocardial Infarction (Inferior STEMI)',
      'Acute Heart Failure Exacerbation',
      'Atrial Fibrillation with Rapid Ventricular Response',
      'Hypertensive Emergency',
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
      // cascaded from Foundations
      'Community-Acquired Pneumonia',
      'Acute Asthma Exacerbation',
      'Pulmonary Embolism',
      'Spontaneous Pneumothorax',
    ],
    Advanced: [
      'Sarcoidosis',
      'Hypersensitivity Pneumonitis',
      'Goodpasture Syndrome',
      'Pulmonary Alveolar Proteinosis',
      // cascaded from Clinical
      'COPD Exacerbation',
      'Exudative Pleural Effusion',
      'Lung Abscess',
      'Pulmonary Arterial Hypertension',
      // cascaded from Foundations
      'Community-Acquired Pneumonia',
      'Acute Asthma Exacerbation',
      'Pulmonary Embolism',
      'Spontaneous Pneumothorax',
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
      "Bell's Palsy",
      // cascaded from Foundations
      'Acute Ischemic Stroke',
      'Bacterial Meningitis',
      'First Unprovoked Seizure',
      'Migraine with Aura',
    ],
    Advanced: [
      'Anti-NMDAR Autoimmune Encephalitis',
      'Cerebral Venous Sinus Thrombosis',
      'Normal Pressure Hydrocephalus',
      'Neuromyelitis Optica Spectrum Disorder',
      // cascaded from Clinical
      'Chronic Subdural Hematoma',
      'Guillain-Barré Syndrome',
      'Transient Ischemic Attack',
      "Bell's Palsy",
      // cascaded from Foundations
      'Acute Ischemic Stroke',
      'Bacterial Meningitis',
      'First Unprovoked Seizure',
      'Migraine with Aura',
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
      "Crohn's Disease Flare",
      'Small Bowel Obstruction',
      'Acute Diverticulitis',
      'Acute Hepatitis B',
      // cascaded from Foundations
      'Acute Appendicitis',
      'Acute Pancreatitis',
      'Acute Cholecystitis',
      'Peptic Ulcer Disease with Upper GI Bleed',
    ],
    Advanced: [
      "Whipple's Disease",
      'Primary Sclerosing Cholangitis',
      'Autoimmune Hepatitis',
      'Ischemic Colitis',
      // cascaded from Clinical
      "Crohn's Disease Flare",
      'Small Bowel Obstruction',
      'Acute Diverticulitis',
      'Acute Hepatitis B',
      // cascaded from Foundations
      'Acute Appendicitis',
      'Acute Pancreatitis',
      'Acute Cholecystitis',
      'Peptic Ulcer Disease with Upper GI Bleed',
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
      // cascaded from Foundations
      'Prerenal Acute Kidney Injury',
      'Acute Pyelonephritis',
      'Ureterolithiasis (Ureteral Stone)',
      'Severe Hyperkalemia',
    ],
    Advanced: [
      'Granulomatosis with Polyangiitis (ANCA-Associated Vasculitis)',
      'IgA Nephropathy',
      'Membranous Nephropathy',
      'Thrombotic Microangiopathy (TMA)',
      // cascaded from Clinical
      'Nephrotic Syndrome',
      'SIADH with Symptomatic Hyponatremia',
      'Rhabdomyolysis with Acute Kidney Injury',
      'Acute Interstitial Nephritis',
      // cascaded from Foundations
      'Prerenal Acute Kidney Injury',
      'Acute Pyelonephritis',
      'Ureterolithiasis (Ureteral Stone)',
      'Severe Hyperkalemia',
    ],
  },
  'Endocrine / Metabolic': {
    Foundations: [
      'Diabetic Ketoacidosis',
      'Hypothyroidism',
      'Severe Hypoglycemia',
      "Graves' Disease (Hyperthyroidism)",
    ],
    Clinical: [
      'Hyperosmolar Hyperglycemic State',
      "Addison's Disease (Primary Adrenal Insufficiency)",
      "Cushing's Syndrome",
      'Primary Hyperparathyroidism',
      // cascaded from Foundations
      'Diabetic Ketoacidosis',
      'Hypothyroidism',
      'Severe Hypoglycemia',
      "Graves' Disease (Hyperthyroidism)",
    ],
    Advanced: [
      'Pheochromocytoma',
      'Acute Intermittent Porphyria',
      'Carcinoid Syndrome',
      "Primary Hyperaldosteronism (Conn's Syndrome)",
      // cascaded from Clinical
      'Hyperosmolar Hyperglycemic State',
      "Addison's Disease (Primary Adrenal Insufficiency)",
      "Cushing's Syndrome",
      'Primary Hyperparathyroidism',
      // cascaded from Foundations
      'Diabetic Ketoacidosis',
      'Hypothyroidism',
      'Severe Hypoglycemia',
      "Graves' Disease (Hyperthyroidism)",
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
      // cascaded from Foundations
      'Sepsis (Bacterial — Urinary Source)',
      'Cellulitis',
      'Influenza',
      'Meningococcal Meningitis',
    ],
    Advanced: [
      'Rocky Mountain Spotted Fever',
      'Disseminated Histoplasmosis',
      'Leptospirosis',
      'Strongyloidiasis with Hyperinfection Syndrome',
      // cascaded from Clinical
      'Infective Endocarditis',
      'Pneumocystis Jirovecii Pneumonia (PCP)',
      'Acute Osteomyelitis',
      'Pulmonary Tuberculosis',
      // cascaded from Foundations
      'Sepsis (Bacterial — Urinary Source)',
      'Cellulitis',
      'Influenza',
      'Meningococcal Meningitis',
    ],
  },
  'Hematologic / Oncologic': {
    Foundations: [
      'Iron Deficiency Anemia',
      'Deep Vein Thrombosis',
      'Immune Thrombocytopenia (ITP)',
      'Sickle Cell Vaso-Occlusive Crisis',
    ],
    Clinical: [
      'Vitamin B12 Deficiency Megaloblastic Anemia',
      'Warm Autoimmune Hemolytic Anemia',
      'Multiple Myeloma',
      'Diffuse Large B-Cell Lymphoma',
      // cascaded from Foundations
      'Iron Deficiency Anemia',
      'Deep Vein Thrombosis',
      'Immune Thrombocytopenia (ITP)',
      'Sickle Cell Vaso-Occlusive Crisis',
    ],
    Advanced: [
      'CLL with Autoimmune Hemolytic Anemia',
      'Waldenström Macroglobulinemia',
      'Paroxysmal Nocturnal Hemoglobinuria',
      'Myelodysplastic Syndrome',
      // cascaded from Clinical
      'Vitamin B12 Deficiency Megaloblastic Anemia',
      'Warm Autoimmune Hemolytic Anemia',
      'Multiple Myeloma',
      'Diffuse Large B-Cell Lymphoma',
      // cascaded from Foundations
      'Iron Deficiency Anemia',
      'Deep Vein Thrombosis',
      'Immune Thrombocytopenia (ITP)',
      'Sickle Cell Vaso-Occlusive Crisis',
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
      // cascaded from Foundations
      'Acute Gouty Arthritis',
      'Lumbar Disc Herniation with Radiculopathy',
      'Rheumatoid Arthritis',
      'Osteoporotic Vertebral Compression Fracture',
    ],
    Advanced: [
      'Dermatomyositis',
      'Antiphospholipid Syndrome',
      "Adult-Onset Still's Disease",
      'Systemic Lupus Erythematosus with Nephritis',
      // cascaded from Clinical
      'Septic Arthritis',
      'Pseudogout (CPPD Crystal Arthropathy)',
      'Polymyalgia Rheumatica',
      'Reactive Arthritis',
      // cascaded from Foundations
      'Acute Gouty Arthritis',
      'Lumbar Disc Herniation with Radiculopathy',
      'Rheumatoid Arthritis',
      'Osteoporotic Vertebral Compression Fracture',
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
      // cascaded from Foundations
      'Major Depressive Episode',
      'Panic Disorder',
      'First-Episode Psychosis',
      'Opioid Use Disorder with Withdrawal',
    ],
    Advanced: [
      'Neuroleptic Malignant Syndrome',
      'Serotonin Syndrome',
      "Wernicke's Encephalopathy",
      'Lithium Toxicity',
      // cascaded from Clinical
      'Bipolar I Disorder — Manic Episode',
      'Alcohol Withdrawal Syndrome',
      'PTSD',
      'Generalized Anxiety Disorder',
      // cascaded from Foundations
      'Major Depressive Episode',
      'Panic Disorder',
      'First-Episode Psychosis',
      'Opioid Use Disorder with Withdrawal',
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
      // cascaded from Foundations
      'Acetaminophen Overdose',
      'Opioid Toxidrome',
      'Carbon Monoxide Poisoning',
      'Benzodiazepine Overdose',
    ],
    Advanced: [
      'Organophosphate Poisoning',
      'Anticholinergic Toxidrome',
      'Cyanide Poisoning',
      'Beta-Blocker Overdose',
      // cascaded from Clinical
      'Tricyclic Antidepressant Overdose',
      'Salicylate Toxicity',
      'Digoxin Toxicity',
      'Methanol Ingestion',
      // cascaded from Foundations
      'Acetaminophen Overdose',
      'Opioid Toxidrome',
      'Carbon Monoxide Poisoning',
      'Benzodiazepine Overdose',
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
      // cascaded from Foundations
      'Tension Pneumothorax',
      'Hemorrhagic Shock',
      'Epidural Hematoma',
      'Splenic Laceration',
    ],
    Advanced: [
      'Fat Embolism Syndrome',
      'Traumatic Rhabdomyolysis with Multi-organ Dysfunction',
      'Abdominal Compartment Syndrome',
      'Crush Syndrome',
      // cascaded from Clinical
      'Traumatic Aortic Injury',
      'Rib Fractures with Hemothorax',
      'Compartment Syndrome',
      'Pelvic Fracture',
      // cascaded from Foundations
      'Tension Pneumothorax',
      'Hemorrhagic Shock',
      'Epidural Hematoma',
      'Splenic Laceration',
    ],
  },
}

export const VARIANT_SEEDS: (string | null)[] = [null]

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function makeCaseId(system: string, difficulty: string, diagnosis: string, variantIndex: number): string {
  return `${slugify(system)}-${slugify(difficulty)}-${slugify(diagnosis)}-${variantIndex}`
}

export function findCaseInManifest(id: string): { system: string; difficulty: string; diagnosis: string } | null {
  for (const [system, byDiff] of Object.entries(MANIFEST)) {
    for (const [difficulty, diagnoses] of Object.entries(byDiff)) {
      for (const diagnosis of diagnoses) {
        if (makeCaseId(system, difficulty, diagnosis, 0) === id) {
          return { system, difficulty, diagnosis }
        }
      }
    }
  }
  return null
}
