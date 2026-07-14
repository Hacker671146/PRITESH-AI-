const axios = require('axios');
const chalk = require('chalk');
const figlet = require('figlet');
const readline = require('readline');

// =====================================================================
// CONFIGURATION & STATE
// =====================================================================
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?ts=";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://hgnice.biz",
    "Origin": "https://hgnice.biz"
};

const STATE = {
    totalWins: 0,
    totalLosses: 0,
    history: [], // Stores last 20 results
    lastPeriod: null,
    pendingPrediction: null,
    skipNext: false
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// =====================================================================
// LOGIC ENGINE (4 COMBINED LOGICS)
// =====================================================================
class HybridEngine {
    // LOGIC 1: Vase Analytics (Harmonic Waves)
    static vaseScore(n1, n2, n3) {
        const sum = n1 + n2 + n3;
        const d1 = Math.abs(n1 - n2);
        const d2 = Math.abs(n2 - n3);
        const w1 = Math.sin(n1 * 0.5) * 0.15;
        const w2 = Math.cos(n2 * 0.3) * 0.15;
        let score = (sum / 27.0) * 0.4 + ((d1 + d2) / 18.0) * 0.3 + (w1 + w2);
        return Math.max(0.01, Math.min(0.99, score));
    }

    // LOGIC 2: Advanced Flow (Adaptive Matrix)
    static flowScore(n1, n2, n3) {
        const avg = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) / 9.0;
        const expP = Math.exp(avg);
        const expN = Math.exp(-avg);
        const factor = (expP - expN) / (expP + expN);
        let prob = (factor * 0.52) + (0.5 * 0.48);
        return Math.max(0.01, Math.min(0.99, prob));
    }

    // LOGIC 3: Trend Momentum Analysis
    static trendScore(n1, n2, n3) {
        // If numbers are trending up or down consistently
        if (n1 > n2 && n2 > n3) return 0.75; // Strong Big Trend
        if (n1 < n2 && n2 < n3) return 0.25; // Strong Small Trend
        return 0.5; // Neutral
    }

    // LOGIC 4: Zero/Five Skip Filter & Final Combination
    static predict(n1, n2, n3) {
        // SKIP LOGIC: If latest result is 0 or 5, mark as unsafe
        if (n1 === 0 || n1 === 5) {
            return { skip: true, reason: "0/5 SAFETY SKIP" };
        }

        const p1 = this.vaseScore(n1, n2, n3);
        const p2 = this.flowScore(n1, n2, n3);
        const p3 = this.trendScore(n1, n2, n3);
        
        // Weighted Combination: 40% Vase, 30% Flow, 30% Trend
        let combined = (p1 * 0.40) + (p2 * 0.30) + (p3 * 0.30);
        combined = Math.max(0.05, Math.min(0.95, combined));

        let type, digit, confidence;

        if (combined >= 0.50) {
            type = "BIG";
            confidence = combined;
            // Map to 5-9
            digit = Math.floor(5 + (confidence - 0.5) * 2.0 * 4.9);
            digit = Math.min(9, Math.max(5, digit));
        } else {
            type = "SMALL";
            confidence = 1.0 - combined;
            // Map to 0-4
            digit = Math.floor((1.0 - confidence) * 2.0 * 5.0);
            digit = Math.min(4, Math.max(0, digit));
        }

        return {
            skip: false,
            prediction: type,
            digit: digit,
            confidence: (confidence * 100).toFixed(1)
        };
    }
}

// =====================================================================
// CORE FUNCTIONS
// =====================================================================
async function fetchLive() {
    try {
        const ts = Date.now();
        const res = await axios.get(`${API_URL}${ts}`, { headers: HEADERS, timeout: 8000 });
        if (res.data?.data?.list?.length >= 3) {
            return res.data.data.list.map(i => ({
                period: String(i.issueNumber),
                number: parseInt(i.number)
            }));
        }
    } catch (e) { /* Silent retry */ }
    return null;
}

