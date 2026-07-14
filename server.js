const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================================
// API & HEADERS
// =====================================================================
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://hgnice.biz",
    "Origin": "https://hgnice.biz"
};

// =====================================================================
// PREDICTION ENGINE
// =====================================================================
class VaseAnalyticsEngine {
    extractVaseScore(n1, n2, n3) {
        const recent_sum = n1 + n2 + n3;
        const delta_primary = Math.abs(n1 - n2);
        const delta_secondary = Math.abs(n2 - n3);

        const wave_1 = Math.sin(n1 * 0.5) * 0.15;
        const wave_2 = Math.cos(n2 * 0.3) * 0.15;

        let score = (recent_sum / 27.0) * 0.4 +
                    ((delta_primary + delta_secondary) / 18.0) * 0.3 +
                    (wave_1 + wave_2);
        return Math.max(0.01, Math.min(0.99, score));
    }
}

class AdvancedLogicFlow {
    constructor() {
        this.modifier_a = 0.52;
        this.modifier_b = 0.48;
    }

    processFlow(n1, n2, n3) {
        const weighted_avg = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) / 9.0;
        const exp_val = Math.exp(weighted_avg);
        const factor = (exp_val - Math.exp(-weighted_avg)) / (exp_val + Math.exp(-weighted_avg));

        let prob = (factor * this.modifier_a) + (0.5 * this.modifier_b);
        return Math.max(0.01, Math.min(0.99, prob));
    }
}

class UltimateHybridPredictor {
    constructor() {
        this.vaseEngine = new VaseAnalyticsEngine();
        this.logicFlow = new AdvancedLogicFlow();
    }

    predict(n1, n2, n3) {
        const prob_vase = this.vaseEngine.extractVaseScore(n1, n2, n3);
        const prob_flow = this.logicFlow.processFlow(n1, n2, n3);

        let combined_prob = prob_vase * 0.60 + prob_flow * 0.40;
        combined_prob = Math.max(0.05, Math.min(0.95, combined_prob));

        let prediction, digit, confidence;

        if (combined_prob >= 0.50) {
            prediction = "BIG";
            confidence = combined_prob;
            digit = Math.min(9, Math.max(5, Math.floor(5 + (confidence - 0.5) * 2.0 * 4.9)));
        } else {
            prediction = "SMALL";
            confidence = 1.0 - combined_prob;
            digit = Math.min(4, Math.max(0, Math.floor((1.0 - confidence) * 2.0 * 5.0)));
        }

        return {
            prediction,
            digit,
            confidence: confidence * 100
        };
    }
}

// =====================================================================
// UTILITY
// =====================================================================
function getBigSmall(num) {
    return num >= 5 ? "BIG" : "SMALL";
}

// =====================================================================
// STATE
// =====================================================================
let history = [];
let stats = {
    totalPredictions: 0,
    totalWins: 0,
    totalLosses: 0,
    accuracy: 0
};

let lastPeriod = null;
let activeResult = null;
let predictedPeriod = null;

const predictor = new UltimateHybridPredictor();

// =====================================================================
// FETCH LIVE DATA
// =====================================================================
async function fetchLiveData() {
    try {
        const ts = Date.now();
        const res = await axios.get(API_URL, {
            params: { ts },
            headers: HEADERS,
            timeout: 8000
        });

        const data = res.data;
        if (data && data.data && data.data.list && data.data.list.length >= 3) {
            return data.data.list.map(item => ({
                period: String(item.issueNumber),
                number: parseInt(item.number, 10)
            }));
        }
        return [];
    } catch (err) {
        return [];
    }
}

// =====================================================================
// BACKGROUND LOOP
// =====================================================================
async function processLoop() {
    try {
        const data = await fetchLiveData();
        if (!data || data.length < 3) return;

        const latest = data[0];
        const currentPeriod = latest.period;
        const currentNumber = latest.number;

        if (currentPeriod !== lastPeriod) {
            lastPeriod = currentPeriod;

            if (activeResult && predictedPeriod) {
                const predictedType = activeResult.prediction;
                const predictedDigit = activeResult.digit;
                const actualType = getBigSmall(currentNumber);

                const win = (predictedType === actualType) || (predictedDigit === currentNumber);

                const record = {
                    period: predictedPeriod,
                    predicted: {
                        type: predictedType,
                        digit: predictedDigit,
                        confidence: activeResult.confidence
                    },
                    actual: {
                        number: currentNumber,
                        type: actualType
                    },
                    win: win,
                    timestamp: new Date().toISOString()
                };
                history.push(record);

                stats.totalPredictions++;
                if (win) stats.totalWins++;
                else stats.totalLosses++;
                stats.accuracy = stats.totalPredictions > 0 ? (stats.totalWins / stats.totalPredictions) * 100 : 0;

                console.log(`[${new Date().toISOString()}] Period ${predictedPeriod} → Predicted ${predictedType}(${predictedDigit}) | Actual ${actualType}(${currentNumber}) → ${win ? 'WIN ✅' : 'LOSS ❌'}`);
                console.log(`📊 Stats: Total=${stats.totalPredictions}, Wins=${stats.totalWins}, Losses=${stats.totalLosses}, Accuracy=${stats.accuracy.toFixed(1)}%`);
            }

            const n1 = data[0].number;
            const n2 = data[1].number;
            const n3 = data[2].number;

            const result = predictor.predict(n1, n2, n3);
            const nextPeriod = String(parseInt(currentPeriod, 10) + 1);

            predictedPeriod = nextPeriod;
            activeResult = {
                period: nextPeriod,
                prediction: result.prediction,
                digit: result.digit,
                confidence: result.confidence
            };

            console.log(`[${new Date().toISOString()}] 🔮 New prediction for ${nextPeriod}: ${result.prediction}(${result.digit}) @ ${result.confidence.toFixed(1)}%`);
        }
    } catch (err) {
        console.error('Loop error:', err.message);
    }
}

setInterval(processLoop, 2000);

// =====================================================================
// EXPRESS ROUTES – ALWAYS JSON
// =====================================================================
app.use(cors());
app.use(express.json());

// Root – returns full data or error as JSON
app.get('/', (req, res) => {
    try {
        const currentPrediction = activeResult ? {
            period: activeResult.period,
            prediction: activeResult.prediction,
            digit: activeResult.digit,
            confidence: activeResult.confidence
        } : null;

        res.json({
            currentPrediction,
            stats,
            history: history,
            historyCount: history.length
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

// History only
app.get('/history', (req, res) => {
    try {
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Reset
app.post('/reset', (req, res) => {
    try {
        history = [];
        stats = {
            totalPredictions: 0,
            totalWins: 0,
            totalLosses: 0,
            accuracy: 0
        };
        res.json({ message: 'History reset successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Reset failed' });
    }
});

// Health check – always JSON
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler – JSON
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// =====================================================================
// START SERVER
// =====================================================================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`👉 GET / for full tracking (JSON)`);
});
