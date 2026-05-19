#!/usr/bin/env python3
"""
Parse the Gates Application Catalogue PDF and extract fitment data
for timing belts, water pumps, drive belts, and tensioners into JSON.

Usage:
  python3 server/scripts/parse-gates-pdf.py <path-to-pdf> [--output=server/data/gates-parts.json]
"""

import sys
import json
import re
import argparse
import pdfplumber

# ── Article group → normalised part_type ──────────────────────────────────────
ARTICLE_GROUP_MAP = {
    # Timing belt
    'powergrip™ kit + waterpump':          'timing_belt_kit_wp',
    'powergrip™ kit +waterpump':           'timing_belt_kit_wp',
    'powergrip™ kit+ waterpump':           'timing_belt_kit_wp',
    'powergrip™ kit':                       'timing_belt_kit',
    'powergrip™ belt':                      'timing_belt',
    'powergrip™ tensioner pulley':         'timing_belt_tensioner',
    'powergrip™ guide pulley':             'timing_belt_guide',
    'timing chain kit':                    'timing_chain_kit',
    'roadmax™ value line':                 'timing_belt_kit_budget',

    # Drive belt
    'micro-v® kit':                        'drive_belt_kit',
    'micro-v® belt':                       'drive_belt',
    'micro-v® stretch fit™ belt':          'drive_belt_stretch',
    'fleetrunner™ v-belt':                 'v_belt',
    'v belt':                              'v_belt',

    # DriveAlign / tensioner / idler
    'drivealign™ tensioner unit':          'drive_belt_tensioner',
    'drivealign™ idler pulley':            'drive_belt_idler',
    'drivealign™ overrunning alternator pulley': 'overrunning_alternator_pulley',
    'drivealign™ torsional vibration damper':    'torsional_vibration_damper',

    # Water pump
    'water pump':                          'water_pump',
}

def normalise_article_group(raw):
    if not raw:
        return None
    key = ' '.join(raw.lower().split())
    return ARTICLE_GROUP_MAP.get(key)

def parse_engine_codes(raw):
    """Split 'SYDA,\nAODA,\nAODB' → ['SYDA','AODA','AODB']"""
    if not raw:
        return []
    codes = re.split(r'[\n,\s]+', raw.strip())
    return [c.strip().upper() for c in codes if c.strip() and len(c.strip()) >= 2]

def parse_year_month(raw):
    """Parse '03/04' → {'month': 3, 'year': 2004}  or 'on' → None"""
    if not raw or raw.strip().lower() in ('on', ''):
        return None
    m = re.match(r'(\d{2})/(\d{2})', raw.strip())
    if m:
        month = int(m.group(1))
        yr = int(m.group(2))
        year = 2000 + yr if yr <= 50 else 1900 + yr
        return {'month': month, 'year': year}
    return None

def extract_make_from_header(cell):
    """'FORD - FOCUS C-MAX' → 'Ford'  (just the make prefix)"""
    if not cell:
        return None
    text = cell.replace('F ORD', 'FORD').strip()
    m = re.match(r'^(FORD|VAUXHALL|VW|BMW|MERCEDES|AUDI|TOYOTA|HONDA)\s*-\s*(.+?)(?:\s+\(continued\))?$', text, re.I)
    if m:
        return m.group(1).title(), m.group(2).strip().title()
    return None, None

def clean(text):
    if not text:
        return ''
    return ' '.join(text.split())

