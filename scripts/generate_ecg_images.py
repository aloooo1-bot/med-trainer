"""
One-time setup script: downloads a curated subset of PTB-XL ECG records from
PhysioNet, renders them as PNG images, and saves them under public/ecg/.

Run once before starting the app. Do NOT run automatically.

Setup:
  pip install wfdb pandas numpy matplotlib requests

Usage:
  cd <project-root>
  python scripts/generate_ecg_images.py

Output:
  public/ecg/{category}/{ecg_id}.png   <- ECG images (gitignored)
  public/ecg/index.json                <- category → filename list
  public/ecg/metadata.json             <- path → cardiologist report string
"""

import ast
import json
import os
import time
import urllib.request

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np
import pandas as pd
import wfdb

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PHYSIONET_BASE = 'https://physionet.org/files/ptb-xl/1.0.3'
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'ptbxl_data')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'ecg')
IMAGES_PER_CATEGORY = 10
DPI = 150

LEAD_NAMES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']

# SCP code → category mapping
CATEGORY_CODES = {
    'normal':          {'include': {'NORM'}, 'min_likelihood': 80, 'exclude_all_others': True},
    'afib':            {'include': {'AFIB'}, 'min_likelihood': 80},
    'stemi':           {'include': {'AMI','IMI','ALMI','ILMI','IPLMI','IPMI','LMI','PMI'}, 'min_likelihood': 80},
    'nstemi_ischemia': {'include': {'STTC','NST_','ISC_','ISCA','ISCI'}, 'min_likelihood': 80,
                        'exclude': {'AMI','IMI','ALMI','ILMI','IPLMI','IPMI','LMI','PMI'}},
    'lvh':             {'include': {'LVH'}, 'min_likelihood': 80},
    'lbbb':            {'include': {'LBBB'}, 'min_likelihood': 100},
    'rbbb':            {'include': {'RBBB'}, 'min_likelihood': 100},
    'afib_flutter':    {'include': {'AFLT'}, 'min_likelihood': 80},
    'heart_block':     {'include': {'AVB','1AVB','2AVB','3AVB'}, 'min_likelihood': 80},
    'bradycardia':     {'include': {'SBRAD','PACE'}, 'min_likelihood': 80},
    'tachycardia':     {'include': {'STACH','SVTAC','PSVT'}, 'min_likelihood': 80},
    'wpw':             {'include': {'WPW'}, 'min_likelihood': 80},
}

# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------

def download_file(url, dest):
    if os.path.exists(dest):
        return
    print(f'  Downloading {url}')
    urllib.request.urlretrieve(url, dest)


def fetch_metadata():
    os.makedirs(DATA_DIR, exist_ok=True)
    for fname in ('ptbxl_database.csv', 'scp_statements.csv'):
        download_file(f'{PHYSIONET_BASE}/{fname}', os.path.join(DATA_DIR, fname))

# ---------------------------------------------------------------------------
# Record selection
# ---------------------------------------------------------------------------

def parse_scp_codes(s):
    try:
        return ast.literal_eval(s)
    except Exception:
        return {}


def select_records(db):
    selected = {}
    for category, rules in CATEGORY_CODES.items():
        include_codes = rules['include']
        min_lk = rules.get('min_likelihood', 80)
        exclude_codes = rules.get('exclude', set())
        require_exclusive = rules.get('exclude_all_others', False)

        matches = []
        for _, row in db.iterrows():
            codes = parse_scp_codes(row['scp_codes'])
            # Must have at least one include code at sufficient likelihood
            has_include = any(
                c in codes and codes[c] >= min_lk
                for c in include_codes
            )
            if not has_include:
                continue
            # Must not have any exclude codes
            has_exclude = any(c in codes for c in exclude_codes)
            if has_exclude:
                continue
            # For normal: must have NO other diagnostic codes above 0
            if require_exclusive:
                other = {c for c in codes if c not in include_codes and codes[c] > 0}
                if other:
                    continue
            matches.append(row)

        # Take up to IMAGES_PER_CATEGORY, preferring high-quality (validated) records
        if matches:
            df = pd.DataFrame(matches)
            if 'validated_by_human' in df.columns:
                df = df.sort_values('validated_by_human', ascending=False)
            selected[category] = df.head(IMAGES_PER_CATEGORY)
            print(f'  {category}: {len(selected[category])} records selected')
        else:
            print(f'  {category}: no records found')
            selected[category] = pd.DataFrame()

    return selected

# ---------------------------------------------------------------------------
# ECG rendering (matplotlib 12-lead layout)
# ---------------------------------------------------------------------------

