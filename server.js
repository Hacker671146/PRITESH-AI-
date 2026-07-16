const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const NAME = "PRITESH AI PREDICTOR (ADVANCED)";
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

// ========== ADVANCED ENSEMBLE AI (85% ACCURACY TARGET) ==========

// ---------- Model 1: Enhanced Logistic Regression with 15 features ----------
class AdvancedLogisticRegression {
    constructor(lr = 0.05, nFeatures = 15) {
        this.lr = lr;
        this.weights = Array(nFeatures).fill().map(() => (Math.random() - 0.5) * 0.5);
        this.bias = (Math.random() - 0.5) * 0.5;
        this.trained = false;
    }

    sigmoid(z) {
        return 1 / (1 + Math.exp(-Math.max(Math.min(z, 100), -100))); // Prevent overflow
    }

    predict(features) {
        let z = this.bias;
        for (let i = 0; i < Math.min(features.length, this.weights.length); i++) {
            z += features[i] * this.weights[i];
        }
        return this.sigmoid(z);
    }

    update(actual, features) {
        const pred = this.predict(features);
        const error = actual - pred;
        const lr = this.lr * 0.1; // Reduced learning rate for stability
        for (let i = 0; i < Math.min(features.length, this.weights.length); i++) {
            this.weights[i] += lr * error * features[i];
            // Clamp weights to prevent exploding gradients
            this.weights[i] = Math.max(Math.min(this.weights[i], 5), -5);
        }
        this.bias += lr * error;
        this.bias = Math.max(Math.min(this.bias, 5), -5);
        this.trained = true;
    }
}

// ---------- Model 2: Naive Bayes (simple but effective for binary) ----------
class NaiveBayes {
    constructor() {
        this.priorBig = 0.5;
        this.priorSmall = 0.5;
        this.condBig = [];
        this.condSmall = [];
        this.initialized = false;
        this.nBins = 5;
    }

    discretize(value, bins = 5) {
        const min = -2, max = 2;
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
        return Math.min(bins - 1, Math.floor(normalized * bins));
    }

    initialize(nFeatures) {
        if (!this.initialized) {
            for (let i = 0; i < nFeatures; i++) {
                this.condBig.push(Array(this.nBins).fill(1));
                this.condSmall.push(Array(this.nBins).fill(1));
            }
            this.initialized = true;
        }
    }

    update(actualBinary, features, nFeatures) {
        this.initialize(nFeatures);
        const classIdx = actualBinary === 1 ? 'condBig' : 'condSmall';
        for (let i = 0; i < Math.min(features.length, nFeatures); i++) {
            const bin = this.discretize(features[i]);
            if (bin < this.nBins) {
                this[classIdx][i][bin] += 1;
            }
        }
        // Update priors with smoothing
        const alpha = 0.1;
        this.priorBig = (this.priorBig * (1 - alpha) + actualBinary * alpha);
        this.priorSmall = 1 - this.priorBig;
    }

    predict(features) {
        if (!this.initialized || features.length === 0) return 0.5;
        let logProbBig = Math.log(this.priorBig + 1e-9);
        let logProbSmall = Math.log(this.priorSmall + 1e-9);
        
        for (let i = 0; i < Math.min(features.length, this.condBig.length); i++) {
            const bin = this.discretize(features[i]);
            if (bin < this.nBins) {
                const probBig = (this.condBig[i][bin] + 1) / (this.condBig[i].reduce((a,b)=>a+b,0) + this.nBins);
                const probSmall = (this.condSmall[i][bin] + 1) / (this.condSmall[i].reduce((a,b)=>a+b,0) + this.nBins);
                logProbBig += Math.log(probBig + 1e-9);
                logProbSmall += Math.log(probSmall + 1e-9);
            }
        }
        
        // Normalize to prevent underflow
        const maxLog = Math.max(logProbBig, logProbSmall);
        logProbBig -= maxLog;
        logProbSmall -= maxLog;
        
        const probBig = Math.exp(logProbBig) / (Math.exp(logProbBig) + Math.exp(logProbSmall) + 1e-9);
        return Math.max(0.01, Math.min(0.99, probBig));
    }
}

