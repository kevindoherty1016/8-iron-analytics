const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:8000');

    // Login
    await page.waitForSelector('#login-form');
    await page.click('#login-submit-btn');

    // Wait for dashboard to compute
    await page.waitForTimeout(2000);

    // Evaluate in context
    const data = await page.evaluate(() => {
        if (!window.app || !window.app.rounds) return { error: "App not found" };

        const rounds = window.app.rounds;

        // Match dashboard logic exactly line by line
        const count = rounds.length;
        const totalHolesPlayed = rounds.reduce((acc, r) => acc + window.app.getRoundOriginalHoles(r), 0);
        const totalScoreSum = rounds.reduce((acc, r) => acc + (Number(r.score) || 0), 0);

        const avgScore = totalHolesPlayed > 0 ? (totalScoreSum / totalHolesPlayed) * 18 : 0;

        // Also grab raw info
        let r9 = 0;
        let r18 = 0;
        let rawSum = 0;
        let rawCount = 0;

        rounds.forEach(r => {
            const h = window.app.getRoundOriginalHoles(r);
            const s = Number(r.score) || 0;
            if (h === 9) r9++;
            if (h === 18) r18++;
            if (s > 0) {
                rawSum += s;
                rawCount++;
            }
        });

        return {
            totalRounds: count,
            totalHolesPlayed,
            totalScoreSum,
            avgScoreDashboardLogic: avgScore,
            nineHoleRounds: r9,
            eighteenHoleRounds: r18,
            rawAveragePerRound: rawCount > 0 ? rawSum / rawCount : 0,
            roundsMap: rounds.slice(0, 10).map(r => (`${r.date} - ${r.course}: Score ${r.score} (Holes ${window.app.getRoundOriginalHoles(r)})`))
        };
    });

    console.log(JSON.stringify(data, null, 2));
    await browser.close();
})();
