import csv
import json
import os
import glob
from datetime import datetime

data = []

# Process all CSVs just in case
for fname in glob.glob('*.csv'):
    try:
        with open(fname, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                date = ''
                course = ''
                rnum = 0
                c = -1
                s = -1
                for k in row.keys():
                    if not k: continue
                    clean_k = k.lower().strip()
                    if clean_k == 'date': date = row[k]
                    if clean_k == 'course': course = row[k]
                    if clean_k in ['round #', 'round number', 'round']: 
                        try: rnum = int(row[k])
                        except: pass
                    if clean_k in ['up/down chances', 'scrambling chances']:
                        try: c = int(row[k])
                        except: pass
                    if clean_k in ['up/down successes', 'scrambling successes']:
                        try: s = int(row[k])
                        except: pass
                
                if date and course and c >= 0 and s >= 0:
                    data.append({
                        "date": date,
                        "course": course,
                        "c": c,
                        "s": s,
                        "rnum": rnum
                    })
    except Exception as e:
        print(f"Error reading {fname}: {e}")

# write to json
with open('csv_data.json', 'w') as f:
    json.dump(data, f)
print(f"Extracted {len(data)} rows with scrambling data.")
