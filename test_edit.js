const fs = require('fs');

const js = fs.readFileSync('app.js', 'utf8');

// We need a mock DOM environment to test if it's throwing an error
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'));
global.document = dom.window.document;
global.window = dom.window;

// Evaluate app.js in this context
eval(js);

// Now try to run editRound on a mock round
const app = new App();
app.rounds = [{
    id: '123',
    date: '3/15/2025',
    course: 'Furnace Brook',
    coursePar: 70,
    holes: 18,
    score: 75,
    putts: 32,
    gir: 9,
    eagles: 0,
    birdies: 0,
    pars: 13,
    bogeys: 5,
    doubleBogeys: 0,
    tripleBogeys: 0,
    otherScore: 0,
    upDownChances: 9,
    upDownSuccesses: 4,
    threePutts: 0,
    lostBalls: 0,
    penaltyStrokes: 0
}];

try {
    app.editRound('123');
    console.log('Success! Form date value is:', document.getElementById('date').value);
} catch (e) {
    console.error(e);
}
