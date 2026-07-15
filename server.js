const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================== API & FALLBACK ========================
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

// ======================== PREDICTION ENGINE ========================
function predictNumber(n1, n2, n3) {
    const recent_sum = n1 + n2 + n3;
    const delta_primary = Math.abs(n1 - n2);
    const delta_secondary = Math.abs(n2 - n3);
    const wave_1 = Math.sin(n1 * 0.5) * 0.15;
    const wave_2 = Math.cos(n2 * 0.3) * 0.15;
    let vase_score = (recent_sum / 27.0) * 0.4 + ((delta_primary + delta_secondary) / 18.0) * 0.3 + (wave_1 + wave_2);
    vase_score = Math.max(0.01, Math.min(0.99, vase_score));

    const weighted_avg = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) / 9.0;
    const exp_val = Math.exp(weighted_avg);
    const factor = (exp_val - Math.exp(-weighted_avg)) / (exp_val + Math.exp(-weighted_avg));
    let flow_score = (factor * 0.52) + (0.5 * 0.48);
    flow_score = Math.max(0.01, Math.min(0.99, flow_score));

    let combined = vase_score * 0.60 + flow_score * 0.40;
    combined = Math.max(0.05, Math.min(0.95, combined));

    let prediction, digit, confidence;
    if (combined >= 0.50) {
        prediction = "BIG";
        confidence = combined;
        digit = Math.min(9, Math.max(5, Math.floor(5 + (confidence - 0.5) * 2.0 * 4.9)));
    } else {
        prediction = "SMALL";
        confidence = 1.0 - combined;
        digit = Math.min(4, Math.max(0, Math.floor((1.0 - confidence) * 2.0 * 5.0)));
    }
    return { prediction, digit, confidence: Math.round(confidence * 1000) / 10 };
}

function getBigSmall(num) { return num >= 5 ? "BIG" : "SMALL"; }

// ======================== FETCH DATA WITH FALLBACK ========================
async function fetchData() {
    try {
        console.log('📡 Fetching live data...');
        const response = await axios.get(API_URL, {
            params: { ts: Date.now() },
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://hgnice.biz/'
            }
        });

        if (response.status === 200 && response.data?.data?.list?.length >= 3) {
            console.log('✅ Live data fetched successfully');
            return response.data.data.list.map(item => ({
                period: String(item.issueNumber),
                number: parseInt(item.number, 10)
            }));
        }
        throw new Error('Invalid live data');
    } catch (error) {
        console.log('⚠️ Using mock data (live API unavailable)');
        // Generate mock data
        const mockData = [];
        const basePeriod = Math.floor(Date.now() / 1000) % 1000000;
        for (let i = 0; i < 5; i++) {
            mockData.push({
                period: String(basePeriod + i),
                number: Math.floor(Math.random() * 10)
            });
        }
        return mockData;
    }
}

// ======================== STATE ========================
let history = [];
let stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
let lastPeriod = null;
let pendingPrediction = null;
let lastThreeNumbers = [];
let currentActual = null;

// ======================== PROCESS LOOP ========================
async function processLoop() {
    const data = await fetchData();
    if (!data || data.length < 3) return;

    const latest = data[0];
    const currentPeriod = latest.period;
    const currentNumber = latest.number;
    const currentType = getBigSmall(currentNumber);

    currentActual = { period: currentPeriod, number: currentNumber, type: currentType };
    lastThreeNumbers = data.slice(0, 3).map(d => d.number);

    if (currentPeriod !== lastPeriod) {
        lastPeriod = currentPeriod;

        // Check previous prediction
        if (pendingPrediction && pendingPrediction.period === currentPeriod) {
            const win = (pendingPrediction.prediction === currentType) || (pendingPrediction.digit === currentNumber);
            
            history.push({
                period: currentPeriod,
                predicted: pendingPrediction,
                actual: { number: currentNumber, type: currentType },
                win: win,
                result: win ? '✅' : '❌',
                timestamp: new Date().toISOString()
            });

            stats.totalPredictions++;
            win ? stats.totalWins++ : stats.totalLosses++;
            stats.accuracy = Math.round((stats.totalWins / stats.totalPredictions) * 1000) / 10;

            console.log(`📊 ${currentPeriod} → Pred: ${pendingPrediction.prediction}(${pendingPrediction.digit}) | Actual: ${currentType}(${currentNumber}) ${win ? '✅ WIN' : '❌ LOSS'}`);
        }

        // New prediction
        if (lastThreeNumbers.length === 3) {
            const result = predictNumber(lastThreeNumbers[0], lastThreeNumbers[1], lastThreeNumbers[2]);
            const nextPeriod = String(parseInt(currentPeriod, 10) + 1);
            pendingPrediction = { period: nextPeriod, prediction: result.prediction, digit: result.digit, confidence: result.confidence };
            console.log(`🔮 New Prediction for ${nextPeriod}: ${result.prediction}(${result.digit}) @ ${result.confidence}%`);
        }
    }
}

setInterval(processLoop, 2000);
setTimeout(processLoop, 1000);

// ======================== ROUTES ========================
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'active',
        currentPeriod: currentActual,
        nextPrediction: pendingPrediction ? {
            ...pendingPrediction,
            confidence: pendingPrediction.confidence + '%',
            basedOn: lastThreeNumbers
        } : null,
        stats: { ...stats, accuracy: stats.accuracy + '%' },
        recentHistory: history.slice(-10).map(h => ({
            period: h.period,
            predicted: `${h.predicted.prediction}(${h.predicted.digit})`,
            actual: `${h.actual.type}(${h.actual.number})`,
            result: h.result,
            win: h.win
        })),
        historyCount: history.length,
        lastUpdated: new Date().toISOString()
    });
});

app.get('/history', (req, res) => res.json({ history, count: history.length, stats }));
app.get('/stats', (req, res) => res.json({ ...stats, historyCount: history.length, nextPrediction: pendingPrediction }));
app.post('/reset', (req, res) => {
    history = [];
    stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
    res.json({ message: '✅ Reset successful' });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
