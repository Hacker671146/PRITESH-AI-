const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================== API CONFIG ========================
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

// ======================== DATA FETCHER WITH 3 LAYERS ========================
function getDataFromLocalFile() {
    try {
        if (fs.existsSync('./data.json')) {
            const rawData = fs.readFileSync('./data.json');
            const jsonData = JSON.parse(rawData);
            if (jsonData?.data?.list?.length >= 3) {
                console.log('✅ Using data from local file (data.json)');
                return jsonData.data.list.map(item => ({
                    period: String(item.issueNumber),
                    number: parseInt(item.number, 10)
                }));
            }
        }
        return null;
    } catch (err) {
        return null;
    }
}

function generateMockData() {
    console.log('🔄 Generating mock data...');
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

async function fetchData() {
    // LAYER 1: Try Live API
    try {
        console.log('📡 Attempting live API...');
        const response = await axios.get(API_URL, {
            params: { ts: Date.now() },
            timeout: 3000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://hgnice.biz/'
            }
        });

        if (response.status === 200 && response.data?.data?.list?.length >= 3) {
            console.log('✅ Live API success!');
            return response.data.data.list.map(item => ({
                period: String(item.issueNumber),
                number: parseInt(item.number, 10)
            }));
        }
    } catch (error) {
        console.log(`⚠️ Live API failed: ${error.message}`);
    }

    // LAYER 2: Try Local File
    const localData = getDataFromLocalFile();
    if (localData) {
        return localData;
    }

    // LAYER 3: Generate Mock Data
    return generateMockData();
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
let pendingPrediction = null;
let lastThreeNumbers = [];
let currentActual = null;
let dataSource = 'initializing';

// ======================== MAIN PROCESS ========================
async function processLoop() {
    try {
        const data = await fetchData();
        if (!data || data.length < 3) {
            console.log('⏳ Waiting for data...');
            return;
        }

        // Update data source info
        if (fs.existsSync('./data.json')) {
            dataSource = 'local';
        } else {
            dataSource = 'mock';
        }

        // Get latest result
        const latest = data[0];
        const currentPeriod = latest.period;
        const currentNumber = latest.number;
        const currentType = getBigSmall(currentNumber);

        currentActual = { period: currentPeriod, number: currentNumber, type: currentType };
        lastThreeNumbers = data.slice(0, 3).map(d => d.number);

        // New period detected
        if (currentPeriod !== lastPeriod) {
            console.log(`\n📊 New Period: ${currentPeriod} → ${currentType} (${currentNumber})`);
            lastPeriod = currentPeriod;

            // Check previous prediction
            if (pendingPrediction && pendingPrediction.period === currentPeriod) {
                const win = (pendingPrediction.prediction === currentType) || 
                           (pendingPrediction.digit === currentNumber);
                
                // Save to history
                history.push({
                    period: currentPeriod,
                    predicted: {
                        type: pendingPrediction.prediction,
                        digit: pendingPrediction.digit,
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
                win ? stats.totalWins++ : stats.totalLosses++;
                stats.accuracy = stats.totalPredictions > 0 
                    ? Math.round((stats.totalWins / stats.totalPredictions) * 1000) / 10 
                    : 0;

                console.log(`🔮 Predicted: ${pendingPrediction.prediction}(${pendingPrediction.digit}) → ${win ? '✅ WIN' : '❌ LOSS'}`);
                console.log(`📈 Stats: ${stats.totalWins}W / ${stats.totalLosses}L (${stats.accuracy}%)`);
            }

            // Generate new prediction
            if (lastThreeNumbers.length === 3) {
                const result = predictNumber(
                    lastThreeNumbers[0], 
                    lastThreeNumbers[1], 
                    lastThreeNumbers[2]
                );
                const nextPeriod = String(parseInt(currentPeriod, 10) + 1);
                
                pendingPrediction = {
                    period: nextPeriod,
                    prediction: result.prediction,
                    digit: result.digit,
                    confidence: result.confidence
                };

                console.log(`🔮 New Prediction for ${nextPeriod}: ${result.prediction}(${result.digit}) @ ${result.confidence}%`);
                console.log(`   Based on: ${lastThreeNumbers.join(', ')}`);
                console.log('─'.repeat(50));
            }
        }
    } catch (error) {
        console.error('❌ Loop Error:', error.message);
    }
}

// ======================== START ========================
console.log('🚀 Starting Prediction Engine...');
console.log('📡 Data Layers: Live API → Local File → Mock Data\n');

setTimeout(() => processLoop(), 1000);
setInterval(processLoop, 2000);

// ======================== ROUTES ========================
app.use(cors());
app.use(express.json());

// Main endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'active',
        dataSource: dataSource,
        currentPeriod: currentActual,
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
            predicted: `${h.predicted.type}(${h.predicted.digit})`,
            actual: `${h.actual.type}(${h.actual.number})`,
            result: h.result,
            win: h.win
        })),
        historyCount: history.length,
        lastUpdated: new Date().toISOString()
    });
});

// Full history
app.get('/history', (req, res) => {
    res.json({
        history: history,
        count: history.length,
        stats: stats
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
        dataSource: dataSource
    });
});

// Reset
app.post('/reset', (req, res) => {
    history = [];
    stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
    pendingPrediction = null;
    res.json({ message: '✅ History reset successfully' });
});

// Health check
app.get('/ping', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        historyCount: history.length,
        dataSource: dataSource
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}/`);
    console.log('\n📌 Endpoints:');
    console.log('  GET /        - Full data with predictions');
    console.log('  GET /history - Complete history');
    console.log('  GET /stats   - Statistics');
    console.log('  GET /ping    - Health check');
    console.log('  POST /reset  - Reset history\n');
});
