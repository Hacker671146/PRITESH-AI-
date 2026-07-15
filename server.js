const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

// ======================== STRATEGY ENGINE ========================
function predictNumber(n1, n2, n3) {
    const sum = n1 + n2 + n3;
    const avg = sum / 3;
    const prediction = avg >= 5 ? "BIG" : "SMALL";
    const digit = Math.round(avg) % 10;
    const variance = Math.abs(n1 - avg) + Math.abs(n2 - avg) + Math.abs(n3 - avg);
    const confidence = Math.max(50, Math.min(95, 100 - (variance * 5)));
    return { prediction, digit, confidence: Math.round(confidence * 10) / 10 };
}

function getBigSmall(num) { return num >= 5 ? "BIG" : "SMALL"; }

// ======================== STATE ========================
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

// ======================== FETCHERS ========================
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
    } catch (err) { return null; }
}

function generateMockData() {
    const mockData = [];
    const basePeriod = Math.floor(Date.now() / 30000); 
    for (let i = 0; i < 6; i++) {
        mockData.push({ period: String(basePeriod - i), number: Math.floor(Math.random() * 10) });
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
                period: String(item.issueNumber),
                number: parseInt(item.number, 10)
            })).filter(item => item.period !== '');
        }
    } catch (error) {}

    const localData = getDataFromLocalFile();
    if (localData) { dataSource = 'local_file'; return localData; }

    dataSource = 'mock_data';
    return generateMockData();
}

// ======================== TRACKING ENGINE ========================
function trackGameResult(currentPeriod, currentNumber, currentType) {
    const targetPeriodStr = String(currentPeriod).trim();

    if (!pendingPrediction) {
        console.log(`⚠️ No pending prediction for period ${targetPeriodStr}`);
        return false;
    }

    const pendingPeriodStr = String(pendingPrediction.period).trim();
    
    if (pendingPeriodStr !== targetPeriodStr) {
        console.log(`⚠️ PERIOD MISMATCH: pending=${pendingPeriodStr}, actual=${targetPeriodStr}`);
        return false;
    }

    if (processedPeriods.has(targetPeriodStr)) {
        console.log(`⚠️ Period ${targetPeriodStr} already processed`);
        return false;
    }

    const typeWin = pendingPrediction.prediction === currentType;
    const digitWin = pendingPrediction.digit === currentNumber;
    const win = typeWin || digitWin;

    processedPeriods.add(targetPeriodStr);

    history.push({
        period: targetPeriodStr,
        predicted: { type: pendingPrediction.prediction, digit: pendingPrediction.digit, confidence: pendingPrediction.confidence },
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
    
    return true;
}

// ======================== MAIN CYCLE ========================
async function processLoop() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        const data = await fetchData();
        if (!data || data.length < 4) {
            console.log('⚠️ Insufficient data from API');
            isProcessing = false;
            return;
        }

        const latest = data[0];
        const currentPeriod = String(latest.period).trim();
        const currentNumber = latest.number;
        const currentType = getBigSmall(currentNumber);

        currentActual = { period: currentPeriod, number: currentNumber, type: currentType };

        // Use the 3 MOST RECENT completed draws for prediction input
        // data[0] = just completed, data[1] = before that, data[2] = before that
        lastThreeNumbers = data.slice(0, 3).map(d => d.number);

        // FIRST RUN: Initialize and predict for the NEXT period
        if (isFirstRun) {
            if (lastThreeNumbers.length === 3) {
                const result = predictNumber(lastThreeNumbers[0], lastThreeNumbers[1], lastThreeNumbers[2]);
                
                // FIXED: Derive next period from API pattern
                // The period format is: 20260715100051098
                // We need to detect the next period number
                const nextPeriod = deriveNextPeriod(currentPeriod, data);

                pendingPrediction = {
                    period: nextPeriod,
                    prediction: result.prediction,
                    digit: result.digit,
                    confidence: result.confidence
                };
                lastPeriod = currentPeriod;
                isFirstRun = false;
                console.log(`🚀 Tracking Active. Target [${nextPeriod}] -> ${result.prediction} ${result.digit}`);
            }
            isProcessing = false;
            return;
        }

        // DETECT NEW PERIOD: currentPeriod changed from lastPeriod
        if (currentPeriod !== lastPeriod) {
            console.log(`\n🔄 NEW PERIOD DETECTED: ${lastPeriod} -> ${currentPeriod}`);

            // 1. Evaluate the prediction we made for THIS period (currentPeriod)
            const evaluated = trackGameResult(currentPeriod, currentNumber, currentType);

            // 2. Generate NEW prediction for the NEXT upcoming period
            if (lastThreeNumbers.length === 3) {
                const result = predictNumber(lastThreeNumbers[0], lastThreeNumbers[1], lastThreeNumbers[2]);
                const nextPeriod = deriveNextPeriod(currentPeriod, data);

                pendingPrediction = {
                    period: nextPeriod,
                    prediction: result.prediction,
                    digit: result.digit,
                    confidence: result.confidence
                };

                console.log(`──────────────────────────────────────────────────`);
                console.log(`🔮 Next Forecast: Period [${nextPeriod}]`);
                console.log(`🎯 Target: ${result.prediction} (${result.digit}) | Conf: ${result.confidence}%`);
                console.log(`📊 Based on draws: [${lastThreeNumbers.join(', ')}]`);
                console.log(`──────────────────────────────────────────────────`);
            }

            lastPeriod = currentPeriod;
        } else {
            // Same period, no new draw yet - just log heartbeat occasionally
            // console.log(`💤 Same period ${currentPeriod}, waiting...`);
        }

    } catch (error) {
        console.error('❌ Loop Error:', error.message);
    } finally {
        isProcessing = false;
    }
}

