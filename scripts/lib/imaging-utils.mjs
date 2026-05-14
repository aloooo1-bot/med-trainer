/**
 * Shared imaging utilities used by prefetch-imaging.mjs and image-agents.mjs.
 * Contains Open-i query logic, test classification, and the fetch wrapper.
 */

// ── Test classification ───────────────────────────────────────────────────────

export function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function isECG(name)       { const n = norm(name); return n.includes('ecg') || n.includes('ekg') || n.includes('electrocardiogram') }
export function isSmear(name)     { const n = name.toLowerCase(); return n.includes('blood smear') || n.includes('peripheral smear') || n.includes('peripheral blood') || n.includes('malaria') || n.includes('blood film') }
export function isBiopsy(name)    { const n = name.toLowerCase(); return (n.includes('biopsy') || n.includes('pathology') || n.includes('histology') || n.includes('h&e')) && !n.includes('skin biopsy') }
export function isFundus(name)    { const n = name.toLowerCase(); return n.includes('fundus') || n.includes('fundoscopy') || n.includes('ophthalmoscopy') || n.includes('retinal') }
export function isDerm(name)      { const n = name.toLowerCase(); return n.includes('skin biopsy') || n.includes('dermoscopy') || n.includes('skin lesion') }
export function isUrine(name)     { const n = name.toLowerCase(); return n.includes('urine microscopy') || n.includes('urine sediment') || n.includes('microscopic urinalysis') }
export function isProcedure(name) {
  const n = name.toLowerCase()
  return (
    n.includes('endoscopy') || n.includes('colonoscopy') || n.includes('bronchoscopy') ||
    n.includes('lumbar puncture') || n.includes('paracentesis') || n.includes('thoracentesis') ||
    n.includes('arthrocentesis') || n.includes('biopsy') || n.includes('pathology') ||
    n.includes('coronary angiography') || n.includes('cardiac catheterization') || n.includes('cardiac cath') ||
    n.includes('adrenal vein sampling') || n.includes('right heart cath') ||
    n.includes('splenic artery angiography') || n.includes('retrograde urethrogram') ||
    n.includes('peripheral pulse doppler') || n.includes('pelvic angiography') ||
    n.includes('compartment pressure') || n.includes('bladder pressure') || n.includes('intravesical') ||
    n.includes('eeg') || n.includes('electroencephalog') || n.includes('electromyog') ||
    n.includes('nerve conduction') || n.includes('holter') || n.includes('cardiac monitor strip') ||
    n.includes('dexa') || n.includes('bone density') || n.includes('absorptiometry') ||
    n.includes('scintigraphy') || n.includes('dotatate') || n.includes('tc-99') || n.includes('tc99') ||
    (n.includes('pet') && (n.includes('/ct') || n.includes('-ct') || n.includes('whole body'))) ||
    (n.includes('ventilation') && n.includes('perfusion')) || n.includes('v/q') ||
    n.includes('fibroscan') || n.includes('transient elastography') ||
    n.includes('bronchoalveolar lavage') || n.includes('bal ') ||
    n.includes('fat stain') || n.includes('oil red o') || n.includes('gms stain') || n.includes('fungal stain')
  )
}

export function isSpecialOrProcedure(name) {
  return isECG(name) || isSmear(name) || isBiopsy(name) || isFundus(name) || isDerm(name) || isUrine(name) || isProcedure(name)
}

// Returns true when a query is seeking a normal/negative study — Open-i has virtually
// no images tagged as normal, so these queries never yield useful educational matches.
export function isNormalQuery(text) {
  if (!text) return false
  const t = text.toLowerCase()
  return (
    /\bnormal\b/.test(t) ||
    t.includes('no pathology') ||
    t.includes('no intracranial') ||
    t.includes('no white matter') ||
    t.includes('no lesion') ||
    t.includes('no infarct') ||
    t.includes('unremarkable') ||
    t.includes('within normal limits') ||
    t.includes('rule out') ||
    t.includes('no acute')
  )
}

// ── Test name → Open-i params ─────────────────────────────────────────────────

