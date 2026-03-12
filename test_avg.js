const fs = require('fs');

const rawData = localStorage.getItem ? localStorage.getItem('8iron_rounds') : fs.readFileSync('csv_data.json', 'utf8'); // fake fallback for node

const rounds = JSON.parse(fs.readFileSync('/Users/kevindoherty/Library/Application Support/Google/Chrome/Default/Local Storage/leveldb/LOG', 'utf8').match(/\[\{"id".+?}]/)?.[0] || '[]'); // This won't work in node trivially without the leveldb parser, let's just write a python script to grab the scores from the CSVs instead since we know the CSVs match his DB close enough for an average check.