def parse_pdf(pdf_path):
    records = []
    current_make = 'Ford'
    current_model_raw = None
    current_engine_codes = []
    current_stroke = None
    current_kw = None
    current_year_from = None
    current_year_to = None

    skipped_groups = set()

    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if not tables:
                continue
            table = tables[0]

            for row in table:
                if not row or len(row) < 10:
                    continue

                (model_raw, eng_raw, stroke_raw, kw_raw,
                 from_raw, to_raw, article_raw, powered_raw,
                 comments_raw, article_no_raw) = row[:10]

                # ── Section header row (make/model section label) ────────────
                if model_raw and all(row[i] is None or row[i] == '' for i in range(1, 10)):
                    header_text = model_raw.replace('F ORD', 'FORD')
                    m = re.search(r'FORD\s*-\s*(.+?)(?:\s*\(continued\))?$', header_text, re.I)
                    if m:
                        current_make = 'Ford'
                    continue

                # ── Column header row ────────────────────────────────────────
                if model_raw and 'model' in model_raw.lower():
                    continue

                # ── Carry forward non-empty vehicle identity cells ───────────
                if model_raw and model_raw.strip():
                    raw = clean(model_raw)
                    # Strip "(continued)" suffix
                    raw = re.sub(r'\s*\(continued\)\s*$', '', raw, flags=re.I).strip()
                    current_model_raw = raw

                if eng_raw and eng_raw.strip():
                    current_engine_codes = parse_engine_codes(eng_raw)

                if stroke_raw and stroke_raw.strip():
                    current_stroke = clean(stroke_raw)

                if kw_raw and kw_raw.strip():
                    current_kw = clean(kw_raw)

                if from_raw and from_raw.strip():
                    current_year_from = parse_year_month(from_raw)

                if to_raw and to_raw.strip():
                    current_year_to = parse_year_month(to_raw)

                # ── Part row ─────────────────────────────────────────────────
                article_group = clean(article_raw or '')
                # Strip internal spaces from part numbers (PDF line-break artifacts)
                article_no = re.sub(r'\s+', '', (article_no_raw or '').strip())

                if not article_group or not article_no:
                    continue

                part_type = normalise_article_group(article_group)
                if not part_type:
                    skipped_groups.add(article_group)
                    continue

                if not current_model_raw or not current_engine_codes:
                    continue

                # Parse model: extract body type and variant info
                model_name = current_model_raw
                # e.g. "DM2 MPV 2.0" → model_code="DM2", body="MPV 2.0"
                # We'll keep model_name as-is for flexibility

                records.append({
                    'make':          current_make,
                    'model':         model_name,
                    'engine_codes':  current_engine_codes,
                    'stroke':        current_stroke,
                    'kw':            int(current_kw) if current_kw and current_kw.isdigit() else None,
                    'year_from':     current_year_from,
                    'year_to':       current_year_to,
                    'part_type':     part_type,
                    'article_group': article_group,
                    'article_no':    article_no,
                    'brand':         'Gates',
                    'powered_units': clean(powered_raw or ''),
                    'comments':      clean(comments_raw or ''),
                })

    return records, skipped_groups


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('pdf', nargs='?', help='Path to a single Gates PDF, or omit to process server/data/pdfs/*.pdf')
    parser.add_argument('--output', default='server/data/gates-parts.json')
    args = parser.parse_args()

    if args.pdf:
        pdfs = [args.pdf]
    else:
        import glob
        pdfs = sorted(glob.glob('server/data/pdfs/*.pdf'))
        if not pdfs:
            print('No PDFs found in server/data/pdfs/ — pass a path or drop PDFs there.')
            sys.exit(1)
        print(f'Found {len(pdfs)} PDF(s) in server/data/pdfs/')

    all_records = []
    all_skipped = set()
    for pdf_path in pdfs:
        print(f'Parsing {pdf_path} ...')
        records, skipped = parse_pdf(pdf_path)
        all_records.extend(records)
        all_skipped.update(skipped)
        print(f'  → {len(records)} records')

    records, skipped = all_records, all_skipped

    print(f'\nTotal: {len(records)} fitment records across {len(pdfs)} PDF(s)')

    # Stats
    from collections import Counter
    by_type = Counter(r['part_type'] for r in records)
    print('\nBy part type:')
    for t, n in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f'  {t:<40} {n:>4}')

    if skipped:
        print(f'\nSkipped article groups (not in target categories):')
        for g in sorted(skipped):
            print(f'  {g}')

    with open(args.output, 'w') as f:
        json.dump(records, f, indent=2)
    print(f'\nWrote {args.output}')


if __name__ == '__main__':
    main()
