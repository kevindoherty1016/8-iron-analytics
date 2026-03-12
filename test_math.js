const rounds = [
    { score: 40, holes: 9, originalHoles: 9, gir: 3, fir: 4, putts: 16 },
    { score: 82, holes: 18, gir: 7, fir: 8, putts: 32 },
    { score: 84, holes: 18, gir: 6, fir: 6, putts: 34 }
];

const getScoringHoles = (r) => {
    if (r.originalHoles) return Number(r.originalHoles);
    return Number(r.holes) || 18;
};

const scoringRounds = rounds;
const mathScoringCount = scoringRounds.length;

const totalScoreSum = scoringRounds.reduce((acc, r) => {
    let s = Number(r.score) || 0;
    if (getScoringHoles(r) === 9) s *= 2;
    return acc + s;
}, 0);

const totalPuttsSum = scoringRounds.reduce((acc, r) => {
    let p = Number(r.putts) || 0;
    if (getScoringHoles(r) === 9) p *= 2;
    return acc + p;
}, 0);

const totalGIR = scoringRounds.reduce((acc, r) => {
    let g = Number(r.gir) || 0;
    if (getScoringHoles(r) === 9) g *= 2;
    return acc + g;
}, 0);

console.log("Rounds:", mathScoringCount);
console.log("Scaled Total Score:", totalScoreSum);
console.log("Avg Score Output:", totalScoreSum / mathScoringCount);

console.log("Scaled Putts:", totalPuttsSum);
console.log("Avg Putts Output:", totalPuttsSum / mathScoringCount);

console.log("Scaled GIR:", totalGIR);
console.log("Avg GIR% Output:", (totalGIR / (mathScoringCount * 18)) * 100);