def render_ecg(signal, fs, category, record_id, report_text=''):
    """Render a 12-lead ECG as a PNG using matplotlib ECG-paper layout."""
    fig = plt.figure(figsize=(11, 8.5), facecolor='#fafaf5')
    fig.patch.set_facecolor('#fafaf5')

    gs = gridspec.GridSpec(3, 4, figure=fig, hspace=0.45, wspace=0.3,
                           left=0.06, right=0.97, top=0.90, bottom=0.08)

    lead_order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]  # I II III aVR aVL aVF V1-V6
    duration_sec = 2.5
    samples = int(duration_sec * fs)

    for idx, lead_idx in enumerate(lead_order):
        row, col = divmod(idx, 4)
        ax = fig.add_subplot(gs[row, col])

        lead_signal = signal[:samples, lead_idx] if signal.shape[0] >= samples else signal[:, lead_idx]
        t = np.linspace(0, len(lead_signal) / fs, len(lead_signal))

        # ECG paper background
        ax.set_facecolor('#fafaf5')
        ax.set_axisbelow(True)

        # Major grid (5mm squares at 25mm/s, 0.5mV/div)
        ax.yaxis.set_major_locator(plt.MultipleLocator(0.5))
        ax.xaxis.set_major_locator(plt.MultipleLocator(0.2))
        ax.grid(which='major', color='#e8a0a0', linewidth=0.6, alpha=0.8)

        # Minor grid (1mm squares)
        ax.yaxis.set_minor_locator(plt.MultipleLocator(0.1))
        ax.xaxis.set_minor_locator(plt.MultipleLocator(0.04))
        ax.grid(which='minor', color='#f0c0c0', linewidth=0.3, alpha=0.5)

        ax.plot(t, lead_signal, color='black', linewidth=0.75, solid_capstyle='round')

        ax.set_xlim(0, duration_sec)
        sig_min, sig_max = lead_signal.min(), lead_signal.max()
        margin = max(0.5, (sig_max - sig_min) * 0.2)
        ax.set_ylim(sig_min - margin, sig_max + margin)

        ax.set_title(LEAD_NAMES[lead_idx], fontsize=7, fontweight='bold',
                     loc='left', pad=2, color='#333')
        ax.tick_params(labelbottom=False, labelleft=False, length=0)
        for spine in ax.spines.values():
            spine.set_edgecolor('#ccc')
            spine.set_linewidth(0.5)

    fig.suptitle(f'12-Lead ECG  ·  25 mm/s  ·  10 mm/mV',
                 fontsize=9, color='#444', y=0.96)

    # Attribution
    fig.text(0.01, 0.01,
             'ECG from PTB-XL dataset / PhysioNet (Wagner et al., 2020). Educational use.',
             fontsize=5.5, color='#999', ha='left', va='bottom')

    # Save
    out_path = os.path.join(OUT_DIR, category, f'{record_id}.png')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    fig.savefig(out_path, dpi=DPI, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close(fig)
    return out_path

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print('=== PTB-XL ECG Image Generator ===')
    print(f'Output directory: {os.path.abspath(OUT_DIR)}')
    print()

    print('Step 1: Downloading metadata...')
    fetch_metadata()

    print('Step 2: Loading database...')
    db_path = os.path.join(DATA_DIR, 'ptbxl_database.csv')
    db = pd.read_csv(db_path, index_col='ecg_id')
    print(f'  Loaded {len(db)} records.')

    print('Step 3: Selecting records by category...')
    selected = select_records(db)

    print('Step 4: Downloading waveforms and rendering ECG images...')
    index = {}
    metadata = {}

    for category, records_df in selected.items():
        if records_df.empty:
            index[category] = []
            continue

        index[category] = []
        os.makedirs(os.path.join(OUT_DIR, category), exist_ok=True)

        for ecg_id, row in records_df.iterrows():
            filename_lr = row['filename_lr']
            record_id = f'{int(ecg_id):05d}'

            # Download waveform via wfdb
            record_url = f'{PHYSIONET_BASE}/{filename_lr}'
            try:
                print(f'  [{category}] {record_id}: {filename_lr}')
                record = wfdb.rdrecord(
                    os.path.join(DATA_DIR, filename_lr),
                    pn_dir=None,
                )
                # If local file not present, stream from PhysioNet
            except Exception:
                try:
                    # Stream directly from PhysioNet
                    record = wfdb.rdrecord(
                        filename_lr.replace('.hea', ''),
                        pn_dir='ptb-xl/1.0.3',
                    )
                except Exception as e:
                    print(f'    SKIP: could not download {filename_lr}: {e}')
                    continue

            signal = record.p_signal
            fs = record.fs

            # Render
            out_path = render_ecg(signal, fs, category, record_id)
            png_name = os.path.basename(out_path)
            index[category].append(png_name)

            # Store cardiologist report
            report = str(row.get('report', ''))
            metadata[f'{category}/{png_name}'] = report.strip()

            time.sleep(0.3)  # Be polite to PhysioNet

    print('Step 5: Writing index.json and metadata.json...')
    with open(os.path.join(OUT_DIR, 'index.json'), 'w') as f:
        json.dump(index, f, indent=2)
    with open(os.path.join(OUT_DIR, 'metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    total = sum(len(v) for v in index.values())
    print(f'\nDone. {total} ECG images generated in {os.path.abspath(OUT_DIR)}')
    print('Commit index.json and metadata.json. The PNG images are gitignored.')


if __name__ == '__main__':
    main()
