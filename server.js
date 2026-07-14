const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API Configurations
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?ts=";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://hgnice.biz",
    "Origin": "https://hgnice.biz"
};

// Global Tracking State
let lastPeriod = null;
let activePrediction = null; // { prediction, digit, confidence, targetPeriod }
let stats = {
    totalWins: 0,
    totalLosses: 0,
    jackpots: 0,
    history: [] // { period, prediction, actualNum, resultType }
};

// Helper to determine BIG/SMALL
function getBigSmall(num) {
    return num >= 5 ? "BIG" : "SMALL";
}

// =====================================================================
// HYBRID HYBRID ENGINE (PORTED FROM PYTHON)
// =====================================================================
class UltimateHybridPredictor {
    static predict(n1, n2, n3) {
        // Logic 1: Vase Analytics Engine
        const recentSum = n1 + n2 + n3;
        const deltaPrimary = Math.abs(n1 - n2);
        const deltaSecondary = Math.abs(n2 - n3);
        
        const wave1 = Math.sin(n1 * 0.5) * 0.15;
        const wave2 = Math.cos(n2 * 0.3) * 0.15;
        
        let probVase = (recentSum / 27.0) * 0.4 + ((deltaPrimary + deltaSecondary) / 18.0) * 0.3 + (wave1 + wave2);
        probVase = Math.max(0.01, Math.min(0.99, probVase));

        // Logic 2: Advanced Logic Flow
        const weightedAvg = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) / 9.0;
        const factor = (Math.exp(weightedAvg) - Math.exp(-weightedAvg)) / (Math.exp(weightedAvg) + Math.exp(-weightedAvg));
        
        let probFlow = (factor * 0.52) + (0.5 * 0.48);
        probFlow = Math.max(0.01, Math.min(0.99, probFlow));

        // Hybrid Weighted Combination (60% / 40%)
        let combinedProb = (probVase * 0.60) + (probFlow * 0.40);
        combinedProb = Math.max(0.05, Math.min(0.95, combinedProb));

        let prediction, confidence, digit;

        if (combinedProb >= 0.50) {
            prediction = "BIG";
            confidence = combinedProb;
            digit = Math.floor(5 + (confidence - 0.5) * 2.0 * 4.9);
            digit = Math.min(9, Math.max(5, digit));
        } else {
            prediction = "SMALL";
            confidence = 1.0 - combinedProb;
            digit = Math.floor((1.0 - confidence) * 2.0 * 5.0);
            digit = Math.min(4, Math.max(0, digit));
        }

        return {
            prediction,
            digit,
            confidence: confidence * 100
        };
    }
}

// =====================================================================
// API FETCH & CORE EVALUATION ROUTINE
// =====================================================================
async function processLiveTracking() {
    try {
        const ts = Date.now();
        const response = await axios.get(`${API_URL}${ts}`, { headers: HEADERS, timeout: 8000 });
        
        if (response.status === 200 && response.data && response.data.data && response.data.data.list) {
            const list = response.data.data.list;
            if (list.length < 3) return;

            const latest = list[0];
            const currentPeriod = String(latest.issueNumber);
            const currentNumber = parseInt(latest.number);

            // Jab naya period aayega tabhi calculation trigger hogi
            if (currentPeriod !== lastPeriod) {
                
                // 1. Pichle target prediction ka evaluation (WIN/LOSS tracking)
                if (activePrediction && activePrediction.targetPeriod === currentPeriod) {
                    const actualType = getBigSmall(currentNumber);
                    let resultType = "LOSS";

                    if (currentNumber === activePrediction.digit) {
                        resultType = "JACKPOT";
                        stats.jackpots++;
                        stats.totalWins++;
                    } else if (actualType === activePrediction.prediction) {
                        resultType = "WIN";
                        stats.totalWins++;
                    } else {
                        resultType = "LOSS";
                        stats.totalLosses++;
                    }

                    // Store history limit (Upto last 50 games for accuracy)
                    stats.history.unshift({
                        period: currentPeriod,
                        prediction: `${activePrediction.prediction} (${activePrediction.digit})`,
                        actualNum: currentNumber,
                        resultType: resultType
                    });

                    if (stats.history.length > 50) stats.history.pop();
                }

                // Update state to current active period
                lastPeriod = currentPeriod;

                // 2. Agle period ke liye prediction generate karna
                const n1 = parseInt(list[0].number);
                const n2 = parseInt(list[1].number);
                const n3 = parseInt(list[2].number);

                const nextPeriod = String(BigInt(currentPeriod) + 1n);
                const predictionResult = UltimateHybridPredictor.predict(n1, n2, n3);

                // Set new pending prediction
                activePrediction = {
                    targetPeriod: nextPeriod,
                    prediction: predictionResult.prediction,
                    digit: predictionResult.digit,
                    confidence: predictionResult.confidence
                };
            }
        }
    } catch (error) {
        console.error("Live Fetch Error:", error.message);
    }
}

// Run engine background tracker every 3 seconds
setInterval(processLiveTracking, 3000);

// API endpoints for Frontend
app.get('/api/data', (req, res) => {
    const totalGames = stats.totalWins + stats.totalLosses;
    const accuracy = totalGames > 0 ? ((stats.totalWins / totalGames) * 100).toFixed(2) : "0.00";

    res.json({
        activePrediction,
        stats: {
            totalWins: stats.totalWins,
            totalLosses: stats.totalLosses,
            jackpots: stats.jackpots,
            totalGames,
            accuracy: `${accuracy}%`
        },
        history: stats.history
    });
});

// Minimalist Dashboard Serve
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});