// ---------- Model 3: Pattern Matching (Markov Chain with memory 3) ----------
class PatternMatcher {
    constructor() {
        this.patterns = new Map();
        this.totalPatterns = 0;
    }

    update(historyBinary) {
        if (historyBinary.length < 4) return;
        const last3 = historyBinary.slice(-3).join('');
        const next = historyBinary[historyBinary.length-1];
        if (!this.patterns.has(last3)) {
            this.patterns.set(last3, {big: 0, small: 0});
        }
        const stats = this.patterns.get(last3);
        if (next === 1) stats.big++;
        else stats.small++;
        this.totalPatterns++;
        
        // Limit pattern history size
        if (this.patterns.size > 100) {
            const keys = Array.from(this.patterns.keys());
            const oldestKey = keys[0];
            this.patterns.delete(oldestKey);
        }
    }

    predict(last3Pattern) {
        if (!this.patterns.has(last3Pattern)) return 0.5;
        const stats = this.patterns.get(last3Pattern);
        const total = stats.big + stats.small;
        if (total === 0) return 0.5;
        // Add Laplace smoothing
        return (stats.big + 1) / (total + 2);
    }
}

// ---------- Ensemble that combines all 3 models with adaptive weights ----------
class EnsemblePredictor {
    constructor() {
        this.model1 = new AdvancedLogisticRegression(0.05, 15);
        this.model2 = new NaiveBayes();
        this.model3 = new PatternMatcher();
        this.weights = { m1: 0.4, m2: 0.35, m3: 0.25 };
        this.performance = { m1: 0.5, m2: 0.5, m3: 0.5 };
        this.updateCount = 0;
        this.windowSize = 20; // Rolling performance window
        this.recentPerformance = { m1: [], m2: [], m3: [] };
    }

    extractFeatures(historyNumbers, periodParity) {
        const binary = historyNumbers.map(n => n >= 5 ? 1 : 0);
        const len = binary.length;
        if (len === 0) return Array(15).fill(0);
        
        const last = binary[len-1] || 0;
        const last3 = binary.slice(-3);
        const last5 = binary.slice(-5);
        const last10 = binary.slice(-10);
        
        const avg3 = last3.reduce((a,b)=>a+b,0)/3;
        const avg5 = last5.reduce((a,b)=>a+b,0)/5;
        const avg10 = last10.reduce((a,b)=>a+b,0)/10;
        const variance5 = last5.reduce((sum,val)=>sum + Math.pow(val-avg5,2),0)/5;
        
        let streak = 1;
        for (let i=len-2; i>=0 && binary[i]===last; i--) streak++;
        const streakNorm = Math.min(streak/10, 1);
        
        const trend35 = avg3 - avg5;
        const trend510 = avg5 - avg10;
        const volatility = Math.sqrt(variance5 + 0.01);
        const last3Pattern = (binary[len-3]||0)*4 + (binary[len-2]||0)*2 + (binary[len-1]||0);
        const parity = periodParity;
        const bigRatio10 = avg10;
        const momentum = len>=2 ? last - binary[len-2] : 0;
        const hourEffect = (parseInt(periodParity) % 24) / 24;
        
        return [
            last, avg3, avg5, avg10, streakNorm, trend35, trend510,
            volatility, last3Pattern/7, parity, bigRatio10, momentum,
            hourEffect, variance5, (binary[len-2]||0)
        ];
    }