export const TEST_PARAMS = [
  [['chest x ray','chest xray','chest x-ray','chest radiograph','cxr'],         { it:'x', coll:'cxr,mpx', modality:'xray'  }],
  [['ct chest','chest ct','ct thorax','computed tomography chest'],              { it:'xm',coll:'mpx',     modality:'ct'    }],
  [['ct pulmonary angiography','ctpa','ct pulmonary angiogram'],                 { it:'xm',coll:'mpx',     modality:'ct'    }],
  [['ct abdomen and pelvis','ct abdomen pelvis','ct a p','ct ap'],               { it:'xm',coll:'mpx',     modality:'ct'    }],
  [['ct abdomen','ct pelvis','abdominal ct','pelvic ct'],                        { it:'xm',coll:'mpx',     modality:'ct'    }],
  [['ct head','ct brain','head ct','brain ct','non-contrast ct head'],           { it:'xm',coll:'mpx',     modality:'ct'    }],
  [['ct spine','ct lumbar','ct cervical','ct thoracic'],                         { it:'xm',coll:'mpx',     modality:'ct'    }],
  [['mri brain','brain mri','mri head','head mri','flair mri','dwi brain'],      { it:'m', coll:'mpx',     modality:'mri'   }],
  [['mri spine','spine mri','mri lumbar','lumbar mri','mri cervical','mri c-spine','mri l-spine'], { it:'m',coll:'mpx', modality:'mri' }],
  [['mri knee','knee mri'],                                                      { it:'m', coll:'mpx',     modality:'mri'   }],
  [['mri shoulder','shoulder mri'],                                              { it:'m', coll:'mpx',     modality:'mri'   }],
  [['mri hip','hip mri','mri pelvis','pelvis mri'],                              { it:'m', coll:'mpx',     modality:'mri'   }],
  [['mri ankle','ankle mri','mri foot','foot mri'],                              { it:'m', coll:'mpx',     modality:'mri'   }],
  [['mri abdomen','abdominal mri','mrcp','mri liver','mri pancreas'],            { it:'m', coll:'mpx',     modality:'mri'   }],
  [['mri cardiac','cardiac mri','cmr'],                                          { it:'m', coll:'mpx',     modality:'mri'   }],
  [['renal ultrasound','kidney ultrasound','renal us'],                          { it:'u', coll:'mpx',     modality:'us'    }],
  [['abdominal ultrasound','abdomen ultrasound','abdominal us'],                 { it:'u', coll:'mpx',     modality:'us'    }],
  [['echocardiogram','transthoracic echocardiogram','tte','2d echo'],            { it:'u', coll:'mpx',     modality:'us'    }],
  [['pelvic ultrasound','pelvic us','transvaginal ultrasound','tvus'],           { it:'u', coll:'mpx',     modality:'us'    }],
  [['venous doppler','lower extremity ultrasound','leg ultrasound'],             { it:'u', coll:'mpx',     modality:'us'    }],
  [['thyroid ultrasound','thyroid us'],                                          { it:'u', coll:'mpx',     modality:'us'    }],
  [['carotid ultrasound','carotid doppler'],                                     { it:'u', coll:'mpx',     modality:'us'    }],
  [['scrotal ultrasound','testicular ultrasound'],                               { it:'u', coll:'mpx',     modality:'us'    }],
  [['knee x-ray','knee xray','x-ray knee','xray knee'],                         { it:'x', coll:'mpx',     modality:'xray'  }],
  [['hip x-ray','hip xray','pelvis x-ray','hip radiograph'],                    { it:'x', coll:'mpx',     modality:'xray'  }],
  [['shoulder x-ray','shoulder xray','shoulder radiograph'],                    { it:'x', coll:'mpx',     modality:'xray'  }],
  [['ankle x-ray','ankle xray','foot x-ray','foot xray'],                       { it:'x', coll:'mpx',     modality:'xray'  }],
  [['wrist x-ray','wrist xray','hand x-ray','hand xray'],                       { it:'x', coll:'mpx',     modality:'xray'  }],
  [['spine x-ray','lumbar x-ray','cervical x-ray','lumbar xray'],               { it:'x', coll:'mpx',     modality:'xray'  }],
  [['abdominal x-ray','kub','flat plate abdomen'],                               { it:'x', coll:'cxr,mpx', modality:'xray'  }],
]

export function getTestParams(testName) {
  if (isSpecialOrProcedure(testName)) return 'skip'
  const n = norm(testName)
  for (const [aliases, params] of TEST_PARAMS) {
    if (aliases.some(a => n.includes(a) || a.includes(n))) return params
  }
  if (n.includes('ct ') || n.startsWith('ct') || n.includes('computed tomography')) return { it:'xm', coll:'mpx', modality:'ct' }
  if (n.includes('mri') || n.includes('magnetic resonance'))                         return { it:'m',  coll:'mpx', modality:'mri' }
  if (n.includes('ultrasound') || n.includes('sonograph') || n.includes(' us ') || n.includes('echo')) return { it:'u', coll:'mpx', modality:'us' }
  if (n.includes('x-ray') || n.includes('xray') || n.includes('radiograph'))        return { it:'x',  coll:'cxr,mpx', modality:'xray' }
  return null
}

