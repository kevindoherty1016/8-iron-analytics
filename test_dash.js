const fs = require('fs');
// Load the DOM simulation
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });

// Load app JS into the window
const js = fs.readFileSync('app.js', 'utf8');

dom.window.eval(js);

setTimeout(() => {
    // Generate mock rounds including 9-holes and 18-holes
    dom.window.app.rounds = [
        { id: "1", date: "2024-05-01", course: "Test Course", holes: 18, score: 80, putts: 30 },
        { id: "2", date: "2024-05-02", course: "Test Course 2", holes: 9, score: 40, originalHoles: 9, putts: 15 }
    ];
    
    try {
        dom.window.app.renderDashboard();
        console.log("Success stringifying DOM values");
        console.log("Avg Score tile:", dom.window.document.querySelectorAll('.stat-value')[0].textContent);
        console.log("Empty State Display:", dom.window.document.getElementById('dashboard-empty').style.display);
    } catch(e) {
        console.error("FAIL:", e);
    }
}, 500);
