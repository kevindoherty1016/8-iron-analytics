const fs = require('fs');

// We don't have papaparse in node, so we will use a naive split, but the header logic is what we care about mostly
const text = fs.readFileSync('8IronAnalytics - Sheet8.csv', 'utf8');

const lines = text.split('\n');
let headerIndex = 0;
for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].toLowerCase().includes('date') && lines[i].toLowerCase().includes('course')) {
        headerIndex = i;
        break;
    }
}
const cleanText = lines.slice(headerIndex).join('\n');
console.log("Top of cleanText (first 300 chars):\n", cleanText.substring(0, 300));
console.log("\nHeader Index Found At:", headerIndex);