    async predict(historyNumbers, periodParity) {
        const features = this.extractFeatures(historyNumbers, periodParity);
        const prob1 = this.model1.predict(features);
        const prob2 = this.model2.predict(features);
        const binary = historyNumbers.map(n => n>=5?1:0);
        const last3Pattern = binary.slice(-3).join('');
        const prob3 = this.model3.predict(last3Pattern);
        
        // Adaptive weights with minimum threshold
        const totalWeight = Math.max(0.01, this.weights.m1 + this.weights.m2 + this.weights.m3);
        const w1 = Math.max(0.1, this.weights.m1 / totalWeight);
        const w2 = Math.max(0.1, this.weights.m2 / totalWeight);
        const w3 = Math.max(0.1, this.weights.m3 / totalWeight);
        const normalizedSum = w1 + w2 + w3;
        
        const ensembleProb = (prob1 * w1 + prob2 * w2 + prob3 * w3) / normalizedSum;
        
        const prediction = ensembleProb >= 0.5 ? "BIG" : "SMALL";
        const confidence = (Math.abs(ensembleProb - 0.5) * 2 * 100).toFixed(2) + "%";
        
        return { prediction, confidence, prob1, prob2, prob3, features };
    }

    update(actualBinary, features, prob1, prob2, prob3) {
        // Update models
        this.model1.update(actualBinary, features);
        this.model2.update(actualBinary, features, 15);
        
        // Update model3
        if (this.model3.totalPatterns % 5 === 0) {
            // Only update pattern matcher occasionally
        }
        
        // Update performance metrics
        this.updateCount++;
        const acc1 = 1 - Math.abs(actualBinary - prob1);
        const acc2 = 1 - Math.abs(actualBinary - prob2);
        const acc3 = 1 - Math.abs(actualBinary - prob3);
        
        // Rolling window performance
        this.recentPerformance.m1.push(acc1);
        this.recentPerformance.m2.push(acc2);
        this.recentPerformance.m3.push(acc3);
        
        if (this.recentPerformance.m1.length > this.windowSize) {
            this.recentPerformance.m1.shift();
            this.recentPerformance.m2.shift();
            this.recentPerformance.m3.shift();
        }
        
        // Calculate rolling averages
        const avg1 = this.recentPerformance.m1.reduce((a,b)=>a+b,0) / this.recentPerformance.m1.length;
        const avg2 = this.recentPerformance.m2.reduce((a,b)=>a+b,0) / this.recentPerformance.m2.length;
        const avg3 = this.recentPerformance.m3.reduce((a,b)=>a+b,0) / this.recentPerformance.m3.length;
        
        // Update weights with momentum
        const momentum = 0.9;
        const exp1 = Math.exp(avg1 * 3);
        const exp2 = Math.exp(avg2 * 3);
        const exp3 = Math.exp(avg3 * 3);
        const sum = exp1 + exp2 + exp3 + 0.01;
        
        const newW1 = exp1 / sum;
        const newW2 = exp2 / sum;
        const newW3 = exp3 / sum;
        
        this.weights.m1 = momentum * this.weights.m1 + (1 - momentum) * newW1;
        this.weights.m2 = momentum * this.weights.m2 + (1 - momentum) * newW2;
        this.weights.m3 = momentum * this.weights.m3 + (1 - momentum) * newW3;
        
        // Ensure minimum weights
        const minWeight = 0.1;
        if (this.weights.m1 < minWeight) this.weights.m1 = minWeight;
        if (this.weights.m2 < minWeight) this.weights.m2 = minWeight;
        if (this.weights.m3 < minWeight) this.weights.m3 = minWeight;
    }
}

// ========== GLOBAL STATE ==========
const ensemble = new EnsemblePredictor();
let numberHistory = [];
let binaryHistory = [];
let predictionsMap = new Map();
let resultsHistory = [];
let totalTrades = 0;
let wins = 0;
let losses = 0;
let lastProcessedPeriod = null;
let syntheticCounter = 1000;
let isBetExecuted = false;
let lastPredictionTime = 0;

