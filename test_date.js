const rDate = "2024-05-12";
function getFormatted(rawInput) {
    let formattedDate = rawInput;
    try {
        const d = new Date(rawInput);
        if (!isNaN(d)) formattedDate = d.toISOString().split('T')[0];
    } catch (e) { }
    return formattedDate;
}

console.log("Input: 2024-05-12 -> formatted:", getFormatted("2024-05-12"));
console.log("Input: 05/12/2024 -> formatted:", getFormatted("05/12/2024"));
console.log("Input: 5/12/24 -> formatted:", getFormatted("5/12/24"));

// Let's test substring fuzzy match
function isMatch(c1, c2) {
    const clean1 = (c1 || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = (c2 || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean1 || !clean2) return false;
    return clean1.includes(clean2) || clean2.includes(clean1);
}
console.log("Pebble Beach vs Pebble Beach Golf Links:", isMatch("Pebble Beach", "Pebble Beach Golf Links"));

