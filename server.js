const express = require('express');
const axios = require('axios');
const cors = require('cors');

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

    return { 
        prediction: prediction,
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
let pendingPrediction = null;
let isDataAvailable = false;
let lastThreeNumbers = [];
let currentActualNumber = null;
let currentActualType = null;
let debugInfo = {};

// ======================== FETCH DATA WITH DEBUG ========================
async function fetchData() {
    try {
        console.log('📡 Fetching data from API...');
        const response = await axios.get(API_URL, {
            params: { ts: Date.now() },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });

        console.log(`✅ API Response Status: ${response.status}`);
        
        if (response.status === 200 && response.data) {
            // Debug: Log the response structure
            console.log('📦 Response Structure:', Object.keys(response.data));
            
            let dataList = null;
            
            // Try different response structures
            if (response.data.data && response.data.data.list) {
                console.log('✅ Found data.data.list');
                dataList = response.data.data.list;
            } else if (response.data.list) {
                console.log('✅ Found data.list');
                dataList = response.data.list;
            } else if (Array.isArray(response.data)) {
                console.log('✅ Found array response');
                dataList = response.data;
            } else if (response.data.data && Array.isArray(response.data.data)) {
                console.log('✅ Found data.data array');
                dataList = response.data.data;
            }

            if (dataList && dataList.length > 0) {
                console.log(`📊 Data count: ${dataList.length}`);
                
                // Log first item to see structure
                console.log('📝 First item sample:', JSON.stringify(dataList[0]).substring(0, 100));
                
                const formatted = dataList.map(item => ({
                    period: String(item.issueNumber || item.period || item.id || ''),
                    number: parseInt(item.number || item.value || item.num || 0, 10)
                })).filter(item => item.period && !isNaN(item.number) && item.number >= 0 && item.number <= 9);

                if (formatted.length >= 3) {
                    console.log(`✅ Formatted ${formatted.length} valid records`);
                    isDataAvailable = true;
                    return formatted;
                } else {
                    console.log(`⚠️ Only ${formatted.length} valid records found (need 3)`);
                }
            } else {
                console.log('⚠️ No data list found in response');
                console.log('📦 Full response sample:', JSON.stringify(response.data).substring(0, 200));
            }
        }
        return null;
    } catch (error) {
        console.log(`❌ Fetch error: ${error.message}`);
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
        }
        return null;
    }
}

// ======================== PROCESS LOOP ========================
async function processLoop() {
    try {
        const data = await fetchData();
        if (!data) {
            console.log('⏳ No data available, waiting...');
            return;
        }

        const latest = data[0];
        const currentPeriod = latest.period;
        const currentNumber = latest.number;
        const currentType = getBigSmall(currentNumber);

        currentActualNumber = currentNumber;
        currentActualType = currentType;
        lastThreeNumbers = data.slice(0, 3).map(d => d.number);

        console.log(`📊 Current: Period ${currentPeriod}, Number ${currentNumber} (${currentType})`);

        if (currentPeriod !== lastPeriod) {
            console.log(`\n🔄 New Period Detected: ${currentPeriod}`);
            lastPeriod = currentPeriod;

            if (pendingPrediction && pendingPrediction.period === currentPeriod) {
                const predictedType = pendingPrediction.prediction;
                const predictedDigit = pendingPrediction.digit;
                const win = (predictedType === currentType) || (predictedDigit === currentNumber);

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

                stats.totalPredictions++;
                if (win) stats.totalWins++;
                else stats.totalLosses++;
                stats.accuracy = stats.totalPredictions > 0 
                    ? Math.round((stats.totalWins / stats.totalPredictions) * 1000) / 10
                    : 0;

                console.log(`\n${'═'.repeat(60)}`);
                console.log(`📊 PERIOD: ${currentPeriod}`);
                console.log(`🔮 PREDICTED: ${predictedType} (${predictedDigit}) @ ${pendingPrediction.confidence}%`);
                console.log(`🎯 ACTUAL: ${currentType} (${currentNumber})`);
                console.log(`   ${win ? '✅ WIN' : '❌ LOSS'}`);
                console.log(`📈 STATS: ${stats.totalWins}W / ${stats.totalLosses}L (${stats.accuracy}%)`);
                console.log(`${'═'.repeat(60)}`);
            }

            // Generate new prediction
            if (lastThreeNumbers.length === 3) {
                const n1 = lastThreeNumbers[0];
                const n2 = lastThreeNumbers[1];
                const n3 = lastThreeNumbers[2];
                
                const result = predictNumber(n1, n2, n3);
                const nextPeriod = String(parseInt(currentPeriod, 10) + 1);
                
                pendingPrediction = {
                    period: nextPeriod,
                    prediction: result.prediction,
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
        console.log(`⚠️ Loop error: ${error.message}`);
    }
}

// ======================== START ========================
console.log('🚀 Starting Prediction Engine...');
console.log('📡 Fetching live data...\n');

// Run every 3 seconds
setTimeout(() => processLoop(), 1000);
setInterval(processLoop, 3000);

// ======================== ROUTES ========================
app.use(cors());
app.use(express.json());

// Main endpoint
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
            predicted: h.predicted.type + ' (' + h.predicted.digit + ')',
            actual: h.actual.type + ' (' + h.actual.number + ')',
            result: h.result,
            win: h.win
        })),
        historyCount: history.length,
        lastUpdated: new Date().toISOString(),
        debug: {
            isDataAvailable: isDataAvailable,
            lastThreeNumbers: lastThreeNumbers,
            hasPrediction: !!pendingPrediction
        }
    });
});

// Debug endpoint - shows raw API response
app.get('/debug', async (req, res) => {
    try {
        const response = await axios.get(API_URL, {
            params: { ts: Date.now() },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        res.json({
            status: response.status,
            headers: response.headers,
            data: response.data,
            dataKeys: Object.keys(response.data || {}),
            hasData: !!response.data
        });
    } catch (error) {
        res.json({
            error: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
    }
});

// History
app.get('/history', (req, res) => {
    res.json({
        history: history,
        count: history.length,
        stats: {
            totalPredictions: stats.totalPredictions,
            totalWins: stats.totalWins,
            totalLosses: stats.totalLosses,
            accuracy: stats.accuracy + '%'
        }
    });
});

// Stats
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
    console.log(`  GET /        - Full data with prediction`);
    console.log(`  GET /debug   - Raw API response (DEBUG)`);
    console.log(`  GET /history - All history with WIN/LOSS`);
    console.log(`  GET /stats   - Statistics only`);
    console.log(`  GET /ping    - Health check`);
    console.log(`  POST /reset  - Reset history\n`);
});
