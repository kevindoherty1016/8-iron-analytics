import csv
import glob

total_holes = 0
total_score = 0
r9 = 0
r18 = 0

for fname in glob.glob('*.csv'):
    try:
        with open(fname, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                h = 0
                s = 0
                for k in row.keys():
                    if not k: continue
                    clean_k = k.lower().strip()
                    if clean_k == 'holes':
                        try: h = int(row[k])
                        except: pass
                    if clean_k in ['score', 'score on hole actual']:
                        try: s = int(row[k])
                        except: pass
                
                if h > 0 and s > 0:
                    total_holes += h
                    total_score += s
                    if h == 9: r9 += 1
                    if h == 18: r18 += 1
    except Exception as e:
        pass

print(f"Total Holes: {total_holes}")
print(f"Total Score: {total_score}")
print(f"9-Hole Rounds: {r9}")
print(f"18-Hole Rounds: {r18}")
if total_holes > 0:
    print(f"Average Normalized to 18: {(total_score / total_holes) * 18:.2f}")
