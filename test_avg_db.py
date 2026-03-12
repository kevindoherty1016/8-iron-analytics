import plyvel
import json
import os

db_path = os.path.expanduser("~/Library/Application Support/Google/Chrome/Default/Local Storage/leveldb")

rounds = []
try:
    db = plyvel.DB(db_path, create_if_missing=False)
    for key, value in db:
        if b'8iron_rounds' in key:
            # values in leveldb for localstorage have a leading byte, usually \x01
            try:
                v = value[1:].decode('utf-8')
                j = json.loads(v)
                if isinstance(j, list) and len(j) > 0 and 'id' in j[0]:
                    rounds = j
                    break
            except Exception as e:
                pass
    db.close()
    
    if rounds:
        total_holes = 0
        total_score = 0
        total_score_to_par = 0
        r9 = 0
        r18 = 0
        for r in rounds:
            h = int(r.get('holes', 18))
            s = int(r.get('score', 0))
            stp = int(r.get('scoreToPar', 0))
            if h > 0 and s > 0:
                total_holes += h
                total_score += s
                total_score_to_par += stp
                if h == 9: r9 += 1
                if h == 18: r18 += 1
                
        print(f"Total Rounds: {len(rounds)}")
        print(f"Total Holes: {total_holes}")
        print(f"Total Score: {total_score}")
        print(f"9-Hole Rounds: {r9}")
        print(f"18-Hole Rounds: {r18}")
        
        avg18 = (total_score / total_holes) * 18
        avgstp18 = (total_score_to_par / total_holes) * 18
        print(f"\nDashboard Logic (Normalized to 18): {avg18:.2f}")
        print(f"Dashboard Score To Par Logic (Normalized to 18): {avgstp18:.2f}")
        
        # What if we just average raw score per round?
        avg_raw = total_score / len([r for r in rounds if int(r.get('score',0)) > 0])
        print(f"\nRaw Average Score per Round (Ignoring holes context): {avg_raw:.2f}")
        
        # Display latest rounds to see what might be pulling it down
        print("\nLast 5 Rounds:")
        for r in sorted(rounds, key=lambda x: x.get('date', ''), reverse=True)[:5]:
             print(f"{r.get('date')} | {r.get('course')} | Holes: {r.get('holes')} | Score: {r.get('score')}")
    else:
        print("No rounds found.")
except Exception as e:
    print(f"Error reading DB: {e}")
