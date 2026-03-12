const fs = require('fs');

// simulate papaparse
function parseCSV(content) {
    const lines = content.split('\n');
    const headers = lines[1].split(',').map(h => h.trim()); // Row 2 is headers
    const row = lines[2].split(',').map(v => v.trim()); // Row 3 is data

    const obj = {};
    headers.forEach((h, i) => {
        obj[h] = row[i];
    });
    return obj;
}

const content = fs.readFileSync('Golf Life of KPD - Sheet7.csv', 'utf8');
const row = parseCSV(content);
console.log("Parsed row:", row);

const getRowVal = (r, keys) => {
    const foundKey = Object.keys(r).find(k => {
        const cleanK = k.replace(/^[\uFEFF\s]+|[\s]+$/g, '').toLowerCase();
        return keys.includes(cleanK);
    });
    return foundKey ? r[foundKey] : undefined;
};

const chances = parseInt(getRowVal(row, ['up/down chances', 'scrambling chances'])) || 0;
const successes = parseInt(getRowVal(row, ['up/down successes', 'scrambling successes'])) || 0;

console.log("Chances:", chances);
console.log("Successes:", successes);
