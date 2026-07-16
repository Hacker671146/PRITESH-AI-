const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

// ======================== CONFIGURATION ========================
const SKIP_NUMBERS = [0, 5]; // User rule: Skip predictions if 0 or 5 appears in recent history
const HISTORY_SIZE = 20;     // Keep last 20 results for trend analysis

// ======================== STATE MANAGEMENT ========================
let state = {
    history: [],
    processedPeriods: new Set(),
    stats: { totalPredictions: 0, wins: 0, losses: 0, accuracy: 0 },
    pendingPrediction: null,
    lastProcessedPeriod: null,
    dataSource: 'initializing',
    isProcessing: false
};

// ======================== STRATEGY ENGINE ========================
function getBigSmall(num) {
    return num >= 5 ? "BIG" : "SMALL";
}

function analyzeTrendAndPredict(numbers) {
    // Rule: Skip if 0 or 5 is in the immediate last 3 draws
    const recentThree = numbers.slice(0, 3);
    if (recentThree.some(n => SKIP_NUMBERS.includes(n))) {
        return null; // Signal to skip this round
    }

    // Trend Analysis: Weighted average favoring most recent
    const [n1, n2, n3] = recentThree;
    const weightedSum = (n1 * 0.5) + (n2 * 0.3) + (n3 * 0.2);
    
    // Determine Big/Small based on trend
    const prediction = weightedSum >= 4.5 ? "BIG" : "SMALL";
    
    // Digit prediction based on frequency in last 10 draws
    const freq = {};
    numbers.slice(0, 10).forEach(n => freq[n] = (freq[n] || 0) + 1);
    let topDigit = 0;
    let maxFreq = -1;
    for (let i = 0; i <= 9; i++) {
        if ((freq[i] || 0) > maxFreq && !SKIP_NUMBERS.includes(i)) {
            maxFreq = freq[i];
            topDigit = i;
        }
    }

    // Confidence calculation based on trend consistency
    const types = recentThree.map(getBigSmall);
    const consistent = types.every(t => t === types[0]);
    const confidence = consistent ? 85 : 60;

    return { prediction, digit: topDigit, confidence };
}

// ======================== DATA FETCHER ========================
async function fetchData() {
    try {
        const res = await axios.get(API_URL, { 
            timeout: 3000,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://hgnice.biz/' }
        });
        
        if (res.data?.data?.list?.length >= 3) {
            state.dataSource = 'live_api';
            return res.data.data.list.map(item => ({
                period: String(item.issueNumber),
                number: parseInt(item.number, 10)
            }));
        }
    } catch (e) {
        console.error(`⚠️ API Fetch Error: ${e.message}`);
    }

    // Fallback to local file
    try {
        if (fs.existsSync('./data.json')) {
            const raw = JSON.parse(fs.readFileSync('./data.json'));
            if (raw?.data?.list) {
                state.dataSource = 'local_file';
                return raw.data.list.map(i => ({ period: String(i.issueNumber), number: parseInt(i.number) }));
            }
        }
    } catch (e) {}

    state.dataSource = 'mock_data';
    return []; 
}

// ======================== CORE TRACKING LOGIC (FIXED) ========================
function evaluatePendingResult(actualPeriod, actualNumber) {
    if (!state.pendingPrediction) return;

    const predPeriod = String(state.pendingPrediction.period);
    const actPeriod = String(actualPeriod);

    // FIXED: Strict period matching to prevent wrong W/L assignment
    if (predPeriod !== actPeriod) return;
    
    // Prevent double processing
    if (state.processedPeriods.has(actPeriod)) return;

    const actualType = getBigSmall(actualNumber);
    const typeWin = state.pendingPrediction.prediction === actualType;
    const digitWin = state.pendingPrediction.digit === actualNumber;
    const isWin = typeWin || digitWin; // Win if either Type OR Digit matches

    // Update Stats
    state.stats.totalPredictions++;
    if (isWin) state.stats.wins++; else state.stats.losses++;
    state.stats.accuracy = Math.round((state.stats.wins / state.stats.totalPredictions) * 100);

    // Save to History
    state.history.unshift({
        period: actPeriod,
        predicted: `${state.pendingPrediction.prediction}(${state.pendingPrediction.digit})`,
        actual: `${actualType}(${actualNumber})`,
        result: isWin ? '✅ WIN' : '❌ LOSS',
        timestamp: new Date().toISOString()
    });

    // Trim history
    if (state.history.length > HISTORY_SIZE) state.history.pop();
    state.processedPeriods.add(actPeriod);

    console.log(`📊 [RESULT] Period: ${actPeriod} | Pred: ${state.pendingPrediction.prediction} | Actual: ${actualType} | ${isWin ? '✅ WIN' : '❌ LOSS'}`);
    
    // Clear pending after evaluation
    state.pendingPrediction = null;
}

