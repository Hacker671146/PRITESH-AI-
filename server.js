const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================== LIVE API ========================
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://hgnice.biz",
    "Origin": "https://hgnice.biz"
};

// ======================== PREDICTION ENGINE ========================
class VaseAnalyticsEngine {
    extractVaseScore(n1, n2, n3) {
        const recent_sum = n1 + n2 + n3;
        const delta_primary = Math.abs(n1 - n2);
        const delta_secondary = Math.abs(n2 - n3);
        const wave_1 = Math.sin(n1 * 0.5) * 0.15;
        const wave_2 = Math.cos(n2 * 0.3) * 0.15;
        let score = (recent_sum / 27.0) * 0.4 + ((delta_primary + delta_secondary) / 18.0) * 0.3 + (wave_1 + wave_2);
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
        return { prediction, digit, confidence: confidence * 100 };
    }
}

function getBigSmall(num) { return num >= 5 ? "BIG" : "SMALL"; }

// ======================== STATE ========================
let history = [];
let stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
let lastPeriod = null;
let activeResult = null;
let predictedPeriod = null;
let lastUpdated = null;
let isLiveDataAvailable = false;
let liveData = [];
let dataCollectAttempts = 0;

const predictor = new UltimateHybridPredictor();

// ======================== FETCH LIVE DATA WITH RETRY ========================
async function fetchLiveData() {
    try {
        dataCollectAttempts++;
        console.log(`📡 Fetching live data (Attempt ${dataCollectAttempts})...`);
        
        const ts = Date.now();
        const res = await axios.get(API_URL, { 
            params: { ts }, 
            headers: HEADERS, 
            timeout: 10000 
        });
        
        if (res.status === 200) {
            const data = res.data;
            console.log('📦 Raw API Response:', JSON.stringify(data).substring(0, 200) + '...');
            
            // Try multiple possible response structures
            let list = null;
            
            // Structure 1: data.data.list
            if (data && data.data && data.data.list && Array.isArray(data.data.list)) {
                list = data.data.list;
            }
            // Structure 2: data.list
            else if (data && data.list && Array.isArray(data.list)) {
                list = data.list;
            }
            // Structure 3: data.data (if it's an array)
            else if (data && data.data && Array.isArray(data.data)) {
                list = data.data;
            }
            // Structure 4: data itself is array
            else if (Array.isArray(data)) {
                list = data;
            }
            
            if (list && list.length >= 3) {
                isLiveDataAvailable = true;
                liveData = list.map(item => ({
                    period: String(item.issueNumber || item.period || item.id || ''),
                    number: parseInt(item.number || item.value || item.num || 0, 10)
                }));
                
                console.log(`✅ Live data fetched: ${liveData.length} records`);
                console.log(`📊 Latest: Period ${liveData[0].period} → Number ${liveData[0].number}`);
                return liveData;
            } else {
                console.log('⚠️ No valid data in response');
                return [];
            }
        }
        return [];
    } catch (err) {
        console.log(`❌ Fetch error: ${err.message}`);
        return [];
    }
}

// ======================== MAIN PROCESSING LOOP ========================
async function processLoop() {
    try {
        // First collect data
        const data = await fetchLiveData();
        
        if (!data || data.length < 3) {
            console.log('⏳ Not enough data yet. Need at least 3 records.');
            return;
        }

        // Get latest data
        const latest = data[0];
        const currentPeriod = latest.period;
        const currentNumber = latest.number;

        if (!currentPeriod || isNaN(currentNumber)) {
            console.log('⚠️ Invalid data format');
            return;
        }

        // New period detected
        if (currentPeriod !== lastPeriod) {
            lastPeriod = currentPeriod;

            // Check previous prediction against actual result
            if (activeResult && predictedPeriod) {
                const predictedType = activeResult.prediction;
                const predictedDigit = activeResult.digit;
                const actualType = getBigSmall(currentNumber);
                const win = (predictedType === actualType) || (predictedDigit === currentNumber);
                const resultEmoji = win ? '✅' : '❌';

                // Save to history
                history.push({
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
                    result: resultEmoji,
                    timestamp: new Date().toISOString()
                });

                // Update stats
                stats.totalPredictions++;
                win ? stats.totalWins++ : stats.totalLosses++;
                stats.accuracy = stats.totalPredictions > 0 ? (stats.totalWins / stats.totalPredictions) * 100 : 0;

                // Console output with stickers
                console.log(`\n${'═'.repeat(60)}`);
                console.log(`📊 PERIOD: ${predictedPeriod}`);
                console.log(`🔮 PREDICTED: ${predictedType} (${predictedDigit}) @ ${activeResult.confidence.toFixed(1)}%`);
                console.log(`🎯 ACTUAL: ${actualType} (${currentNumber})`);
                console.log(`   ${resultEmoji} ${win ? 'WIN' : 'LOSS'}`);
                console.log(`📈 STATS: Total=${stats.totalPredictions} | Wins=${stats.totalWins} ✅ | Losses=${stats.totalLosses} ❌ | Accuracy=${stats.accuracy.toFixed(1)}%`);
                console.log(`${'═'.repeat(60)}`);
            }

            // Generate new prediction using last 3 numbers
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
            lastUpdated = new Date().toISOString();

            console.log(`\n🔮 NEW PREDICTION for ${nextPeriod}: ${result.prediction} (${result.digit}) @ ${result.confidence.toFixed(1)}%`);
            console.log(`📊 Based on: ${n1}, ${n2}, ${n3}`);
        }
    } catch (err) {
        console.error('❌ Loop error:', err.message);
    }
}