// ── Diagnosis → Open-i query ──────────────────────────────────────────────────

export const DIAG_QUERY = [
  [['stemi','st-elevation myocardial infarction'],                              { xray:'cardiomegaly pulmonary edema', us:'wall motion abnormality echocardiogram STEMI' }],
  [['nstemi','non-st elevation myocardial infarction','acute coronary syndrome','unstable angina'], { xray:'cardiomegaly pulmonary edema', us:'wall motion abnormality echocardiogram' }],
  [['congestive heart failure','heart failure','chf','pulmonary edema','acute decompensated heart failure'], { xray:'pulmonary edema cardiomegaly heart failure', us:'heart failure echocardiogram reduced ejection fraction' }],
  [['aortic dissection'],                                                        { ct:'aortic dissection intimal flap' }],
  [['aortic stenosis'],                                                          { us:'aortic stenosis calcified valve echocardiogram', xray:'aortic calcification stenosis' }],
  [['hypertrophic cardiomyopathy','hcm'],                                       { us:'hypertrophic cardiomyopathy echocardiogram septal', mri:'hypertrophic cardiomyopathy cardiac MRI' }],
  [['dilated cardiomyopathy'],                                                   { us:'dilated cardiomyopathy echocardiogram', xray:'cardiomegaly dilated cardiomyopathy' }],
  [['pericardial effusion','cardiac tamponade','pericarditis'],                  { us:'pericardial effusion echocardiogram tamponade', xray:'cardiomegaly pericardial effusion' }],
  [['myocarditis'],                                                              { mri:'myocarditis cardiac MRI late gadolinium enhancement', us:'myocarditis echocardiogram' }],
  [['endocarditis','infective endocarditis'],                                    { us:'endocarditis vegetation echocardiogram valve', xray:'endocarditis chest' }],
  [['pulmonary hypertension'],                                                   { xray:'pulmonary hypertension cardiomegaly right heart', us:'pulmonary hypertension echocardiogram right ventricular' }],
  [['pulmonary embolism','pulmonary thromboembolism','pe saddle embolus'],       { ct:'pulmonary embolism filling defect', xray:'pulmonary embolism chest' }],
  [['deep vein thrombosis','dvt'],                                               { us:'deep vein thrombosis non-compressible vein ultrasound' }],
  [['pneumothorax','tension pneumothorax','spontaneous pneumothorax'],          { xray:'pneumothorax lung collapse visceral pleural line' }],
  [['pleural effusion'],                                                         { xray:'pleural effusion costophrenic angle blunting' }],
  [['pneumonia','community-acquired pneumonia','cap','lobar pneumonia','aspiration pneumonia'], { xray:'pneumonia consolidation opacity' }],
  [['copd','emphysema'],                                                         { xray:'emphysema hyperinflation copd flattened diaphragm' }],
  [['asthma'],                                                                   { xray:'asthma hyperinflation peribronchial cuffing' }],
  [['lung cancer','pulmonary mass','lung mass','non-small cell lung cancer','small cell lung cancer'], { xray:'lung mass pulmonary nodule hilar', ct:'lung cancer pulmonary mass spiculated' }],
  [['hemothorax','pneumohemothorax'],                                            { xray:'hemothorax pleural opacity', ct:'hemothorax hemopneumothorax' }],
  [['tuberculosis','pulmonary tuberculosis'],                                    { xray:'tuberculosis cavitation upper lobe infiltrate', ct:'tuberculosis pulmonary cavitation' }],
  [['sarcoidosis'],                                                              { xray:'sarcoidosis bilateral hilar lymphadenopathy', ct:'sarcoidosis ground glass nodules' }],
  [['interstitial lung disease','pulmonary fibrosis','ipf'],                    { xray:'interstitial lung disease fibrosis honeycombing', ct:'pulmonary fibrosis ground glass reticulation' }],
  [['ards','acute respiratory distress syndrome'],                              { xray:'ARDS bilateral opacities diffuse infiltrates', ct:'ARDS bilateral consolidation' }],
  [['acute appendicitis','appendicitis'],                                        { ct:'appendicitis enlarged appendix periappendiceal fat stranding' }],
  [['bowel obstruction','small bowel obstruction','large bowel obstruction'],    { xray:'bowel obstruction dilated loops air fluid levels', ct:'small bowel obstruction transition point' }],
  [['pancreatitis','acute pancreatitis','necrotizing pancreatitis'],             { ct:'pancreatitis peripancreatic stranding necrotizing' }],
  [['diverticulitis'],                                                           { ct:'diverticulitis sigmoid pericolic stranding' }],
  [['cholecystitis','gallstones','cholelithiasis','acute cholecystitis'],        { us:'gallstones cholecystitis biliary pericholecystic' }],
  [['choledocholithiasis','cholangitis'],                                        { us:'bile duct dilation choledocholithiasis', ct:'biliary obstruction common bile duct' }],
  [['liver cirrhosis','hepatocellular carcinoma','cirrhosis'],                  { ct:'liver cirrhosis hepatic nodular', us:'cirrhosis ascites portal hypertension' }],
  [["crohn's disease",'crohn disease'],                                         { ct:'crohn disease small bowel thickening', mri:'crohn disease mri enterography' }],
  [['ulcerative colitis'],                                                       { ct:'ulcerative colitis colonic wall thickening' }],
  [['peptic ulcer disease','gastric ulcer','duodenal ulcer'],                   { ct:'peptic ulcer free air perforation', xray:'free air pneumoperitoneum perforation' }],
  [['colon cancer','colorectal cancer'],                                         { ct:'colon cancer mass' }],
  [['mesenteric ischemia','intestinal ischemia'],                               { ct:'mesenteric ischemia bowel wall pneumatosis' }],
  [['ischemic stroke','stroke','cerebrovascular accident'],                     { ct:'ischemic stroke hypodensity brain', mri:'ischemic stroke diffusion restriction DWI' }],
  [['intracranial hemorrhage','subarachnoid hemorrhage','sah','subdural hematoma','epidural hematoma'], { ct:'intracranial hemorrhage hyperdense blood' }],
  [['brain tumor','glioblastoma','meningioma','brain mass','brain metastasis'],  { mri:'brain tumor glioblastoma enhancement MRI', ct:'brain mass ring enhancing' }],
  [['meningitis'],                                                               { ct:'meningitis brain CT', mri:'meningitis leptomeningeal enhancement MRI' }],
  [['multiple sclerosis','ms'],                                                  { mri:'multiple sclerosis white matter lesions FLAIR demyelination' }],
  [['brain abscess'],                                                            { mri:'brain abscess ring enhancing rim enhancement', ct:'brain abscess ring enhancing' }],
  [['hydrocephalus'],                                                            { ct:'hydrocephalus dilated ventricles', mri:'hydrocephalus ventricular enlargement' }],
  [['spinal stenosis','lumbar stenosis'],                                        { mri:'spinal stenosis cord compression' }],
  [['herniated disc','disc herniation'],                                         { mri:'disc herniation nerve root compression' }],
  [['kidney stone','nephrolithiasis','ureterolithiasis'],                       { ct:'kidney stone nephrolithiasis calculus', xray:'kidney stone radiopaque calculus' }],
  [['pyelonephritis'],                                                           { ct:'pyelonephritis wedge-shaped hypoenhancement', us:'pyelonephritis kidney swelling' }],
  [['renal cell carcinoma','renal mass','kidney cancer'],                       { ct:'renal cell carcinoma kidney mass', us:'renal mass complex cyst' }],
  [['polycystic kidney disease','pkd'],                                         { us:'polycystic kidney multiple cysts', ct:'polycystic kidney bilateral cysts' }],
  [['ovarian cyst','ovarian torsion','ectopic pregnancy'],                      { us:'ovarian cyst pelvic ultrasound complex' }],
  [['acl tear','anterior cruciate ligament'],                                   { mri:'ACL tear anterior cruciate ligament knee MRI' }],
  [['meniscus tear'],                                                            { mri:'meniscus tear knee MRI medial lateral' }],
  [['rotator cuff tear'],                                                        { mri:'rotator cuff tear supraspinatus shoulder MRI' }],
  [['shoulder dislocation'],                                                     { xray:'shoulder dislocation glenohumeral' }],
  [['hip fracture','femoral neck fracture'],                                    { xray:'hip fracture femoral neck intertrochanteric' }],
  [['ankle fracture'],                                                           { xray:'ankle fracture malleolus bimalleolar' }],
  [['wrist fracture','colles fracture','distal radius fracture'],               { xray:'distal radius fracture colles wrist' }],
  [['spine fracture','compression fracture','vertebral fracture'],              { xray:'vertebral compression fracture spine', mri:'vertebral fracture bone marrow edema MRI' }],
  [['osteomyelitis'],                                                            { mri:'osteomyelitis bone marrow edema periosteal reaction MRI', xray:'osteomyelitis periosteal bone destruction' }],
  [['septic arthritis'],                                                         { mri:'septic arthritis joint effusion synovial enhancement MRI' }],
  [['gout'],                                                                     { xray:'gout tophus juxta-articular erosion' }],
  [['osteoarthritis'],                                                           { xray:'osteoarthritis joint space narrowing osteophyte' }],
  [['rheumatoid arthritis'],                                                     { xray:'rheumatoid arthritis joint erosions periarticular osteopenia' }],
  [['hodgkin lymphoma','non-hodgkin lymphoma','lymphoma'],                      { ct:'lymphadenopathy lymphoma mediastinal neck' }],
  [['multiple myeloma'],                                                         { xray:'multiple myeloma lytic lesions punched out skull', ct:'myeloma vertebral lytic lesions' }],
  [['leukemia','cll','all','aml'],                                              { ct:'leukemia splenomegaly lymphadenopathy' }],
  [['abdominal aortic aneurysm','aaa'],                                         { ct:'abdominal aortic aneurysm CT', us:'aortic aneurysm ultrasound dilation' }],
  [['splenic laceration','splenic rupture'],                                    { ct:'splenic laceration hemoperitoneum FAST exam' }],
  [['traumatic brain injury','tbi','cerebral contusion'],                       { ct:'cerebral contusion traumatic brain injury hemorrhage' }],
  [['pneumoperitoneum','bowel perforation'],                                    { xray:'pneumoperitoneum free air subdiaphragmatic', ct:'pneumoperitoneum free air bowel perforation' }],
  [['pelvic fracture'],                                                          { xray:'pelvic fracture pubic rami', ct:'pelvic fracture complex CT' }],
  [['adrenal mass','pheochromocytoma','hyperaldosteronism',"cushing's"],        { ct:'adrenal mass adenoma CT', mri:'adrenal mass MRI' }],
  [['thyroid nodule','thyroid cancer','goiter'],                                { us:'thyroid nodule ultrasound hypoechoic' }],
  [['pituitary adenoma','pituitary tumor','acromegaly'],                        { mri:'pituitary adenoma sellar MRI macroadenoma' }],
  [['epiglottitis'],                                                             { xray:'epiglottitis thumb sign lateral neck' }],
  [['lung abscess'],                                                             { xray:'lung abscess cavitation air fluid level', ct:'pulmonary abscess thick-walled cavity' }],
  [['liver abscess'],                                                            { ct:'liver abscess hypodense rim enhancing', us:'hepatic abscess complex fluid' }],
  [['intussusception'],                                                          { us:'intussusception target sign bowel', xray:'intussusception soft tissue mass' }],
  [['atrial fibrillation','afib','af '],                                        { xray:'atrial fibrillation cardiomegaly left atrial enlargement', us:'atrial fibrillation dilated left atrium echocardiogram' }],
  [['traumatic aortic injury','aortic transection','blunt aortic injury'],      { ct:'aortic injury traumatic pseudoaneurysm mediastinal widening CT', xray:'mediastinal widening traumatic aortic injury chest' }],
  [['exudative pleural effusion'],                                              { xray:'pleural effusion costophrenic angle unilateral exudative', ct:'pleural effusion exudate CT chest' }],
  [['pulmonary arterial hypertension','pah'],                                   { xray:'pulmonary arterial hypertension enlarged pulmonary artery', us:'pulmonary hypertension echocardiogram right ventricular' }],
  [['first unprovoked seizure','unprovoked seizure','new onset seizure'],       { ct:'seizure brain CT cortical dysplasia', mri:'seizure focal cortical dysplasia MRI epilepsy protocol' }],
  [['first episode psychosis','first-episode psychosis'],                       { ct:'normal brain CT no intracranial pathology', mri:'normal brain MRI no white matter lesion' }],
  [['cerebral venous sinus thrombosis','cerebral venous thrombosis','cvst'],    { ct:'cerebral venous sinus thrombosis delta sign filling defect', mri:'cerebral venous thrombosis MRV empty delta sign' }],
  [['reactive arthritis','reiter'],                                             { xray:'reactive arthritis sacroiliitis asymmetric joint erosion', us:'reactive arthritis knee joint effusion synovitis ultrasound' }],
  [["adult-onset still's disease",'adult onset still'],                         { ct:'hepatosplenomegaly lymphadenopathy Still disease CT', us:'splenomegaly hepatomegaly lymphadenopathy ultrasound' }],
  [['dermatomyositis','polymyositis','inflammatory myopathy'],                  { mri:'dermatomyositis inflammatory myopathy thigh muscle edema perifascicular MRI', xray:'dermatomyositis interstitial lung disease chest' }],
  [['polymyalgia rheumatica','pmr'],                                            { us:'subdeltoid bursitis shoulder bicipital tenosynovitis ultrasound', xray:'shoulder osteoarthritis calcific tendinitis chest' }],
  [['antiphospholipid syndrome','antiphospholipid antibody','aps'],             { us:'deep vein thrombosis non-compressible vein ultrasound', ct:'pulmonary embolism filling defect CT' }],
  [['systemic lupus erythematosus','lupus nephritis','sle'],                   { us:'lupus nephritis echogenic kidneys pleural effusion ultrasound', xray:'lupus pleuritis pleural effusion cardiomegaly chest', mri:'lupus nephritis kidney MRI' }],
  [['compartment syndrome'],                                                    { xray:'soft tissue swelling compartment tibia fibula fracture', mri:'compartment syndrome muscle edema MRI lower extremity' }],
  [['rhabdomyolysis','crush syndrome','traumatic rhabdomyolysis'],              { mri:'rhabdomyolysis muscle edema myonecrosis MRI thigh', us:'rhabdomyolysis echogenic kidney cortex ultrasound', ct:'crush injury soft tissue edema CT' }],
  [['abdominal compartment syndrome'],                                          { ct:'bowel wall edema diaphragmatic elevation abdominal compartment syndrome CT', xray:'abdominal distension ileus bowel obstruction' }],
  [['fat embolism syndrome','fat embolism'],                                    { xray:'fat embolism bilateral pulmonary infiltrates chest', ct:'fat embolism ground glass opacity bilateral CT chest' }],
  [['membranous nephropathy','membranous glomerulonephritis'],                  { us:'nephrotic syndrome echogenic kidneys bilateral renal ultrasound', ct:'nephrotic syndrome pleural effusion ascites CT' }],
  [['siadh','syndrome of inappropriate antidiuretic hormone'],                  { xray:'small cell lung cancer hilar mass chest X-ray', ct:'lung cancer hilar mediastinal mass CT' }],
  [['rhabdomyolysis with acute kidney injury'],                                 { us:'rhabdomyolysis echogenic kidney cortex ultrasound AKI', mri:'rhabdomyolysis muscle edema thigh MRI' }],
  [['paroxysmal nocturnal hemoglobinuria','pnh'],                               { ct:'budd-chiari hepatic venous thrombosis CT abdominal', us:'hepatic vein thrombosis splenomegaly ultrasound' }],
  [['myelodysplastic syndrome','mds'],                                          { ct:'splenomegaly lymphadenopathy myelodysplastic syndrome CT', xray:'myelodysplastic syndrome chest normal radiograph' }],
  [['immune thrombocytopenia','itp','idiopathic thrombocytopenic'],             { us:'normal spleen ultrasound ITP splenomegaly', xray:'immune thrombocytopenia normal chest' }],
  [['vitamin b12 deficiency','b12 deficiency','cobalamin deficiency','megaloblastic anemia'], { mri:'subacute combined degeneration posterior column T2 hyperintensity spinal cord', xray:'megaloblastic anemia normal chest radiograph' }],
  [['warm autoimmune hemolytic anemia','autoimmune hemolytic anemia','aiha'],   { us:'splenomegaly liver ultrasound hemolytic anemia', ct:'splenomegaly lymphadenopathy CT abdomen' }],
  [['sepsis','urosepsis','bacteremia'],                                         { ct:'pyelonephritis perinephric stranding sepsis CT abdomen', us:'pyelonephritis kidney ultrasound sepsis' }],
  [['disseminated histoplasmosis','histoplasmosis'],                            { xray:'histoplasmosis miliary nodules bilateral chest', ct:'disseminated histoplasmosis lymphadenopathy splenomegaly CT' }],
  [['primary sclerosing cholangitis','psc'],                                    { mri:'primary sclerosing cholangitis beads on string biliary strictures MRCP', us:'bile duct dilation PSC cholangitis ultrasound' }],
  [['carbon monoxide poisoning','co poisoning'],                                { ct:'carbon monoxide poisoning bilateral globus pallidus hypodensity brain CT', mri:'carbon monoxide poisoning basal ganglia T2 hyperintensity brain MRI' }],
  [['methanol ingestion','methanol poisoning','methanol toxicity'],             { ct:'methanol poisoning bilateral putamen hypodensity brain CT', mri:'methanol poisoning putaminal necrosis MRI brain' }],
  [['organophosphate poisoning','organophosphate toxicity'],                    { xray:'organophosphate poisoning bilateral pulmonary edema aspiration chest', ct:'organophosphate aspiration pneumonia bilateral opacities' }],
  [["wernicke's encephalopathy",'wernicke encephalopathy','wernicke-korsakoff'], { mri:'Wernicke encephalopathy mammillary body thalamus FLAIR T2 hyperintensity MRI brain', ct:'Wernicke encephalopathy periaqueductal hyperdensity CT' }],
  [['lithium toxicity'],                                                        { mri:'lithium toxicity cerebellar signal change brain MRI', ct:'lithium toxicity brain CT basal ganglia' }],
  [['serotonin syndrome'],                                                      { xray:'serotonin syndrome normal chest radiograph', ct:'serotonin syndrome normal brain CT rule out' }],
  [['neuroleptic malignant syndrome','nms'],                                    { xray:'neuroleptic malignant syndrome aspiration pneumonia chest', ct:'neuroleptic malignant syndrome brain CT' }],
  [['tricyclic antidepressant overdose','tca overdose'],                        { xray:'tricyclic antidepressant aspiration pneumonia chest', ct:'TCA overdose pulmonary aspiration CT' }],
  [['salicylate toxicity','aspirin overdose','aspirin toxicity'],               { xray:'salicylate toxicity pulmonary edema chest', ct:'aspirin overdose cerebral edema CT' }],
  [['digoxin toxicity','digitalis toxicity'],                                   { xray:'digoxin toxicity cardiomegaly pleural effusion chest', us:'digoxin toxicity heart failure echocardiogram dilated' }],
  [['beta-blocker overdose','beta blocker overdose','beta blocker toxicity'],   { xray:'beta blocker overdose heart failure cardiomegaly chest', us:'beta blocker overdose cardiac echo reduced function' }],
  [['anticholinergic toxidrome','anticholinergic overdose'],                    { us:'bladder distension ultrasound urinary retention', ct:'anticholinergic toxidrome bladder distension CT pelvis' }],
  [['cyanide poisoning','hydrogen cyanide toxicity'],                           { xray:'cyanide poisoning normal chest radiograph', ct:'cyanide poisoning normal brain CT' }],
  [['benzodiazepine overdose','benzodiazepine toxicity'],                       { xray:'benzodiazepine overdose normal chest radiograph', ct:'benzodiazepine overdose brain CT' }],
  [['acetaminophen overdose','paracetamol overdose','tylenol overdose'],        { us:'acetaminophen hepatotoxicity liver ultrasound echogenicity', ct:'acetaminophen hepatotoxicity liver CT' }],
  [['panic disorder'],                                                          { xray:'panic disorder normal chest radiograph', us:'panic disorder echocardiogram normal' }],
  [['major depressive episode','major depressive disorder'],                    { ct:'normal brain CT no intracranial pathology', mri:'depression normal brain MRI' }],
  [['bipolar i disorder','bipolar disorder','bipolar ii disorder'],             { ct:'bipolar disorder normal brain CT', mri:'bipolar disorder normal brain MRI' }],
  [['generalized anxiety disorder','gad'],                                      { us:'thyroid ultrasound normal no nodule', xray:'anxiety disorder normal chest radiograph' }],
  [['ptsd','post-traumatic stress disorder','posttraumatic stress'],            { us:'hepatic steatosis liver echogenicity ultrasound', xray:'ptsd normal chest radiograph' }],
  [['alcohol withdrawal syndrome','alcohol withdrawal'],                        { ct:'alcoholic brain atrophy cortical volume loss CT', us:'alcoholic liver disease hepatic steatosis ultrasound' }],
  [['opioid use disorder','opioid withdrawal'],                                 { xray:'opioid overdose aspiration pneumonia chest', us:'opioid use disorder cardiac echocardiogram' }],
  [['bipolar i disorder manic episode'],                                        { ct:'normal brain CT', mri:'normal brain MRI' }],
]