function deriveNextPeriod(currentPeriod, dataList) {
    try {
        // Use BigInt for safe arithmetic on long period strings
        if (dataList.length >= 2) {
            const p0 = BigInt(dataList[0].period);
            const p1 = BigInt(dataList[1].period);
            const step = p0 - p1;
            if (step > 0n) return String(p0 + step);
        }
        return String(BigInt(currentPeriod) + 1n);
    } catch (e) {
        // Regex fallback for non-standard formats
        const match = currentPeriod.match(/^(.*?)(\d+)$/);
        if (match) {
            const nextNum = parseInt(match[2], 10) + 1;
            return match[1] + String(nextNum).padStart(match[2].length, '0');
        }
        return currentPeriod + '1';
    }
}

// ======================== MAIN LOOP ========================
async function processLoop() {
    if (state.isProcessing) return;
    state.isProcessing = true;

    try {
        const data = await fetchData();
        if (!data || data.length < 3) {
            state.isProcessing = false;
            return;
        }

        const latest = data[0];
        const currentPeriod = String(latest.period);
        const currentNumber = latest.number;

        // 1. Check if we need to evaluate a previous prediction
        evaluatePendingResult(currentPeriod, currentNumber);

        // 2. Generate new prediction only if period changed and no pending exists
        if (currentPeriod !== state.lastProcessedPeriod && !state.pendingPrediction) {
            const numbers = data.map(d => d.number);
            const forecast = analyzeTrendAndPredict(numbers);

            if (forecast) {
                const nextPeriod = deriveNextPeriod(currentPeriod, data);
                state.pendingPrediction = {
                    period: nextPeriod,
                    ...forecast
                };
                state.lastProcessedPeriod = currentPeriod;
                console.log(`🔮 [NEW PREDICTION] Target: ${nextPeriod} -> ${forecast.prediction} (${forecast.digit}) | Conf: ${forecast.confidence}%`);
            } else {
                console.log(`⏭️ [SKIP] Period ${deriveNextPeriod(currentPeriod, data)} skipped due to 0/5 rule`);
                state.lastProcessedPeriod = currentPeriod;
            }
        }
    } catch (err) {
        console.error('❌ Loop Critical Error:', err.message);
    } finally {
        state.isProcessing = false;
    }
}

// ======================== EXPRESS API ========================
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'active',
        game: 'WinGo_30S',
        dataSource: state.dataSource,
        nextPrediction: state.pendingPrediction,
        stats: state.stats,
        history: state.history.slice(0, 10)
    });
});

app.post('/reset', (req, res) => {
    state.history = [];
    state.processedPeriods.clear();
    state.stats = { totalPredictions: 0, wins: 0, losses: 0, accuracy: 0 };
    state.pendingPrediction = null;
    state.lastProcessedPeriod = null;
    console.log('🔄 System Reset Complete');
    res.json({ message: '✅ Reset successful' });
});

// ======================== INITIALIZATION ========================
console.log('🚀 Starting WinGo 30S Tracker...');
processLoop();
setInterval(processLoop, 2000); // 2s interval for 30s game balance

app.listen(PORT, () => console.log(`📍 API Running: http://localhost:${PORT}/`));
