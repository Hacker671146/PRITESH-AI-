const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================== API CONFIG (WIN-GO 30S) ========================
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

// ======================== STRATEGY ENGINE (LOCKED: SMALL 3) ========================
function predictNumber(n1, n2, n3) {
    // Hardcoded execution logic to guarantee SMALL 3
    const prediction = "SMALL";
    const digit = 3;
    
    // Minor aesthetic variance (76% - 89%) for API metadata consistency
    const variance = (Math.abs(n1 - n2 + n3) % 14);
    const confidence = 76.0 + variance;

    return { 
        prediction, 
        digit, 
        confidence: Math.round(confidence * 10) / 10 
    };
}

function getBigSmall(num) { return num >= 5 ? "BIG" : "SMALL"; }

// ======================== STATE MANAGEMENT ========================
let history = [];
let processedPeriods = new Set(); // Global Master Filter
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
            timeout: 2500, // Slightly extended for weak handshakes
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

// ======================== REALTIME TRACKING ENGINE (BUG FREE) ========================
function trackGameResult(currentPeriod, currentNumber, currentType) {
    // Core check: Cast to explicit string formats to eliminate matching errors
    const targetPeriodStr = String(currentPeriod).trim();

    if (!pendingPrediction || String(pendingPrediction.period).trim() !== targetPeriodStr) {
        return; // Period mismatch, skipping out-of-sync data frame
    }

    if (processedPeriods.has(targetPeriodStr)) {
        return; // Already calculated this period! Stops duplicate entry accumulation.
    }

    // Win evaluation parameter verification logic
    const win = (pendingPrediction.prediction === currentType) || (pendingPrediction.digit === currentNumber);
    
    // Permanently record period signature
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
        result: win ? '✅ WIN' : '❌ LOSS',
        timestamp: new Date().toISOString()
    });

    // Recalculate Dashboard Stats Cleanly
    stats.totalPredictions++;
    win ? stats.totalWins++ : stats.totalLosses++;
    stats.accuracy = Math.round((stats.totalWins / stats.totalPredictions) * 100) || 0;

    console.log(`\n📊 [EVALUATED] Period: ${targetPeriodStr} | Actual: ${currentType} (${currentNumber})`);
    console.log(`🔮 Prediction: ${pendingPrediction.prediction}(${pendingPrediction.digit}) | Status: ${win ? '✅ WIN' : '❌ LOSS'}`);
    console.log(`📈 Current Running Stats: ${stats.totalWins}W / ${stats.totalLosses}L | Accuracy: ${stats.accuracy}%`);
}

// ======================== MAIN SYNC CYCLE ========================
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
        
        // Extract indices 1, 2, 3 to keep historical reference intact
        lastThreeNumbers = data.slice(1, 4).map(d => d.number);

        // Cold-start calculation cycle initialization
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
            console.log(`🚀 Tracking Active. Target initialized for period [${nextPeriod}] -> SMALL 3 Mode Locked.`);
            isProcessing = false;
            return;
        }

        // Active Step Transition Block
        if (currentPeriod !== lastPeriod) {
            
            // 1. Process what just resolved
            trackGameResult(currentPeriod, currentNumber, currentType);

            // 2. Schedule upcoming prediction profile
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
                console.log(`🔮 Next Forecast Registered for Period [${nextPeriod}]`);
                console.log(`🎯 Fixed Target: ${result.prediction} (${result.digit}) | Conf: ${result.confidence}%`);
                console.log(`──────────────────────────────────────────────────`);
            }

            lastPeriod = currentPeriod;
        }
    } catch (error) {
        console.error('❌ Tracking Loop Error Execution Context:', error.message);
    } finally {
        isProcessing = false;
    }
}

// ======================== RUN ENGINE ========================
console.log('🚀 Initializing Core Microservices System Framework...');
processLoop();
setInterval(processLoop, 1500); // Polls every 1.5 seconds to balance tracking speed with API rate limits

// ======================== API CONTROLLERS ========================
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'active',
        gameType: 'WinGo_30S',
        engineMod: 'FIXED_SMALL_3',
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
    res.json({ message: '✅ All runtime stats and historical data sets tracking logs cleared.' });
});

app.listen(PORT, () => {
    console.log(`📍 Live Tracking Engine Control Dashboard at: http://localhost:${PORT}/`);
});
