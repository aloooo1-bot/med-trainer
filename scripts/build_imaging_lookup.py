"""
One-time setup script: downloads a curated subset of NIH ChestX-ray14 images
and generates public/imaging/ + imaging-lookup.json for the med-trainer app.

Requirements: pip install kagglehub[pandas-datasets] pandas python-dotenv
"""

import json
import os
import shutil
import zipfile
from pathlib import Path

# Load .env.local before importing kagglehub so credentials are available
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env.local", override=True)

# kagglehub reads KAGGLE_KEY; map from our env var name
if "KAGGLE_API_TOKEN" in os.environ and "KAGGLE_KEY" not in os.environ:
    os.environ["KAGGLE_KEY"] = os.environ["KAGGLE_API_TOKEN"]

import kagglehub
import pandas as pd


def read_csv_from_kaggle(local_path: Path) -> pd.DataFrame:
    """Read a CSV that kagglehub may have stored as a ZIP."""
    if zipfile.is_zipfile(local_path):
        with zipfile.ZipFile(local_path) as z:
            with z.open(z.namelist()[0]) as f:
                return pd.read_csv(f, encoding="latin-1")
    return pd.read_csv(local_path, encoding="latin-1")

IMAGES_PER_FINDING = 20

# Findings we care about, mapped to display-friendly keys used in the app.
# Keys here must match the diagnosis-to-label map in imaging-lookup.json.
FINDINGS_OF_INTEREST = [
    "Atelectasis",
    "Cardiomegaly",
    "Consolidation",
    "Edema",
    "Effusion",
    "Emphysema",
    "Fibrosis",
    "Infiltration",
    "Mass",
    "Nodule",
    "Pleural_Thickening",
    "Pneumonia",
    "Pneumothorax",
]

OUT_DIR = Path(__file__).parent.parent / "public" / "imaging"
LOOKUP_PATH = Path(__file__).parent.parent / "public" / "imaging-lookup.json"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading metadata CSV via kagglehub...")
    csv_path = Path(kagglehub.dataset_download("nih-chest-xrays/data", path="Data_Entry_2017.csv"))
    df = read_csv_from_kaggle(csv_path)

    # The 'Finding Labels' column is pipe-separated, e.g. "Atelectasis|Effusion"
    lookup: dict[str, list[str]] = {}
    selected_images: set[str] = set()

    for finding in FINDINGS_OF_INTEREST:
        mask = df["Finding Labels"].str.contains(finding, regex=False)
        # Prefer single-finding images for cleaner examples
        single = df[mask & (df["Finding Labels"] == finding)]
        multi = df[mask & (df["Finding Labels"] != finding)]
        candidates = pd.concat([single, multi]).head(IMAGES_PER_FINDING)
        filenames = candidates["Image Index"].tolist()
        lookup[finding] = filenames
        selected_images.update(filenames)

    print(f"Selected {len(selected_images)} unique images across {len(FINDINGS_OF_INTEREST)} findings.")
    print("Downloading full dataset to locate image files (this may take a while)...")

    dataset_path = Path(kagglehub.dataset_download("nih-chest-xrays/data"))

    # Images are spread across images_00x/ subdirectories
    image_dirs = sorted(dataset_path.glob("images_*/images"))
    if not image_dirs:
        # Fallback: flat images/ dir
        image_dirs = [dataset_path / "images"]

    # Build a filename → path index
    print("Indexing downloaded images...")
    file_index: dict[str, Path] = {}
    for img_dir in image_dirs:
        for p in img_dir.iterdir():
            file_index[p.name] = p

    print(f"Copying {len(selected_images)} images to {OUT_DIR}...")
    missing = []
    for fname in selected_images:
        src = file_index.get(fname)
        if src:
            shutil.copy2(src, OUT_DIR / fname)
        else:
            missing.append(fname)

    if missing:
        print(f"Warning: {len(missing)} images not found in download: {missing[:5]}...")
        # Remove missing from lookup
        for finding in lookup:
            lookup[finding] = [f for f in lookup[finding] if f not in missing]

    with open(LOOKUP_PATH, "w") as f:
        json.dump(lookup, f, indent=2)

    print(f"Done. Lookup written to {LOOKUP_PATH}")
    print(f"Images written to {OUT_DIR}")


if __name__ == "__main__":
    main()
