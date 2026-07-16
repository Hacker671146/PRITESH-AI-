const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

// ======================== STATE ========================
let state = {
    history: [],
    processedPeriods: new Set(),
    stats: { totalPredictions: 0, wins: 0, losses: 0, accuracy: 0 },
    pendingPrediction: null,
    lastProcessedPeriod: null,
    dataSource: 'initializing',
    isProcessing: false,
    lastError: null
};

// ======================== STRATEGY ENGINE ========================
function getBigSmall(num) {
    return num >= 5 ? "BIG" : "SMALL";
}

function analyzeTrendAndPredict(numbers) {
    if (!numbers || numbers.length < 3) return null;
    
    const recentThree = numbers.slice(0, 3);
    // Skip rule: if 0 or 5 in last 3 draws
    if (recentThree.some(n => n === 0 || n === 5)) {
        return { skip: true };
    }

    // Weighted trend analysis
    const [n1, n2, n3] = recentThree;
    const weightedAvg = (n1 * 0.5) + (n2 * 0.3) + (n3 * 0.2);
    const prediction = weightedAvg >= 4.5 ? "BIG" : "SMALL";
    
    // Frequency-based digit selection (exclude 0,5)
    const freq = {};
    numbers.slice(0, 10).forEach(n => {
        if (n !== 0 && n !== 5) freq[n] = (freq[n] || 0) + 1;
    });
    
    let topDigit = 1;
    let maxFreq = -1;
    for (let i = 1; i <= 9; i++) {
        if (i === 5) continue;
        if ((freq[i] || 0) > maxFreq) {
            maxFreq = freq[i];
            topDigit = i;
        }
    }

    const types = recentThree.map(getBigSmall);
    const consistent = types.every(t => t === types[0]);
    const confidence = consistent ? 85 : 60;

    return { prediction, digit: topDigit, confidence, skip: false };
}

// ======================== ADAPTIVE DATA FETCHER ========================
async function fetchData() {
    try {
        const res = await axios.get(API_URL, { 
            timeout: 5000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://hgnice.biz/'
            }
        });
        
        const data = res.data;
        let list = null;
        
        // Adaptive parsing for different API response structures
        if (data?.data?.list) list = data.data.list;
        else if (data?.list) list = data.list;
        else if (data?.result?.list) list = data.result.list;
        else if (Array.isArray(data)) list = data;
        else if (data?.data && Array.isArray(data.data)) list = data.data;
        
        if (list && list.length >= 3) {
            state.dataSource = 'live_api';
            state.lastError = null;
            return list.map(item => ({
                period: String(item.issueNumber || item.period || item.issue || item.id || ''),
                number: parseInt(item.number || item.num || item.result || item.open || 0, 10)
            })).filter(item => item.period !== '' && !isNaN(item.number));
        }
        
        throw new Error(`Invalid data structure. Keys: ${Object.keys(data || {}).join(', ')}`);
    } catch (e) {
        state.lastError = e.message;
        console.error(`⚠️ API Error: ${e.message}`);
    }

    // Fallback to local file
    try {
        if (fs.existsSync('./data.json')) {
            const raw = JSON.parse(fs.readFileSync('./data.json'));
            let list = raw?.data?.list || raw?.list || raw?.data || [];
            if (list.length >= 3) {
                state.dataSource = 'local_file';
                return list.map(i => ({ 
                    period: String(i.issueNumber || i.period || ''), 
                    number: parseInt(i.number || i.num || 0, 10) 
                })).filter(i => i.period !== '');
            }
        }
    } catch (e) {}

    state.dataSource = 'no_data';
    return [];
}

// ======================== TRACKING & EVALUATION ========================
function evaluatePendingResult(actualPeriod, actualNumber) {
    if (!state.pendingPrediction) return;

    const predPeriod = String(state.pendingPrediction.period);
    const actPeriod = String(actualPeriod);

    // FIXED: Allow evaluation if actual period >= predicted period (handles latency)
    if (actPeriod < predPeriod) return;
    if (state.processedPeriods.has(predPeriod)) return;

    const actualType = getBigSmall(actualNumber);
    const typeWin = state.pendingPrediction.prediction === actualType;
    const digitWin = state.pendingPrediction.digit === actualNumber;
    const isWin = typeWin || digitWin;

    state.stats.totalPredictions++;
    if (isWin) state.stats.wins++; else state.stats.losses++;
    state.stats.accuracy = state.stats.totalPredictions > 0 
        ? Math.round((state.stats.wins / state.stats.totalPredictions) * 100) 
        : 0;

    state.history.unshift({
        period: predPeriod,
        predicted: `${state.pendingPrediction.prediction}(${state.pendingPrediction.digit})`,
        actual: `${actualType}(${actualNumber})`,
        result: isWin ? '✅ WIN' : '❌ LOSS',
        timestamp: new Date().toISOString()
    });

    if (state.history.length > 20) state.history.pop();
    state.processedPeriods.add(predPeriod);

    console.log(`📊 [RESULT] Period: ${predPeriod} | Pred: ${state.pendingPrediction.prediction}(${state.pendingPrediction.digit}) | Actual: ${actualType}(${actualNumber}) | ${isWin ? '✅ WIN' : '❌ LOSS'}`);
    state.pendingPrediction = null;
}

function deriveNextPeriod(currentPeriod, dataList) {
    try {
        if (dataList.length >= 2) {
            const p0 = BigInt(dataList[0].period);
            const p1 = BigInt(dataList[1].period);
            const step = p0 - p1;
            if (step > 0n) return String(p0 + step);
        }
        return String(BigInt(currentPeriod) + 1n);
    } catch (e) {
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
            console.log('⚠️ Insufficient data, retrying...');
            state.isProcessing = false;
            return;
        }

        const latest = data[0];
        const currentPeriod = String(latest.period);
        const currentNumber = latest.number;

        // Evaluate previous prediction
        evaluatePendingResult(currentPeriod, currentNumber);

        // Generate new prediction only if no pending exists
        if (!state.pendingPrediction) {
            const numbers = data.map(d => d.number);
            const forecast = analyzeTrendAndPredict(numbers);

            if (forecast && !forecast.skip) {
                const nextPeriod = deriveNextPeriod(currentPeriod, data);
                state.pendingPrediction = {
                    period: nextPeriod,
                    prediction: forecast.prediction,
                    digit: forecast.digit,
                    confidence: forecast.confidence
                };
                state.lastProcessedPeriod = currentPeriod;
                console.log(`🔮 [PREDICTION] Target: ${nextPeriod} -> ${forecast.prediction}(${forecast.digit}) | Conf: ${forecast.confidence}%`);
            } else if (forecast && forecast.skip) {
                console.log(`⏭️ [SKIP] Next period skipped due to 0/5 rule`);
                state.lastProcessedPeriod = currentPeriod;
            } else {
                console.log('⚠️ Forecast generation failed');
            }
        }
    } catch (err) {
        state.lastError = err.message;
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
        lastError: state.lastError,
        nextPrediction: state.pendingPrediction || "Waiting for next cycle...",
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
    state.lastError = null;
    console.log('🔄 System Reset Complete');
    res.json({ message: '✅ Reset successful' });
});

// ======================== INITIALIZATION ========================
console.log('🚀 Starting WinGo 30S Tracker (Fixed v3)...');
processLoop();
setInterval(processLoop, 2000);

app.listen(PORT, () => console.log(`📍 API Running: http://localhost:${PORT}/`));
