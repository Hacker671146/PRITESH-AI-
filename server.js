const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================== API CONFIG (WIN-GO 30S) ========================
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

// ======================== STRATEGY ENGINE ========================
function predictNumber(n1, n2, n3) {
    // FIXED: Actually uses the three input numbers for pattern detection
    const sum = n1 + n2 + n3;
    const avg = sum / 3;
    
    // Dynamic prediction based on recent trend
    const prediction = avg >= 5 ? "BIG" : "SMALL";
    const digit = Math.round(avg) % 10;
    
    // Confidence based on variance (lower variance = higher confidence)
    const variance = Math.abs(n1 - avg) + Math.abs(n2 - avg) + Math.abs(n3 - avg);
    const confidence = Math.max(50, Math.min(95, 100 - (variance * 5)));

    return { 
        prediction, 
        digit, 
        confidence: Math.round(confidence * 10) / 10 
    };
}

function getBigSmall(num) { return num >= 5 ? "BIG" : "SMALL"; }

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

// ======================== RESILIENT DATA FETCHER ========================
function getDataFromLocalFile() {
    try {
        if (fs.existsSync('./data.json')) {
            const rawData = fs.readFileSync('./data.json');
            const jsonData = JSON.parse(rawData);
            if (jsonData?.data?.list?.length >= 4) {
                return jsonData.data.list.map(item => ({
                    period: String(item.issueNumber || item.period || item.issue || ''),
                    number: parseInt(item.number, 10)
                })).filter(item => item.period !== '');
            }
        }
        return null;
    } catch (err) {
        return null;
    }
}

function generateMockData() {
    const mockData = [];
    const basePeriod = Math.floor(Date.now() / 30000); 
    for (let i = 0; i < 6; i++) {
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
            timeout: 2500,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://hgnice.biz/'
            }
        });

        if (response.status === 200 && response.data?.data?.list?.length >= 4) {
            dataSource = 'live_api';
            return response.data.data.list.map(item => ({
                period: String(item.issueNumber || item.period || item.issue || ''),
                number: parseInt(item.number, 10)
            })).filter(item => item.period !== '');
        }
    } catch (error) {
        // Fallbacks execute safely below
    }

    const localData = getDataFromLocalFile();
    if (localData) {
        dataSource = 'local_file';
        return localData;
    }

    dataSource = 'mock_data';
    return generateMockData();
}

// ======================== REALTIME TRACKING ENGINE (FIXED) ========================
function trackGameResult(currentPeriod, currentNumber, currentType) {
    const targetPeriodStr = String(currentPeriod).trim();

    if (!pendingPrediction) {
        console.log(`⚠️ No pending prediction for period ${targetPeriodStr}`);
        return;
    }

    if (String(pendingPrediction.period).trim() !== targetPeriodStr) {
        console.log(`⚠️ Period mismatch: pending=${pendingPrediction.period}, current=${targetPeriodStr}`);
        return;
    }

    if (processedPeriods.has(targetPeriodStr)) {
        console.log(`⚠️ Period ${targetPeriodStr} already processed, skipping duplicate`);
        return;
    }

    // FIXED: Proper win evaluation (type match OR exact digit match)
    const typeWin = pendingPrediction.prediction === currentType;
    const digitWin = pendingPrediction.digit === currentNumber;
    const win = typeWin || digitWin;
    
    processedPeriods.add(targetPeriodStr);

    history.push({
        period: targetPeriodStr,
        predicted: { 
            type: pendingPrediction.prediction, 
            digit: pendingPrediction.digit, 
            confidence: pendingPrediction.confidence 
        },
        actual: { number: currentNumber, type: currentType },
        win: win,
        typeWin: typeWin,
        digitWin: digitWin,
        result: win ? '✅ WIN' : '❌ LOSS',
        timestamp: new Date().toISOString()
    });

    stats.totalPredictions++;
    win ? stats.totalWins++ : stats.totalLosses++;
    stats.accuracy = Math.round((stats.totalWins / stats.totalPredictions) * 100) || 0;

    console.log(`\n📊 [EVALUATED] Period: ${targetPeriodStr} | Actual: ${currentType} (${currentNumber})`);
    console.log(`🔮 Prediction: ${pendingPrediction.prediction}(${pendingPrediction.digit}) | Status: ${win ? '✅ WIN' : '❌ LOSS'}`);
    console.log(`📈 Stats: ${stats.totalWins}W / ${stats.totalLosses}L | Accuracy: ${stats.accuracy}%`);
}

// ======================== MAIN SYNC CYCLE (FIXED) ========================
async function processLoop() {
    if (isProcessing) return; 
    isProcessing = true;

    try {
        const data = await fetchData();
        if (!data || data.length < 4) {
            isProcessing = false;
            return;
        }

        const latest = data[0];
        const currentPeriod = String(latest.period).trim();
        const currentNumber = latest.number;
        const currentType = getBigSmall(currentNumber);

        currentActual = { period: currentPeriod, number: currentNumber, type: currentType };
        
        // FIXED: Use indices 0, 1, 2 to include the MOST RECENT result
        // Previously used slice(1,4) which excluded the latest draw
        lastThreeNumbers = data.slice(0, 3).map(d => d.number);

        // Cold-start: Initialize with first data batch
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
            console.log(`🚀 Tracking Active. Target initialized for period [${nextPeriod}] -> ${result.prediction} ${result.digit} Mode.`);
            isProcessing = false;
            return;
        }

        // Active tracking: Detect period transition
        if (currentPeriod !== lastPeriod) {
            
            // 1. Evaluate the prediction that was made for this now-resolved period
            trackGameResult(currentPeriod, currentNumber, currentType);

            // 2. Generate NEW prediction for the NEXT upcoming period
            // FIXED: Uses fresh data[0], data[1], data[2] (most recent 3 draws)
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
                console.log(`🔮 Next Forecast: Period [${nextPeriod}]`);
                console.log(`🎯 Target: ${result.prediction} (${result.digit}) | Conf: ${result.confidence}%`);
                console.log(`📊 Based on: [${lastThreeNumbers.join(', ')}]`);
                console.log(`──────────────────────────────────────────────────`);
            }

            lastPeriod = currentPeriod;
        }
    } catch (error) {
        console.error('❌ Tracking Loop Error:', error.message);
    } finally {
        isProcessing = false;
    }
}

// ======================== RUN ENGINE ========================
console.log('🚀 Initializing Core Microservices System Framework...');
processLoop();
setInterval(processLoop, 1500);

// ======================== API CONTROLLERS ========================
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'active',
        gameType: 'WinGo_30S',
        engineMod: 'DYNAMIC_TREND',
        dataSource,
        currentPeriod: currentActual,
        nextPrediction: pendingPrediction ? {
            period: pendingPrediction.period,
            prediction: pendingPrediction.prediction,
            digit: pendingPrediction.digit,
            confidence: pendingPrediction.confidence + '%',
            historicalReferenceNumbers: lastThreeNumbers
        } : "Syncing sequence calculations...",
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
            win: h.win,
            typeWin: h.typeWin,
            digitWin: h.digitWin
        }))
    });
});

app.post('/reset', (req, res) => {
    history = [];
    processedPeriods.clear();
    stats = { totalPredictions: 0, totalWins: 0, totalLosses: 0, accuracy: 0 };
    pendingPrediction = null;
    isFirstRun = true;
    lastPeriod = null;
    console.log('🔄 System reset triggered via API');
    res.json({ message: '✅ All runtime stats and historical data cleared.' });
});

app.listen(PORT, () => {
    console.log(`📍 Live Tracking Dashboard: http://localhost:${PORT}/`);
});
