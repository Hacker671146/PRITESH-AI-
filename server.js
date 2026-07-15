const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================== API CONFIG ========================
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

// ======================== PREDICTION ENGINE ========================
function predictNumber(n1, n2, n3) {
    // Vase Analytics
    const recent_sum = n1 + n2 + n3;
    const delta_primary = Math.abs(n1 - n2);
    const delta_secondary = Math.abs(n2 - n3);
    const wave_1 = Math.sin(n1 * 0.5) * 0.15;
    const wave_2 = Math.cos(n2 * 0.3) * 0.15;
    let vase_score = (recent_sum / 27.0) * 0.4 + ((delta_primary + delta_secondary) / 18.0) * 0.3 + (wave_1 + wave_2);
    vase_score = Math.max(0.01, Math.min(0.99, vase_score));

    // Advanced Logic Flow
    const weighted_avg = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) / 9.0;
    const exp_val = Math.exp(weighted_avg);
    const factor = (exp_val - Math.exp(-weighted_avg)) / (exp_val + Math.exp(-weighted_avg));
    let flow_score = (factor * 0.52) + (0.5 * 0.48);
    flow_score = Math.max(0.01, Math.min(0.99, flow_score));

    // Combine (60% Vase + 40% Flow)
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

    return { 
        prediction: prediction,  // "BIG" or "SMALL"
        digit: digit, 
        confidence: Math.round(confidence * 1000) / 10 
    };
}

function getBigSmall(num) {
    return num >= 5 ? "BIG" : "SMALL";
}

// ======================== STATE ========================
let history = [];
let stats = {
    totalPredictions: 0,
    totalWins: 0,
    totalLosses: 0,
    accuracy: 0
};

let lastPeriod = null;
let pendingPrediction = null;  // Prediction for next period
let isDataAvailable = false;
let lastThreeNumbers = [];
let currentActualNumber = null;
let currentActualType = null;

