const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================== API CONFIG (30-SECOND GAME) ========================
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

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

// ======================== DATA FETCHER ========================
function getDataFromLocalFile() {
    try {
        if (fs.existsSync('./data.json')) {
            const rawData = fs.readFileSync('./data.json');
            const jsonData = JSON.parse(rawData);
            if (jsonData?.data?.list?.length >= 3) {
                return jsonData.data.list.map(item => ({
                    period: String(item.issueNumber || item.period),
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
    const mockData = [];
    const basePeriod = Math.floor(Date.now() / 30000); // Align with 30-second cycles
    for (let i = 0; i < 5; i++) {
        mockData.push({
            period: String(basePeriod - i),
            number: Math.floor(Math.random() * 10)
        });
    }
    return mockData;
}

async function fetchData() {
    try {
        const response = await axios.get(API_URL, {
            params: { ts: Date.now() },
            timeout: 2500, // Quick timeout for fast 30s intervals
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://hgnice.biz/'
            }
        });

        if (response.status === 200 && response.data?.data?.list?.length >= 3) {
            dataSource = 'live_api';
            return response.data.data.list.map(item => ({
                period: String(item.issueNumber || item.period),
                number: parseInt(item.number, 10)
            }));
        }
    } catch (error) {
        // Fallback checks logs quieted to avoid console pollution
    }

    const localData = getDataFromLocalFile();
    if (localData) {
        dataSource = 'local_file';
        return localData;
    }

    dataSource = 'mock_data';
    return generateMockData();
}

// ======================== STATE MANAGEMENT ========================
let history = [];
let processedPeriods = new Set(); 
let stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
let lastPeriod = null;
let pendingPrediction = null;
let lastThreeNumbers = [];
let currentActual = null;
let dataSource = 'initializing';
let isFirstRun = true;
let isProcessing = false;

// ======================== MAIN PROCESS LOOP ========================
async function processLoop() {
    if (isProcessing) return; // Prevent concurrent overlaps in fast 30S intervals
    isProcessing = true;

    try {
        const data = await fetchData();
        if (!data || data.length < 3) {
            isProcessing = false;
            return;
        }

        const latest = data[0];
        const currentPeriod = latest.period;
        const currentNumber = latest.number;
        const currentType = getBigSmall(currentNumber);

        currentActual = { period: currentPeriod, number: currentNumber, type: currentType };
        lastThreeNumbers = data.slice(0, 3).map(d => d.number);

        // Bootstrap on startup
        if (isFirstRun && lastThreeNumbers.length === 3) {
            const result = predictNumber(lastThreeNumbers[0], lastThreeNumbers[1], lastThreeNumbers[2]);
            const nextPeriod = String(BigInt(currentPeriod) + 1n);
            
            pendingPrediction = {
                period: nextPeriod,
                prediction: result.prediction,
                digit: result.digit,
                confidence: result.confidence
            };
            lastPeriod = currentPeriod;
            isFirstRun = false;
            console.log(`🚀 WinGo 30S: Engine loaded. First target -> [${nextPeriod}]`);
            isProcessing = false;
            return;
        }

        // Active tracking transition
        if (currentPeriod !== lastPeriod) {
            
            // Check win/loss result of the target period
            if (pendingPrediction && pendingPrediction.period === currentPeriod && !processedPeriods.has(currentPeriod)) {
                const win = (pendingPrediction.prediction === currentType) || (pendingPrediction.digit === currentNumber);
                processedPeriods.add(currentPeriod);

                history.push({
                    period: currentPeriod,
                    predicted: { type: pendingPrediction.prediction, digit: pendingPrediction.digit, confidence: pendingPrediction.confidence },
                    actual: { number: currentNumber, type: currentType },
                    win: win,
                    result: win ? '✅' : '❌',
                    timestamp: new Date().toISOString()
                });

                stats.totalPredictions++;
                win ? stats.totalWins++ : stats.totalLosses++;
                stats.accuracy = Math.round((stats.totalWins / stats.totalPredictions) * 100) || 0;

                console.log(`\n📊 Period Closed: ${currentPeriod} -> Result: ${currentType} (${currentNumber})`);
                console.log(`🔮 Prediction Status: ${win ? '✅ WIN' : '❌ LOSS'}`);
                console.log(`📈 Current Accuracy: ${stats.accuracy}% (${stats.totalWins}W / ${stats.totalLosses}L)`);
            }

            // Generate Next Prediction
            if (lastThreeNumbers.length === 3) {
                const result = predictNumber(lastThreeNumbers[0], lastThreeNumbers[1], lastThreeNumbers[2]);
                const nextPeriod = String(BigInt(currentPeriod) + 1n);

                pendingPrediction = {
                    period: nextPeriod,
                    prediction: result.prediction,
                    digit: result.digit,
                    confidence: result.confidence
                };

                console.log(`\n──────────────────────────────────────────────────`);
                console.log(`🔮 WinGo 30S Prediction for [${nextPeriod}]`);
                console.log(`🎯 Guess: ${result.prediction} (${result.digit}) | Conf: ${result.confidence}%`);
                console.log(`──────────────────────────────────────────────────`);
            }

            lastPeriod = currentPeriod;
        }
    } catch (error) {
        console.error('❌ Loop Error:', error.message);
    } finally {
        isProcessing = false;
    }
}

// ======================== INITIALIZATION ========================
console.log('🚀 Activating WinGo 30S Prediction Engine...');
processLoop();
setInterval(processLoop, 1500); // 1.5 seconds polling rate for fast 30s shifts

// ======================== API ROUTING CONTROLLERS ========================
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'active',
        gameType: 'WinGo_30S',
        dataSource,
        currentPeriod: currentActual,
        nextPrediction: pendingPrediction ? {
            period: pendingPrediction.period,
            prediction: pendingPrediction.prediction,
            digit: pendingPrediction.digit,
            confidence: pendingPrediction.confidence + '%',
            basedOn: lastThreeNumbers
        } : "Initializing fast-cycle loop... Refresh in 3 seconds.",
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
        }))
    });
});

app.post('/reset', (req, res) => {
    history = [];
    processedPeriods.clear();
    stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
    pendingPrediction = null;
    isFirstRun = true;
    res.json({ message: '✅ WinGo 30S data and logs successfully reset.' });
});

app.listen(PORT, () => {
    console.log(`📍 Web dashboard serving on http://localhost:${PORT}/`);
});
