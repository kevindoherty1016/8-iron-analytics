import re

file_path = '/Users/kevindoherty/.gemini/antigravity/scratch/8-iron-analytics/app.js'

with open(file_path, 'r') as f:
    orig = f.read()

start_marker = "    handleCSVUpload(file) {\n        if (!file) return;"
next_func = "    handleAddRound(form) {"

# find the exact indices
s_idx = orig.find(start_marker)
e_idx = orig.find(next_func, s_idx)

if s_idx != -1 and e_idx != -1:
    # also strip the "    handleCSVUpload(file) {" part down to the next func
    start_cut = orig.rfind("    handleCSVUpload(file) {", 0, s_idx + len(start_marker))
    
    new_content = orig[:start_cut] + "    handleCSVUpload(file) {\n        // Deprecated manual parser. Now handled by papa parse.\n        return;\n    }\n\n" + orig[e_idx:]
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("SUCCESS")
else:
    print(f"FAIL: s_idx={s_idx}, e_idx={e_idx}")