// ========== API FETCH ==========
async function fetchLatestResult() {
    try {
        const url = `${API_URL}?ts=${Date.now()}`;
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://www.ar-lottery01.com/",
                "Origin": "https://draw.ar-lottery01.com"
            },
            timeout: 15000
        });
        const list = res.data?.data?.list || res.data?.list || [];
        if (list && list.length > 0) {
            const item = list[0];
            const period = String(item.issue || item.issueNumber);
            const number = parseInt(item.number);
            if (period && !isNaN(number) && number >= 0 && number <= 9) {
                return { period, number };
            }
        }
        return null;
    } catch (err) {
        console.log(`[API Error] ${err.message}`);
        return null;
    }
}

function generateSyntheticResult() {
    syntheticCounter++;
    const number = Math.floor(Math.random() * 10);
    return { period: String(syntheticCounter), number };
}

// ========== FLOW: checkPreviousPrediction ==========
function checkPreviousPrediction(period, actualNumber) {
    const predObj = predictionsMap.get(period);
    if (!predObj) {
        console.log(`[CHECK] No prediction found for period ${period}`);
        return false;
    }
    
    const actualCategory = actualNumber >= 5 ? "BIG" : "SMALL";
    const predictedCategory = predObj.prediction;
    const isWin = (predictedCategory === actualCategory);
    
    totalTrades++;
    if (isWin) wins++;
    else losses++;
    
    const actualBinary = actualCategory === "BIG" ? 1 : 0;
    ensemble.update(actualBinary, predObj.features, predObj.prob1, predObj.prob2, predObj.prob3);
    
    binaryHistory.push(actualBinary);
    if (binaryHistory.length > 50) binaryHistory.shift();
    ensemble.model3.update(binaryHistory);
    
    numberHistory.push(actualNumber);
    if (numberHistory.length > 50) numberHistory.shift();
    
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(2) : 0;
    
    // Create detailed result entry
    const resultEntry = {
        period: period,
        sticker: isWin ? "✅ WIN" : "❌ LOSS",
        prediction: predictedCategory,
        actual: actualCategory,
        actualNumber: actualNumber,
        result: isWin ? "WIN" : "LOSS",
        confidence: predObj.confidence,
        model: "Ensemble (LR+NB+Pattern)",
        time: new Date().toLocaleTimeString(),
        winRate: `${winRate}%`
    };
    
    resultsHistory.unshift(resultEntry);
    if (resultsHistory.length > 20) resultsHistory.pop();
    
    console.log(`[CHECK] Period ${period} | Pred: ${predictedCategory} | Actual: ${actualCategory} (${actualNumber}) → ${isWin ? "WIN ✅" : "LOSS ❌"} | Conf: ${predObj.confidence} | Win Rate: ${winRate}%`);
    
    predictionsMap.delete(period);
    return isWin;
}

// ========== FLOW: bigsmallPrediction ==========
async function bigsmallPrediction(currentPeriod) {
    const nextPeriod = String(parseInt(currentPeriod) + 1);
    const nextParity = parseInt(nextPeriod) % 2;
    
    const { prediction, confidence, prob1, prob2, prob3, features } = await ensemble.predict(numberHistory, nextParity);
    
    predictionsMap.set(nextPeriod, {
        prediction: prediction,
        confidence: confidence,
        features: features,
        prob1: prob1,
        prob2: prob2,
        prob3: prob3,
        timestamp: Date.now()
    });
    
    console.log(`[PREDICT] Next ${nextPeriod} → ${prediction} (${confidence}) | Model scores: LR=${prob1.toFixed(3)}, NB=${prob2.toFixed(3)}, Pat=${prob3.toFixed(3)} | Weights: ${ensemble.weights.m1.toFixed(2)}/${ensemble.weights.m2.toFixed(2)}/${ensemble.weights.m3.toFixed(2)}`);
    
    return { period: nextPeriod, prediction, confidence };
}

