with open('8IronAnalytics - Sheet8.csv', 'r') as f:
    text = f.read()

lines = text.split('\n')
headerIndex = 0
for i in range(min(10, len(lines))):
    if 'date' in lines[i].lower() and 'course' in lines[i].lower():
        headerIndex = i
        break

cleanText = '\n'.join(lines[headerIndex:])
print("=== Top of cleanText ===")
print(cleanText[:300])
print("\n=== Header Index Found At ===")
print(headerIndex)