// ======================== START BACKGROUND PROCESS ========================
console.log('⏳ Initializing prediction engine...');
console.log('📡 Collecting live data...');

// Run immediately and then every 3 seconds
setTimeout(() => {
    processLoop();
}, 1000);

setInterval(processLoop, 3000);

// ======================== EXPRESS ROUTES ========================
app.use(cors());
app.use(express.json());

// Main endpoint - returns everything
app.get('/', (req, res) => {
    try {
        const response = {
            status: isLiveDataAvailable ? 'live' : 'collecting_data',
            message: isLiveDataAvailable ? '✅ Live data available' : '⏳ Collecting live data...',
            currentPrediction: activeResult ? {
                period: activeResult.period,
                prediction: activeResult.prediction,
                digit: activeResult.digit,
                confidence: activeResult.confidence
            } : null,
            stats: {
                totalPredictions: stats.totalPredictions,
                totalWins: stats.totalWins,
                totalLosses: stats.totalLosses,
                accuracy: stats.totalPredictions > 0 ? stats.accuracy.toFixed(1) + '%' : '0%'
            },
            history: history.map(h => ({
                period: h.period,
                predicted: h.predicted,
                actual: h.actual,
                result: h.result,
                win: h.win,
                timestamp: h.timestamp
            })),
            historyCount: history.length,
            lastUpdated: lastUpdated,
            liveDataAvailable: isLiveDataAvailable,
            dataCount: liveData.length,
            attemptCount: dataCollectAttempts
        };
        res.json(response);
    } catch (err) {
        res.status(500).json({ 
            error: 'Internal error', 
            details: err.message,
            status: 'error'
        });
    }
});

// Raw data endpoint - shows what we got from API
app.get('/raw', (req, res) => {
    try {
        res.json({
            liveData: liveData,
            isLiveDataAvailable: isLiveDataAvailable,
            dataCount: liveData.length,
            attempts: dataCollectAttempts,
            lastUpdated: lastUpdated
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// History only
app.get('/history', (req, res) => {
    try {
        res.json(history.map(h => ({
            period: h.period,
            predicted: h.predicted,
            actual: h.actual,
            result: h.result,
            win: h.win,
            timestamp: h.timestamp
        })));
    } catch (err) {
        res.status(500).json({ error: 'Error fetching history' });
    }
});

// Stats only
app.get('/stats', (req, res) => {
    try {
        res.json({
            totalPredictions: stats.totalPredictions,
            totalWins: stats.totalWins,
            totalLosses: stats.totalLosses,
            accuracy: stats.totalPredictions > 0 ? stats.accuracy.toFixed(1) + '%' : '0%',
            historyCount: history.length,
            liveDataAvailable: isLiveDataAvailable,
            dataCount: liveData.length
        });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching stats' });
    }
});

// Reset history
app.post('/reset', (req, res) => {
    history = [];
    stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
    res.json({ message: '✅ History reset successfully' });
});

// Health check
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        liveDataAvailable: isLiveDataAvailable,
        hasPrediction: !!activeResult,
        historyCount: history.length,
        dataCount: liveData.length
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ======================== START SERVER ========================
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📍 API: ${API_URL}`);
    console.log(`\n👉 GET /ping - Health check`);
    console.log(`👉 GET / - Full data with predictions`);
    console.log(`👉 GET /raw - Raw API data`);
    console.log(`👉 GET /history - All period history`);
    console.log(`👉 GET /stats - Statistics only`);
    console.log(`\n⏳ Collecting live data... First prediction in ~3-5 seconds\n`);
});