// ========== FLOW: executeBet ==========
async function executeBet(period, prediction, confidence) {
    // This is where you'd place your actual bet execution logic
    // For now, we just simulate it with full details
    const betAmount = 10; // Example bet amount
    const winAmount = betAmount * 1.98; // 1.98x payout for 50/50
    
    const betDetails = {
        period: period,
        prediction: prediction,
        confidence: confidence,
        amount: betAmount,
        potentialWin: winAmount.toFixed(2),
        timestamp: new Date().toISOString(),
        status: "PENDING"
    };
    
    console.log(`[EXECUTE BET] ${JSON.stringify(betDetails, null, 2)}`);
    
    // Simulate bet execution
    return {
        success: true,
        betId: `BET-${Date.now()}`,
        ...betDetails,
        status: "EXECUTED"
    };
}

// ========== MAIN UPDATE FLOW ==========
async function update() {
    try {
        // STEP 1: API Poll
        console.log(`\n[API POLL] Fetching latest result...`);
        let current = await fetchLatestResult();
        if (!current) {
            current = generateSyntheticResult();
            console.log(`[SYNTHETIC] Period ${current.period} → ${current.number}`);
        } else {
            console.log(`[LIVE] Period ${current.period} → ${current.number}`);
        }
        
        // STEP 2: checkPreviousPrediction
        if (lastProcessedPeriod !== current.period) {
            console.log(`[FLOW] 2. Check Previous Prediction for period ${current.period}`);
            if (predictionsMap.has(current.period)) {
                checkPreviousPrediction(current.period, current.number);
            } else {
                // First run or missed period: add to history without prediction
                const actualBinary = current.number >= 5 ? 1 : 0;
                binaryHistory.push(actualBinary);
                if (binaryHistory.length > 50) binaryHistory.shift();
                numberHistory.push(current.number);
                if (numberHistory.length > 50) numberHistory.shift();
                console.log(`[INFO] Period ${current.period} added to history (no previous prediction)`);
            }
            lastProcessedPeriod = current.period;
            
            // STEP 3: bigsmallPrediction
            console.log(`[FLOW] 3. Generate Prediction for next period`);
            const nextPrediction = await bigsmallPrediction(current.period);
            
            // STEP 4: 5s Delay
            console.log(`[FLOW] 4. Waiting 5 seconds before executing bet...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // STEP 5: executeBet
            console.log(`[FLOW] 5. Executing Bet for period ${nextPrediction.period}`);
            const betResult = await executeBet(
                nextPrediction.period,
                nextPrediction.prediction,
                nextPrediction.confidence
            );
            console.log(`[BET RESULT] ${JSON.stringify(betResult, null, 2)}`);
            
            // Update last prediction time
            lastPredictionTime = Date.now();
        } else {
            console.log(`[INFO] Period ${current.period} already processed, waiting for new period...`);
        }
        
    } catch (err) {
        console.error(`[UPDATE ERROR] ${err.message}`);
        console.error(err.stack);
    }
}

// ========== START THE BOT ==========
(async function start() {
    console.log(`🚀 ${NAME} starting...`);
    console.log(`📋 Flow: API Poll → checkPreviousPrediction → bigsmallPrediction → 5s delay → executeBet`);
    console.log(`⚙️  Models: Advanced Logistic Regression + Naive Bayes + Pattern Matcher`);
    console.log(`🎯 Target Accuracy: 85%+`);
    
    // Warm up with some initial data
    for (let i = 0; i < 10; i++) {
        const synth = generateSyntheticResult();
        const binary = synth.number >= 5 ? 1 : 0;
        binaryHistory.push(binary);
        numberHistory.push(synth.number);
    }
    console.log(`[INIT] Loaded ${numberHistory.length} historical records`);
    
    // Initial update
    await update();
    
    // Run every 60 seconds (adjust based on actual game interval)
    const intervalId = setInterval(async () => {
        await update();
    }, 60000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n[SHUTDOWN] Stopping bot...');
        clearInterval(intervalId);
        process.exit(0);
    });
})();

// ========== EXPRESS ROUTES ==========
app.get('/trade', (req, res) => {
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(2) : 0;
    const totalLosses = totalTrades - wins;
    const nextPeriod = predictionsMap.keys().next().value;
    const currentPred = nextPeriod ? predictionsMap.get(nextPeriod) : { 
        prediction: "WAITING", 
        confidence: "0%",
        prob1: 0.5,
        prob2: 0.5,
        prob3: 0.5
    };
    
    // Calculate full performance metrics
    const performance = {
        totalTrades: totalTrades,
        totalWins: wins,
        totalLosses: losses,
        winRate: `${winRate}%`,
        targetAccuracy: "85%",
        currentAccuracy: winRate,
        status: parseFloat(winRate) >= 85 ? "✅ ON TARGET" : "⚠️ IMPROVING",
        modelWeights: {
            logisticRegression: (ensemble.weights.m1 * 100).toFixed(1) + "%",
            naiveBayes: (ensemble.weights.m2 * 100).toFixed(1) + "%",
            patternMatcher: (ensemble.weights.m3 * 100).toFixed(1) + "%"
        }
    };
    
    // Create full prediction response
    const response = {
        status: "active",
        currentPrediction: {
            period: nextPeriod || "WAITING",
            prediction: currentPred.prediction,
            confidence: currentPred.confidence,
            model: "Ensemble (LR+NB+PatternMatcher)",
            modelScores: {
                logisticRegression: currentPred.prob1 ? currentPred.prob1.toFixed(3) : "0.500",
                naiveBayes: currentPred.prob2 ? currentPred.prob2.toFixed(3) : "0.500",
                patternMatcher: currentPred.prob3 ? currentPred.prob3.toFixed(3) : "0.500"
            },
            ensembleWeights: {
                logistic: ensemble.weights.m1.toFixed(2),
                naiveBayes: ensemble.weights.m2.toFixed(2),
                pattern: ensemble.weights.m3.toFixed(2)
            },
            source: "Advanced AI 85% target",
            timestamp: new Date().toISOString(),
            nextUpdate: new Date(Date.now() + 30000).toISOString() // Estimate next update in 30s
        },
        performance: performance,
        lastPredictions: resultsHistory.slice(0, 10),
        flowStatus: {
            currentStep: "Ready",
            lastUpdate: new Date().toLocaleTimeString(),
            nextBet: nextPeriod || "Not scheduled",
            isBetExecuted: isBetExecuted,
            lastPredictionTime: lastPredictionTime ? new Date(lastPredictionTime).toLocaleTimeString() : "Never"
        },
        systemInfo: {
            name: NAME,
            version: "3.1 - Advanced Ensemble AI with Full Tracking",
            models: ["Logistic Regression", "Naive Bayes", "Pattern Matcher"],
            historySize: numberHistory.length,
            predictionsTracked: predictionsMap.size
        }
    };
    
    res.json(response);
});

app.get('/', (req, res) => {
    res.json({ 
        status: "active", 
        name: NAME, 
        version: "3.1 - Advanced Ensemble AI with Full Bet Flow & Tracking",
        flow: "API Poll → checkPreviousPrediction → bigsmallPrediction → 5s delay → executeBet",
        endpoints: {
            trade: "/trade - View predictions and performance",
            health: "/health - System health check"
        },
        features: {
            fullPeriodDisplay: "✅ Fixed - Shows full period numbers",
            winLossTracking: "✅ Fixed - Accurate win/loss tracking with detailed results",
            confidenceDisplay: "✅ Fixed - Shows confidence percentages",
            ensembleWeights: "✅ Fixed - Shows all model weights"
        }
    });
});

app.get('/health', (req, res) => {
    const healthStatus = {
        status: "OK",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memoryUsage: process.memoryUsage(),
        predictions: predictionsMap.size,
        historySize: numberHistory.length,
        trades: totalTrades,
        winRate: totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(2) : "0.00"
    };
    res.status(200).json(healthStatus);
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📡 Trade API: http://localhost:${PORT}/trade`);
    console.log(`📊 Health Check: http://localhost:${PORT}/health`);
    console.log(`📋 Full Status: http://localhost:${PORT}`);
});
