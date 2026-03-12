import csv
with open("Golf Life of KPD - Sheet7.csv") as f:
    r = csv.reader(f)
    next(r)
    headers = next(r)
    row = next(r)

d = dict(zip([h.strip() for h in headers], [v.strip() for v in row]))
print(d)

def get_row_val(r_dict, keys):
    for k in r_dict.keys():
        clean_k = k.lower().strip()
        if clean_k in keys:
            return r_dict[k]
    return None

c = get_row_val(d, ['up/down chances', 'scrambling chances'])
s = get_row_val(d, ['up/down successes', 'scrambling successes'])
print(f"Chances: {c}, Successes: {s}")
