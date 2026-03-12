import csv
import sys
import glob

def calculate(file):
    print(f"\nProcessing {file}...")
    try:
        with open(file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            total_chances = 0
            total_successes = 0
            
            for row in reader:
                # Based on app.js parsing logic
                keys = list(row.keys())
                
                def get_val(possible_names):
                    for k in keys:
                        if k and k.strip().lower() in possible_names:
                            return row[k]
                    return None
                    
                chances = get_val(['up/down chances', 'scrambling chances'])
                successes = get_val(['up/down successes', 'scrambling successes'])
                
                # Check detailed format first
                scr_raw = get_val(['scrambling'])
                
                # If it's detailed format, sum them up
                if scr_raw is not None:
                    gir = get_val(['gir'])
                    is_gir = False
                    if gir:
                         is_gir = str(gir).strip().upper() in ['TRUE', '1', 'YES', 'Y']
                    score = get_val(['score'])
                    score_val = 0
                    if score:
                        try:
                            score_val = int(score)
                        except:
                            pass
                    
                    if not is_gir and score_val > 0:
                        total_chances += 1
                        is_scr = str(scr_raw).strip().upper() in ['TRUE', '1', 'YES', 'Y']
                        if is_scr:
                            total_successes += 1
                elif chances is not None and successes is not None:
                    try:
                        c = int(chances)
                        s = int(successes)
                        if c > 0:
                            total_chances += c
                            total_successes += s
                    except:
                        pass
                        
            print(f"  Successes: {total_successes}")
            print(f"  Chances:   {total_chances}")
            if total_chances > 0:
                print(f"  Rate:      {total_successes/total_chances*100:.1f}%")
            
    except Exception as e:
        print(f"Error: {e}")

files = glob.glob('*.csv')
for f in files:
    calculate(f)