// ======================== PERIOD DERIVATION ========================
/**
 * Derives the next period number from the API response pattern.
 * 
 * From the API data:
 *   20260715100051098
 *   20260715100051097
 *   20260715100051096
 * 
 * The pattern appears to be: YYYYMMDD + someCounter
 * We detect the difference between consecutive periods to predict the next.
 */
function deriveNextPeriod(currentPeriod, data) {
    if (data.length >= 2) {
        const p0 = BigInt(data[0].period);
        const p1 = BigInt(data[1].period);
        const diff = p0 - p1; // Should be 1 for normal sequential periods
        
        // If difference is consistent, next = current + diff
        if (diff === 1n || diff === -1n) {
            return String(p0 + diff);
        }
    }
    
    // Fallback: try to parse and increment
    try {
        return String(BigInt(currentPeriod) + 1n);
    } catch (e) {
        // Ultimate fallback: append pattern
        const match = currentPeriod.match(/(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            return currentPeriod.replace(/(\d+)$/, String(num + 1).padStart(match[1].length, '0'));
        }
        return currentPeriod + '1';
    }
}

// ======================== RUN ========================
console.log('🚀 Initializing WinGo Tracker...');
processLoop();
setInterval(processLoop, 1500);

// ======================== API ========================
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'active',
        gameType: 'WinGo_30S',
        engineMod: 'DYNAMIC_TREND_V2',
        dataSource,
        currentPeriod: currentActual,
        nextPrediction: pendingPrediction ? {
            period: pendingPrediction.period,
            prediction: pendingPrediction.prediction,
            digit: pendingPrediction.digit,
            confidence: pendingPrediction.confidence + '%',
            historicalReferenceNumbers: lastThreeNumbers
        } : "Initializing...",
        stats: {
            totalPredictions: stats.totalPredictions,
            totalWins: stats.totalWins,
            totalLosses: stats.totalLosses,
            accuracy: stats.accuracy + '%'
        },
        recentHistory: history.slice(-10).reverse().map(h => ({
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
    lastPeriod = null;
    console.log('🔄 System reset');
    res.json({ message: '✅ Reset complete.' });
});

app.listen(PORT, () => {
    console.log(`📍 Dashboard: http://localhost:${PORT}/`);
});
