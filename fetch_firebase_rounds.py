#!/usr/bin/env python3
"""
Fetch Firebase rounds data for inspection.
Requires: pip install firebase-admin
"""
import json
import sys

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("Installing firebase-admin...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'firebase-admin', '-q'])
    import firebase_admin
    from firebase_admin import credentials, firestore

# Firebase config from app.js
PROJECT_ID = "ironanalytics-cda1d"

# Try to use the Application Default Credentials or service account
try:
    app = firebase_admin.get_app()
except ValueError:
    try:
        # Try initializing with project ID only (may work if gcloud is configured)
        app = firebase_admin.initialize_app(options={'projectId': PROJECT_ID})
    except Exception as e:
        print(f"Init error: {e}")
        sys.exit(1)

db = firestore.client()

# Get the user's rounds - we need to know the user ID
# The user collection structure is: users/{uid}/rounds/{roundId}
print("Fetching users...")
users_ref = db.collection('users')
users = list(users_ref.get())
print(f"Found {len(users)} users")

for user_doc in users:
    uid = user_doc.id
    print(f"\nUser: {uid}")
    
    rounds_ref = db.collection('users').document(uid).collection('rounds')
    all_rounds = list(rounds_ref.stream())
    print(f"  Total rounds in Firebase: {len(all_rounds)}")
    
    # Convert to list of dicts
    rounds_data = []
    for doc in all_rounds:
        data = doc.to_dict()
        data['id'] = doc.id
        rounds_data.append(data)
    
    # Sort by date then id to determine roundNum
    def parse_date(r):
        d = r.get('date', '')
        if '/' in d:
            parts = d.split('/')
            if len(parts) == 3:
                m, day, y = parts
                if len(y) == 2: y = '20' + y
                return f"{y}-{m.zfill(2)}-{day.zfill(2)}"
        return d
    
    rounds_data.sort(key=lambda r: (parse_date(r), r.get('id', '')))
    
    # Assign roundNum
    for i, r in enumerate(rounds_data):
        r['_computed_roundNum'] = i + 1
    
    # Find rounds 263, 264, 266 by roundNum field
    print("\n  Searching for rounds 263, 264, 266 by roundNum field...")
    target_rounds = [r for r in rounds_data if r.get('roundNum') in [263, 264, 266]]
    print(f"  Found {len(target_rounds)} rounds by roundNum field")
    for r in target_rounds:
        safe_r = {k: v for k, v in r.items() if k != 'holeData'}
        print(f"\n  Round #{r.get('roundNum')} (id={r.get('id')}):")
        print(json.dumps(safe_r, indent=4, default=str))
    
    # Also find by computed roundNum
    print("\n  Searching for rounds 263, 264, 266 by computed sequential order...")
    computed_target = [r for r in rounds_data if r.get('_computed_roundNum') in [263, 264, 266]]
    for r in computed_target:
        if r.get('roundNum') not in [263, 264, 266]:  # avoid duplicates
            safe_r = {k: v for k, v in r.items() if k not in ['holeData', '_computed_roundNum']}
            print(f"\n  Computed Round #{r.get('_computed_roundNum')} (roundNum={r.get('roundNum')}, id={r.get('id')}):")
            print(json.dumps(safe_r, indent=4, default=str))
    
    # Check which rounds have zeroed/empty data
    print("\n  Checking for rounds with zero/empty scores...")
    zero_rounds = [r for r in rounds_data if r.get('score', -1) == 0 or r.get('score') is None]
    if zero_rounds:
        print(f"  Found {len(zero_rounds)} rounds with zero/null scores:")
        for r in zero_rounds[:10]:  # Show first 10
            print(f"    roundNum={r.get('roundNum')}, date={r.get('date')}, course={r.get('course')}, score={r.get('score')}, id={r.get('id')}")
    else:
        print("  No rounds found with zero scores")
    
    # Save full data for further analysis
    with open('/tmp/all_rounds.json', 'w') as f:
        json.dump(rounds_data, f, indent=2, default=str)
    print(f"\n  Full rounds data saved to /tmp/all_rounds.json")