// ======================== FETCH DATA ========================
async function fetchData() {
    try {
        const response = await axios.get(API_URL, {
            params: { ts: Date.now() },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });

        if (response.status === 200 && response.data) {
            let dataList = null;
            
            if (response.data.data && response.data.data.list) {
                dataList = response.data.data.list;
            } else if (response.data.list) {
                dataList = response.data.list;
            } else if (Array.isArray(response.data)) {
                dataList = response.data;
            }

            if (dataList && dataList.length >= 3) {
                const formatted = dataList.map(item => ({
                    period: String(item.issueNumber || item.period || ''),
                    number: parseInt(item.number || item.value || 0, 10)
                })).filter(item => item.period && !isNaN(item.number));

                if (formatted.length >= 3) {
                    isDataAvailable = true;
                    return formatted;
                }
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

// ======================== PROCESS LOOP ========================
async function processLoop() {
    try {
        const data = await fetchData();
        if (!data) {
            console.log('⏳ Waiting for data...');
            return;
        }

        // Get latest data
        const latest = data[0];
        const currentPeriod = latest.period;
        const currentNumber = latest.number;
        const currentType = getBigSmall(currentNumber);

        // Store current actual
        currentActualNumber = currentNumber;
        currentActualType = currentType;

        // Store last 3 numbers for prediction
        lastThreeNumbers = data.slice(0, 3).map(d => d.number);

        // New period detected
        if (currentPeriod !== lastPeriod) {
            console.log(`\n📡 New Period: ${currentPeriod}`);
            console.log(`🎯 Actual Result: ${currentType} (${currentNumber})`);
            
            lastPeriod = currentPeriod;

            // Check if we had a pending prediction for this period
            if (pendingPrediction && pendingPrediction.period === currentPeriod) {
                const predictedType = pendingPrediction.prediction;
                const predictedDigit = pendingPrediction.digit;
                const win = (predictedType === currentType) || (predictedDigit === currentNumber);

                // Save to history
                history.push({
                    period: currentPeriod,
                    predicted: {
                        type: predictedType,
                        digit: predictedDigit,
                        confidence: pendingPrediction.confidence
                    },
                    actual: {
                        number: currentNumber,
                        type: currentType
                    },
                    win: win,
                    result: win ? '✅' : '❌',
                    timestamp: new Date().toISOString()
                });

                // Update stats
                stats.totalPredictions++;
                if (win) stats.totalWins++;
                else stats.totalLosses++;
                stats.accuracy = stats.totalPredictions > 0 
                    ? Math.round((stats.totalWins / stats.totalPredictions) * 1000) / 10
                    : 0;

                console.log(`${'═'.repeat(60)}`);
                console.log(`📊 PERIOD: ${currentPeriod}`);
                console.log(`🔮 PREDICTED: ${predictedType} (${predictedDigit}) @ ${pendingPrediction.confidence}%`);
                console.log(`🎯 ACTUAL: ${currentType} (${currentNumber})`);
                console.log(`   ${win ? '✅ WIN' : '❌ LOSS'}`);
                console.log(`📈 STATS: ${stats.totalWins}W / ${stats.totalLosses}L (${stats.accuracy}%)`);
                console.log(`${'═'.repeat(60)}`);
            }

            // Generate prediction for NEXT period using last 3 numbers
            if (lastThreeNumbers.length === 3) {
                const n1 = lastThreeNumbers[0];
                const n2 = lastThreeNumbers[1];
                const n3 = lastThreeNumbers[2];
                
                const result = predictNumber(n1, n2, n3);
                const nextPeriod = String(parseInt(currentPeriod, 10) + 1);
                
                pendingPrediction = {
                    period: nextPeriod,
                    prediction: result.prediction,  // "BIG" or "SMALL"
                    digit: result.digit,
                    confidence: result.confidence
                };

                console.log(`\n🔮 NEW PREDICTION for ${nextPeriod}:`);
                console.log(`   📌 ${result.prediction} (${result.digit}) @ ${result.confidence}%`);
                console.log(`   📊 Based on: ${n1}, ${n2}, ${n3}`);
                console.log(`${'─'.repeat(40)}`);
            }
        }
    } catch (error) {
        console.log(`⚠️ Error: ${error.message}`);
    }
}

// ======================== START ========================
console.log('🚀 Starting Prediction Engine...');
console.log('📡 Fetching live data...\n');

// Run immediately and then every 2 seconds
setTimeout(() => processLoop(), 1000);
setInterval(processLoop, 2000);

// ======================== ROUTES ========================
app.use(cors());
app.use(express.json());

// Main endpoint - shows BIG/SMALL prediction clearly
app.get('/', (req, res) => {
    res.json({
        status: isDataAvailable ? 'active' : 'collecting',
        currentPeriod: {
            period: lastPeriod,
            number: currentActualNumber,
            type: currentActualType
        },
        nextPrediction: pendingPrediction ? {
            period: pendingPrediction.period,
            prediction: pendingPrediction.prediction,  // "BIG" or "SMALL"
            digit: pendingPrediction.digit,
            confidence: pendingPrediction.confidence + '%',
            basedOn: lastThreeNumbers
        } : null,
        stats: {
            totalPredictions: stats.totalPredictions,
            totalWins: stats.totalWins,
            totalLosses: stats.totalLosses,
            accuracy: stats.accuracy + '%'
        },
        recentHistory: history.slice(-10).map(h => ({
            period: h.period,
            predicted: h.predicted.type + ' (' + h.predicted.digit + ')',
            actual: h.actual.type + ' (' + h.actual.number + ')',
            result: h.result,
            win: h.win
        })),
        historyCount: history.length,
        lastUpdated: new Date().toISOString()
    });
});

// Full history with WIN/LOSS
app.get('/history', (req, res) => {
    res.json({
        history: history.map(h => ({
            period: h.period,
            predicted: {
                type: h.predicted.type,
                digit: h.predicted.digit,
                confidence: h.predicted.confidence + '%'
            },
            actual: {
                number: h.actual.number,
                type: h.actual.type
            },
            result: h.result,
            win: h.win,
            timestamp: h.timestamp
        })),
        count: history.length,
        stats: {
            totalPredictions: stats.totalPredictions,
            totalWins: stats.totalWins,
            totalLosses: stats.totalLosses,
            accuracy: stats.accuracy + '%'
        }
    });
});

// Stats only
app.get('/stats', (req, res) => {
    res.json({
        totalPredictions: stats.totalPredictions,
        totalWins: stats.totalWins,
        totalLosses: stats.totalLosses,
        accuracy: stats.accuracy + '%',
        historyCount: history.length,
        isDataAvailable: isDataAvailable,
        currentPeriod: lastPeriod,
        nextPrediction: pendingPrediction ? {
            period: pendingPrediction.period,
            prediction: pendingPrediction.prediction,
            digit: pendingPrediction.digit,
            confidence: pendingPrediction.confidence + '%'
        } : null
    });
});

// Reset
app.post('/reset', (req, res) => {
    history = [];
    stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
    pendingPrediction = null;
    res.json({ message: '✅ History reset successfully' });
});

// Health
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        hasPrediction: !!pendingPrediction,
        historyCount: history.length,
        isDataAvailable: isDataAvailable
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ======================== START SERVER ========================
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}/`);
    console.log(`\n📌 Endpoints:`);
    console.log(`  GET /        - Full data with BIG/SMALL prediction`);
    console.log(`  GET /history - All history with WIN/LOSS ✅❌`);
    console.log(`  GET /stats   - Statistics only`);
    console.log(`  GET /ping    - Health check`);
    console.log(`  POST /reset  - Reset history\n`);
});
