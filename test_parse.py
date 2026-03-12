import csv

def parse_csv(filepath):
    with open(filepath, 'r') as f:
        reader = csv.reader(f)
        headers = []
        rows = []
        for i, row in enumerate(reader):
            if i == 0:
                headers = [h.strip() for h in row]
            else:
                if len(row) > 0:
                    row_dict = {}
                    for j, val in enumerate(row):
                        if j < len(headers):
                            row_dict[headers[j]] = val.strip()
                    rows.append(row_dict)
        return headers, rows

headers, rows = parse_csv('8IronAnalytics - Sheet8.csv')
print("Headers:", headers)
print("First Row:", rows[0] if rows else "No rows")

roundsMap = {}
for row in rows:
    def get_val(possible_keys):
        for k, v in row.items():
            if k.strip().lower() in possible_keys:
                return v
        return None

    date = get_val(['date'])
    course = get_val(['course'])
    if not date or not course or date.lower() == 'date':
        continue
    
    key = f"{date}_{course}"
    if key not in roundsMap:
        roundsMap[key] = {
            'date': date,
            'course': course,
            'holeData': []
        }
    
    par = int(get_val(['par']) or 0)
    score = int(get_val(['score', 'score on hole actual']) or 0)
    
    roundsMap[key]['holeData'].append({
        'par': par,
        'score': score
    })

print(f"Found {len(roundsMap)} rounds")