function updateStats(actualNum, pred) {
    const actualType = actualNum >= 5 ? "BIG" : "SMALL";
    let status = "LOSS ❌";
    
    if (actualNum === pred.digit) status = "JACKPOT 🎯";
    else if (actualType === pred.prediction) status = "WIN ✅";

    const isWin = status.includes("WIN") || status.includes("JACKPOT");
    if (isWin) STATE.totalWins++;
    else STATE.totalLosses++;

    const total = STATE.totalWins + STATE.totalLosses;
    const accuracy = total > 0 ? ((STATE.totalWins / total) * 100).toFixed(1) : "0.0";

    STATE.history.unshift({
        period: pred.targetPeriod,
        predicted: `${pred.prediction}(${pred.digit})`,
        actual: actualNum,
        status: status
    });
    if (STATE.history.length > 20) STATE.history.pop();

    return { status, accuracy };
}

function displayDashboard() {
    console.clear();
    console.log(chalk.yellow(figlet.textSync('SDD X PRITESH', { horizontalLayout: 'full' })));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log(chalk.greenBright.bold(`🏆 TOTAL WINS: ${STATE.totalWins}`) + chalk.redBright.bold(`   💀 TOTAL LOSS: ${STATE.totalLosses}`));
    
    const total = STATE.totalWins + STATE.totalLosses;
    const acc = total > 0 ? ((STATE.totalWins / total) * 100).toFixed(1) : "0.0";
    console.log(chalk.magentaBright.bold(`📊 ACCURACY: ${acc}%`) + chalk.white(`   📜 HISTORY TRACKED: ${STATE.history.length}`));
    console.log(chalk.cyan('═'.repeat(60)));

    // Show last 5 history entries
    console.log(chalk.white.bold("\n📜 RECENT HISTORY:"));
    STATE.history.slice(0, 5).forEach(h => {
        const color = h.status.includes("WIN") || h.status.includes("JACKPOT") ? chalk.green : chalk.red;
        console.log(`  ${chalk.gray(h.period.slice(-4))} | Pred: ${chalk.yellow(h.predicted)} | Res: ${chalk.white(h.actual)} | ${color(h.status)}`);
    });
    console.log(chalk.cyan('\n' + '═'.repeat(60)));
}

// =====================================================================
// MAIN LOOP
// =====================================================================
async function runCycle() {
    const data = await fetchLive();
    if (!data || data.length < 3) return;

    const current = data[0];
    
    // Check if new period arrived
    if (current.period !== STATE.lastPeriod) {
        STATE.lastPeriod = current.period;

        // Verify previous prediction
        if (STATE.pendingPrediction) {
            const { status, accuracy } = updateStats(current.number, STATE.pendingPrediction);
            displayDashboard();
            console.log(chalk.white.bold(`\n🔍 LAST RESULT VERIFICATION: ${status} (Actual: ${current.number}) | Accuracy: ${accuracy}%`));
        }

        // Generate new prediction
        const [n1, n2, n3] = [data[0].number, data[1].number, data[2].number];
        const result = HybridEngine.predict(n1, n2, n3);
        const nextPeriod = String(BigInt(current.period) + 1n);

        if (result.skip) {
            console.log(chalk.yellow.bold(`\n⚠️  PERIOD ${nextPeriod.slice(-4)} SKIPPED: ${result.reason}`));
            STATE.pendingPrediction = null;
        } else {
            STATE.pendingPrediction = { ...result, targetPeriod: nextPeriod };
            const pColor = result.prediction === "BIG" ? chalk.red.bold : chalk.green.bold;
            console.log(chalk.cyan(`\n🎯 NEXT TARGET: ${nextPeriod.slice(-4)} ➜ `) + pColor(`${result.prediction} (${result.digit})`) + chalk.yellow(` [${result.confidence}%]`));
        }
    }
}

// Interactive Trigger
rl.on('line', async (input) => {
    if (input.trim().toLowerCase() === 'y') {
        console.log(chalk.cyan("\n⚡ Manual Trigger Activated... Fetching Live Data..."));
        await runCycle();
    }
});

// Auto-start
(async () => {
    displayDashboard();
    console.log(chalk.white.bold("\n✅ SYSTEM ACTIVE. Press 'y' + Enter for prediction or wait for auto-sync."));
    
    // Auto-poll every 5 seconds
    setInterval(runCycle, 5000);
})();
