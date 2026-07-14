const axios = require('axios');

// =====================================================================
// FIXED MULTI-ENDPOINT API CONFIGURATION
// =====================================================================
const API_ENDPOINTS = [
    "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?ts=",
    "https://api.wingo-game.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?ts=",
    "https://lottery-api.hgnice.biz/WinGo/WinGo_1M/GetHistoryIssuePage.json?ts="
];

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://hgnice.biz/",
    "Origin": "https://hgnice.biz",
    "Connection": "keep-alive"
};

const state = {
    totalWins: 0,
    totalLosses: 0,
    history: [],
    lastPeriod: null,
    pendingPrediction: null
};

// =====================================================================
// 4-LOGIC HYBRID ENGINE (Vase + Flow + Trend + Skip)
// =====================================================================
class HybridEngine {
    static vaseScore(n1, n2, n3) {
        const sum = n1 + n2 + n3;
        const d1 = Math.abs(n1 - n2);
        const d2 = Math.abs(n2 - n3);
        const w1 = Math.sin(n1 * 0.5) * 0.15;
        const w2 = Math.cos(n2 * 0.3) * 0.15;
        let score = (sum / 27.0) * 0.4 + ((d1 + d2) / 18.0) * 0.3 + (w1 + w2);
        return Math.max(0.01, Math.min(0.99, score));
    }

    static flowScore(n1, n2, n3) {
        const avg = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) / 9.0;
        const expP = Math.exp(avg);
        const expN = Math.exp(-avg);
        const factor = (expP - expN) / (expP + expN);
        let prob = (factor * 0.52) + (0.5 * 0.48);
        return Math.max(0.01, Math.min(0.99, prob));
    }

    static trendScore(n1, n2, n3) {
        if (n1 > n2 && n2 > n3) return 0.75;
        if (n1 < n2 && n2 < n3) return 0.25;
        return 0.5;
    }

    static predict(n1, n2, n3) {
        // LOGIC 4: SKIP IF 0 OR 5
        if (n1 === 0 || n1 === 5) {
            return { skip: true, reason: "0/5 SAFETY SKIP TRIGGERED" };
        }

        const p1 = this.vaseScore(n1, n2, n3);
        const p2 = this.flowScore(n1, n2, n3);
        const p3 = this.trendScore(n1, n2, n3);
        
        // Combined Weight: 40% Vase, 30% Flow, 30% Trend
        let combined = (p1 * 0.40) + (p2 * 0.30) + (p3 * 0.30);
        combined = Math.max(0.05, Math.min(0.95, combined));

        let type, digit, confidence;

        if (combined >= 0.50) {
            type = "BIG";
            confidence = combined;
            digit = Math.floor(5 + (confidence - 0.5) * 2.0 * 4.9);
            digit = Math.min(9, Math.max(5, digit));
        } else {
            type = "SMALL";
            confidence = 1.0 - combined;
            digit = Math.floor((1.0 - confidence) * 2.0 * 5.0);
            digit = Math.min(4, Math.max(0, digit));
        }

        return {
            skip: false,
            prediction: type,
            digit: digit,
            confidence: parseFloat((confidence * 100).toFixed(1))
        };
    }
}

// =====================================================================
// CORE API FETCHER WITH FALLBACK & ERROR FIX
// =====================================================================
async function fetchLive() {
    for (const baseUrl of API_ENDPOINTS) {
        try {
            const res = await axios.get(`${baseUrl}${Date.now()}`, { 
                headers: HEADERS, 
                timeout: 10000,
                validateStatus: () => true 
            });
            
            if (res.status === 200 && res.data?.data?.list?.length >= 3) {
                return res.data.data.list.map(i => ({
                    period: String(i.issueNumber),
                    number: parseInt(i.number)
                }));
            }
        } catch (e) {
            // Try next endpoint silently
        }
    }
    return null;
}

function updateStats(actualNum, pred) {
    const actualType = actualNum >= 5 ? "BIG" : "SMALL";
    let status = "LOSS";
    
    if (actualNum === pred.digit) status = "JACKPOT";
    else if (actualType === pred.prediction) status = "WIN";

    const isWin = status !== "LOSS";
    if (isWin) state.totalWins++;
    else state.totalLosses++;

    const total = state.totalWins + state.totalLosses;
    const accuracy = total > 0 ? parseFloat(((state.totalWins / total) * 100).toFixed(1)) : 0.0;

    state.history.unshift({
        period: pred.targetPeriod,
        predicted: `${pred.prediction}(${pred.digit})`,
        actual: actualNum,
        status: status
    });
    if (state.history.length > 20) state.history.pop();

    return { status, accuracy };
}

// =====================================================================
// MAIN EXECUTION LOOP
// =====================================================================
async function runCycle() {
    const data = await fetchLive();
    
    if (!data || data.length < 3) {
        console.log(JSON.stringify({ event: "ERROR", message: "ALL_API_ENDPOINTS_FAILED_OR_NOT_FOUND" }));
        return;
    }

    const current = data[0];
    
    if (current.period !== state.lastPeriod) {
        state.lastPeriod = current.period;

        if (state.pendingPrediction) {
            const { status, accuracy } = updateStats(current.number, state.pendingPrediction);
            console.log(JSON.stringify({
                event: "RESULT_VERIFICATION",
                period: state.pendingPrediction.targetPeriod,
                actual: current.number,
                status: status,
                totalWins: state.totalWins,
                totalLosses: state.totalLosses,
                accuracy: `${accuracy}%`,
                recentHistory: state.history.slice(0, 5)
            }));
        }

        const [n1, n2, n3] = [data[0].number, data[1].number, data[2].number];
        const result = HybridEngine.predict(n1, n2, n3);
        const nextPeriod = String(BigInt(current.period) + 1n);

        if (result.skip) {
            console.log(JSON.stringify({ event: "SKIP", nextPeriod: nextPeriod, reason: result.reason }));
            state.pendingPrediction = null;
        } else {
            state.pendingPrediction = { ...result, targetPeriod: nextPeriod };
            console.log(JSON.stringify({ 
                event: "NEW_PREDICTION", 
                nextPeriod: nextPeriod, 
                prediction: result.prediction, 
                digit: result.digit, 
                confidence: `${result.confidence}%` 
            }));
        }
    }
}

console.log(JSON.stringify({ event: "SYSTEM_INIT", status: "SDD_X_PRITESH_HYBRID_ENGINE_READY" }));
setInterval(runCycle, 5000);
runCycle();
