const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

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

// ======================== MOCK DATA GENERATOR ========================
let basePeriod = Math.floor(Date.now() / 1000) % 1000000;
function generateMockData() {
    const numbers = [];
    for (let i = 0; i < 5; i++) {
        numbers.push(Math.floor(Math.random() * 10));
    }
    basePeriod++;
    return numbers.map((n, idx) => ({
        period: String(basePeriod + idx),
        number: n
    }));
}

// ======================== STATE ========================
let history = [];
let stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
let lastPeriod = null;
let pendingPrediction = null;
let lastThreeNumbers = [];
let currentActualNumber = null;
let currentActualType = null;
let isDataAvailable = true; // Mock data is always available

// ======================== PROCESS LOOP ========================
async function processLoop() {
    // 1. Generate new mock data
    const data = generateMockData();
    if (!data || data.length < 3) return;

    // 2. Get the latest result
    const latest = data[0];
    const currentPeriod = latest.period;
    const currentNumber = latest.number;
    const currentType = getBigSmall(currentNumber);

    currentActualNumber = currentNumber;
    currentActualType = currentType;
    lastThreeNumbers = data.slice(0, 3).map(d => d.number);

    // 3. Check if it's a new period
    if (currentPeriod !== lastPeriod) {
        console.log(`\n🔄 New Period: ${currentPeriod}, Number: ${currentNumber} (${currentType})`);
        lastPeriod = currentPeriod;

        // 4. Check previous prediction
        if (pendingPrediction && pendingPrediction.period === currentPeriod) {
            const win = (pendingPrediction.prediction === currentType) || (pendingPrediction.digit === currentNumber);
            
            // Record the result in history
            history.push({
                period: currentPeriod,
                predicted: { type: pendingPrediction.prediction, digit: pendingPrediction.digit, confidence: pendingPrediction.confidence },
                actual: { number: currentNumber, type: currentType },
                win: win,
                result: win ? '✅' : '❌',
                timestamp: new Date().toISOString()
            });

            // Update stats
            stats.totalPredictions++;
            win ? stats.totalWins++ : stats.totalLosses++;
            stats.accuracy = Math.round((stats.totalWins / stats.totalPredictions) * 1000) / 10;

            console.log(`📊 PERIOD: ${currentPeriod} | PREDICTED: ${pendingPrediction.prediction} (${pendingPrediction.digit}) | ACTUAL: ${currentType} (${currentNumber}) | ${win ? '✅ WIN' : '❌ LOSS'}`);
            console.log(`📈 STATS: ${stats.totalWins}W / ${stats.totalLosses}L (${stats.accuracy}%)`);
        }

        // 5. Generate new prediction for the next period
        if (lastThreeNumbers.length === 3) {
            const result = predictNumber(lastThreeNumbers[0], lastThreeNumbers[1], lastThreeNumbers[2]);
            const nextPeriod = String(parseInt(currentPeriod, 10) + 1);
            pendingPrediction = { period: nextPeriod, prediction: result.prediction, digit: result.digit, confidence: result.confidence };
            console.log(`🔮 NEW PREDICTION for ${nextPeriod}: ${result.prediction} (${result.digit}) @ ${result.confidence}%`);
            console.log(`${'─'.repeat(50)}`);
        }
    }
}

// Run the loop every 2 seconds
setInterval(processLoop, 2000);

// ======================== EXPRESS ROUTES ========================
app.use(cors());
app.use(express.json());

// Main endpoint - returns everything
app.get('/', (req, res) => {
    res.json({
        status: 'active',
        currentPeriod: { period: lastPeriod, number: currentActualNumber, type: currentActualType },
        nextPrediction: pendingPrediction ? {
            period: pendingPrediction.period,
            prediction: pendingPrediction.prediction,
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
            predicted: `${h.predicted.type} (${h.predicted.digit})`,
            actual: `${h.actual.type} (${h.actual.number})`,
            result: h.result,
            win: h.win
        })),
        historyCount: history.length,
        lastUpdated: new Date().toISOString()
    });
});

// Full history endpoint
app.get('/history', (req, res) => {
    res.json({ history, count: history.length, stats });
});

// Stats endpoint
app.get('/stats', (req, res) => {
    res.json({ ...stats, historyCount: history.length, nextPrediction: pendingPrediction });
});

// Reset endpoint
app.post('/reset', (req, res) => {
    history = [];
    stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
    pendingPrediction = null;
    res.json({ message: '✅ History reset successfully' });
});

// Health check
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), historyCount: history.length });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`👉 GET / for complete data with predictions and history`);
});
