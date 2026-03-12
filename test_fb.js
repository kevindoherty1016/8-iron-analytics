const fs = require('fs');

try {
  const data = fs.readFileSync('firebaseExport.json', 'utf8');
} catch(e) {}
