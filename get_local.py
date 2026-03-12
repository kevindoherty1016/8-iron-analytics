import re
import json
import os
import glob

def run():
    # Try different Chrome profile paths just in case
    paths = [
        "~/Library/Application Support/Google/Chrome/Default/Local Storage/leveldb/*.ldb",
        "~/Library/Application Support/Google/Chrome/Default/Local Storage/leveldb/*.log",
        "~/Library/Application Support/Google/Chrome/Profile 1/Local Storage/leveldb/*.ldb",
        "~/Library/Application Support/Google/Chrome/Profile 1/Local Storage/leveldb/*.log"
    ]
    
    files = []
    for p in paths:
        files.extend(glob.glob(os.path.expanduser(p)))
    
    all_found_rounds = []
    
    for f in files:
        try:
            with open(f, 'rb') as file:
                content = file.read()
                # Use a more general regex to find JSON arrays that look like rounds
                matches = re.findall(b'\[\{"id":"[A-Za-z0-9_-]+","date":"[0-9-]+"[\s\S]*?\}\]', content)
                for m in matches:
                    try:
                        j = json.loads(m.decode('utf-8'))
                        if isinstance(j, list) and len(j) > 0 and 'id' in j[0]:
                            # Keep only the longest list of rounds found (likely the most recent/complete)
                            if len(j) > len(all_found_rounds):
                                all_found_rounds = j
                    except:
                        pass
        except:
            pass
                
    if all_found_rounds:
        print(json.dumps(all_found_rounds, indent=2))
    else:
        print("[]")

run()