export function getDiagQuery(diagnosis, modality) {
  const n = diagnosis.toLowerCase()
  function termMatch(text, term) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^a-z])${esc}(?:[^a-z]|$)`).test(text)
  }
  for (const [keys, queries] of DIAG_QUERY) {
    if (keys.some(k => termMatch(n, k) || termMatch(k, n))) {
      return queries[modality] ?? queries.xray ?? queries.ct ?? queries.mri ?? queries.us ?? ''
    }
  }
  return ''
}

// ── Open-i fetch (with retry + backoff) ───────────────────────────────────────

export const INTER_REQUEST_MS = 400

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export async function fetchOpenI(query, it, coll, attempt = 0) {
  await sleep(INTER_REQUEST_MS)
  const params = new URLSearchParams({ query, it, m: '1', n: '6', lic: 'cc' })
  if (coll) params.set('coll', coll)
  const url = `https://openi.nlm.nih.gov/api/search?${params}`
  const MAX_ATTEMPTS = 4

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
        const wait = 5000 * (attempt + 1)
        process.stdout.write(`      [retry ${attempt + 1}/${MAX_ATTEMPTS} HTTP ${res.status} — waiting ${wait/1000}s]\n`)
        await sleep(wait)
        return fetchOpenI(query, it, coll, attempt + 1)
      }
      return []
    }
    const data = await res.json()
    const list = Array.isArray(data?.list) ? data.list : []
    const results = list
      .filter(item => item.imgLarge)
      .map(item => {
        const imgFile = item.imgLarge.split('/').pop()?.replace(/\.[^.]+$/, '') ?? String(item.uid ?? '')
        return {
          uid:          imgFile,
          imageUrl:     `https://openi.nlm.nih.gov${item.imgLarge}`,
          thumbnailUrl: `https://openi.nlm.nih.gov${item.imgThumb || item.imgLarge}`,
          caption:      item.image?.caption ?? '',
          modality:     item.image?.modalityMajor ?? '',
          abstract:     item.abstract ?? undefined,
        }
      })
    const diagWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    return results.slice().sort((a, b) => {
      const textA = ((a.abstract ?? '') + ' ' + a.caption).toLowerCase()
      const textB = ((b.abstract ?? '') + ' ' + b.caption).toLowerCase()
      return diagWords.filter(w => textB.includes(w)).length - diagWords.filter(w => textA.includes(w)).length
    })
  } catch (err) {
    const isRetryable =
      err?.name === 'TimeoutError' ||
      err?.cause?.code === 'UND_ERR_SOCKET' ||
      err?.code === 'ECONNRESET' ||
      err?.message?.includes('fetch failed') ||
      err?.message?.includes('socket') ||
      err?.message?.includes('aborted')

    if (isRetryable && attempt < MAX_ATTEMPTS) {
      const wait = 5000 * (attempt + 1)
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message ?? 'network error')
      process.stdout.write(`      [retry ${attempt + 1}/${MAX_ATTEMPTS} — ${reason} — waiting ${wait/1000}s]\n`)
      await sleep(wait)
      return fetchOpenI(query, it, coll, attempt + 1)
    }
    const reason = err?.name === 'TimeoutError' ? 'timeout after retries' : (err?.cause?.code ?? err?.message ?? String(err))
    process.stdout.write(`      [failed — ${reason}]\n`)
    return []
  }
}

export async function fetchImagesForTest(testName, diagnosis, imagingCategory) {
  const params = getTestParams(testName)
  if (params === 'skip' || params === null) return { results: null, skipped: params === 'skip', unknown: params === null }

  let query = getDiagQuery(diagnosis, params.modality)
  if (!query) {
    query = imagingCategory || diagnosis.split(/\s+/).slice(0, 3).join(' ')
  }
  if (imagingCategory && query !== imagingCategory && !query.toLowerCase().includes(imagingCategory.toLowerCase())) {
    query = `${query} ${imagingCategory}`
  }

  const results = await fetchOpenI(query, params.it, params.coll)
  return { results, query, skipped: false, unknown: false }
}
