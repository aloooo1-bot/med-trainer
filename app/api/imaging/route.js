import { readFileSync } from "fs";
import { join } from "path";

// Maps study name keywords → NIH ChestX-ray14 finding labels
const STUDY_TO_FINDING = {
  "chest x-ray": ["Pneumonia", "Cardiomegaly", "Effusion", "Pneumothorax", "Atelectasis", "Consolidation"],
  "cxr": ["Pneumonia", "Cardiomegaly", "Effusion", "Pneumothorax", "Atelectasis", "Consolidation"],
  "chest radiograph": ["Pneumonia", "Cardiomegaly", "Effusion", "Pneumothorax", "Atelectasis", "Consolidation"],
  "ct chest": ["Mass", "Nodule", "Emphysema", "Fibrosis", "Effusion"],
  "ct scan": ["Mass", "Nodule", "Emphysema", "Fibrosis"],
  "echocardiogram": ["Cardiomegaly", "Edema"],
  "echo": ["Cardiomegaly", "Edema"],
};

const FINDING_KEYWORDS = {
  pneumonia: "Pneumonia",
  pneumothorax: "Pneumothorax",
  effusion: "Effusion",
  cardiomegaly: "Cardiomegaly",
  atelectasis: "Atelectasis",
  consolidation: "Consolidation",
  edema: "Edema",
  emphysema: "Emphysema",
  fibrosis: "Fibrosis",
  mass: "Mass",
  nodule: "Nodule",
  infiltration: "Infiltration",
  "pleural thickening": "Pleural_Thickening",
};

function pickFinding(studyName, reportText) {
  const lower = studyName.toLowerCase();

  // Try matching study name to a finding from the report text
  for (const [keyword, finding] of Object.entries(FINDING_KEYWORDS)) {
    if (reportText?.toLowerCase().includes(keyword)) {
      return finding;
    }
  }

  // Fall back to study type
  for (const [key, findings] of Object.entries(STUDY_TO_FINDING)) {
    if (lower.includes(key)) {
      return findings[Math.floor(Math.random() * findings.length)];
    }
  }

  // Default to chest X-ray findings
  const defaults = ["Pneumonia", "Cardiomegaly", "Effusion", "Atelectasis"];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

let lookup = null;

function getLookup() {
  if (lookup) return lookup;
  try {
    const p = join(process.cwd(), "public", "imaging-lookup.json");
    lookup = JSON.parse(readFileSync(p, "utf-8"));
    return lookup;
  } catch {
    return null;
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const study = searchParams.get("study") || "";
  const report = searchParams.get("report") || "";

  const data = getLookup();
  if (!data) {
    return Response.json({ error: "Imaging lookup not available. Run scripts/build_imaging_lookup.py first." }, { status: 503 });
  }

  const finding = pickFinding(study, report);
  const images = data[finding];

  if (!images?.length) {
    return Response.json({ error: `No images for finding: ${finding}` }, { status: 404 });
  }

  const filename = images[Math.floor(Math.random() * images.length)];
  return Response.json({ finding, filename, url: `/imaging/${filename}` });
}
