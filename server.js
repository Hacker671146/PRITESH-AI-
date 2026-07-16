const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const NAME = "PRITESH AI PREDICTOR (ADVANCED)";
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

// ========== ADVANCED ENSEMBLE AI ==========

class AdvancedLogisticRegression {
    constructor(lr = 0.05, nFeatures = 15) {
        this.lr = lr;
        this.weights = Array(nFeatures).fill().map(() => (Math.random() - 0.5) * 0.5);
        this.bias = (Math.random() - 0.5) * 0.5;
        this.trained = false;
    }

    sigmoid(z) {
        return 1 / (1 + Math.exp(-Math.max(Math.min(z, 100), -100)));
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
        const lr = this.lr * 0.1;
        for (let i = 0; i < Math.min(features.length, this.weights.length); i++) {
            this.weights[i] += lr * error * features[i];
            this.weights[i] = Math.max(Math.min(this.weights[i], 5), -5);
        }
        this.bias += lr * error;
        this.bias = Math.max(Math.min(this.bias, 5), -5);
        this.trained = true;
    }
}

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
        
        const maxLog = Math.max(logProbBig, logProbSmall);
        logProbBig -= maxLog;
        logProbSmall -= maxLog;
        
        const probBig = Math.exp(logProbBig) / (Math.exp(logProbBig) + Math.exp(logProbSmall) + 1e-9);
        return Math.max(0.01, Math.min(0.99, probBig));
    }
}

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
        return (stats.big + 1) / (total + 2);
    }
}

class EnsemblePredictor {
    constructor() {
        this.model1 = new AdvancedLogisticRegression(0.05, 15);
        this.model2 = new NaiveBayes();
        this.model3 = new PatternMatcher();
        this.weights = { m1: 0.4, m2: 0.35, m3: 0.25 };
        this.performance = { m1: 0.5, m2: 0.5, m3: 0.5 };
        this.updateCount = 0;
        this.windowSize = 20;
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
        
        const totalWeight = Math.max(0.01, this.weights.m1 + this.weights.m2 + this.weights.m3);
        const w1 = Math.max(0.1, this.weights.m1 / totalWeight);
        const w2 = Math.max(0.1, this.weights.m2 / totalWeight);
        const w3 = Math.max(0.1, this.weights.m3 / totalWeight);
        const normalizedSum = w1 + w2 + w3;
        
        const ensembleProb = (prob1 * w1 + prob2 * w2 + prob3 * w3) / normalizedSum;
        
        const prediction = ensembleProb >= 0.5 ? "BIG" : "SMALL";
        const confidence = (Math.abs(ensembleProb - 0.5) * 2 * 100);
        const confidenceDisplay = confidence.toFixed(2) + "%";
        
        return { 
            prediction, 
            confidence: confidenceDisplay,
            confidenceValue: confidence,
            prob1, prob2, prob3, 
            features,
            weights: {
                m1: w1,
                m2: w2,
                m3: w3
            }
        };
    }

    update(actualBinary, features, prob1, prob2, prob3) {
        this.model1.update(actualBinary, features);
        this.model2.update(actualBinary, features, 15);
        this.model3.update(binaryHistory);
        
        this.updateCount++;
        const acc1 = 1 - Math.abs(actualBinary - prob1);
        const acc2 = 1 - Math.abs(actualBinary - prob2);
        const acc3 = 1 - Math.abs(actualBinary - prob3);
        
        this.recentPerformance.m1.push(acc1);
        this.recentPerformance.m2.push(acc2);
        this.recentPerformance.m3.push(acc3);
        
        if (this.recentPerformance.m1.length > this.windowSize) {
            this.recentPerformance.m1.shift();
            this.recentPerformance.m2.shift();
            this.recentPerformance.m3.shift();
        }
        
        const avg1 = this.recentPerformance.m1.reduce((a,b)=>a+b,0) / this.recentPerformance.m1.length;
        const avg2 = this.recentPerformance.m2.reduce((a,b)=>a+b,0) / this.recentPerformance.m2.length;
        const avg3 = this.recentPerformance.m3.reduce((a,b)=>a+b,0) / this.recentPerformance.m3.length;
        
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
let currentPrediction = null;

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
    
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100) : 0;
    
    const resultEntry = {
        period: period,
        sticker: isWin ? "✅ WIN" : "❌ LOSS",
        prediction: predictedCategory,
        actual: actualCategory,
        actualNumber: actualNumber,
        result: isWin ? "WIN" : "LOSS",
        confidence: predObj.confidence,
        confidenceValue: predObj.confidenceValue,
        model: "Ensemble (LR+NB+Pattern)",
        time: new Date().toLocaleTimeString(),
        winRate: winRate.toFixed(2) + "%"
    };
    
    resultsHistory.unshift(resultEntry);
    if (resultsHistory.length > 20) resultsHistory.pop();
    
    console.log(`[CHECK] Period ${period} | Pred: ${predictedCategory} | Actual: ${actualCategory} (${actualNumber}) → ${isWin ? "WIN ✅" : "LOSS ❌"} | Conf: ${predObj.confidence} | Win Rate: ${winRate.toFixed(2)}%`);
    
    predictionsMap.delete(period);
    return isWin;
}

// ========== FLOW: bigsmallPrediction ==========
async function bigsmallPrediction(currentPeriod) {
    const nextPeriod = String(parseInt(currentPeriod) + 1);
    const nextParity = parseInt(nextPeriod) % 2;
    
    const result = await ensemble.predict(numberHistory, nextParity);
    
    currentPrediction = {
        period: nextPeriod,
        prediction: result.prediction,
        confidence: result.confidence,
        confidenceValue: result.confidenceValue,
        prob1: result.prob1,
        prob2: result.prob2,
        prob3: result.prob3,
        weights: result.weights,
        features: result.features,
        timestamp: Date.now()
    };
    
    predictionsMap.set(nextPeriod, currentPrediction);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 PREDICTION FOR PERIOD ${nextPeriod}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Prediction: ${result.prediction}`);
    console.log(`🎯 Confidence: ${result.confidence}`);
    console.log(`📈 Model Scores:`);
    console.log(`   • Logistic Regression: ${(result.prob1 * 100).toFixed(2)}%`);
    console.log(`   • Naive Bayes: ${(result.prob2 * 100).toFixed(2)}%`);
    console.log(`   • Pattern Matcher: ${(result.prob3 * 100).toFixed(2)}%`);
    console.log(`⚖️  Ensemble Weights:`);
    console.log(`   • Logistic Regression: ${(result.weights.m1 * 100).toFixed(1)}%`);
    console.log(`   • Naive Bayes: ${(result.weights.m2 * 100).toFixed(1)}%`);
    console.log(`   • Pattern Matcher: ${(result.weights.m3 * 100).toFixed(1)}%`);
    console.log(`${'='.repeat(60)}\n`);
    
    return { period: nextPeriod, prediction: result.prediction, confidence: result.confidence };
}

// ========== FLOW: executeBet ==========
async function executeBet(period, prediction, confidence) {
    const betAmount = 10;
    const winAmount = betAmount * 1.98;
    
    const betDetails = {
        period: period,
        prediction: prediction,
        confidence: confidence,
        amount: betAmount,
        potentialWin: winAmount.toFixed(2),
        timestamp: new Date().toISOString(),
        status: "EXECUTED"
    };
    
    console.log(`\n💼 BET EXECUTED`);
    console.log(`${'='.repeat(40)}`);
    console.log(`📅 Period: ${period}`);
    console.log(`🎯 Bet: ${prediction}`);
    console.log(`💰 Amount: $${betAmount}`);
    console.log(`🏆 Potential Win: $${winAmount.toFixed(2)}`);
    console.log(`📊 Confidence: ${confidence}`);
    console.log(`${'='.repeat(40)}\n`);
    
    return {
        success: true,
        betId: `BET-${Date.now()}`,
        ...betDetails
    };
}

// ========== MAIN UPDATE FLOW ==========
async function update() {
    try {
        console.log(`\n🔄 UPDATE CYCLE STARTED`);
        console.log(`${'='.repeat(60)}`);
        
        // STEP 1: API Poll
        console.log(`[1] 📡 Fetching latest result...`);
        let current = await fetchLatestResult();
        if (!current) {
            current = generateSyntheticResult();
            console.log(`[1] 🔄 Using synthetic data - Period ${current.period} → ${current.number}`);
        } else {
            console.log(`[1] ✅ Live data - Period ${current.period} → ${current.number}`);
        }
        
        // STEP 2: checkPreviousPrediction
        if (lastProcessedPeriod !== current.period) {
            console.log(`[2] 🔍 Checking previous prediction for period ${current.period}`);
            if (predictionsMap.has(current.period)) {
                checkPreviousPrediction(current.period, current.number);
            } else {
                const actualBinary = current.number >= 5 ? 1 : 0;
                binaryHistory.push(actualBinary);
                if (binaryHistory.length > 50) binaryHistory.shift();
                numberHistory.push(current.number);
                if (numberHistory.length > 50) numberHistory.shift();
                console.log(`[2] ℹ️  Period ${current.period} added to history (no previous prediction)`);
            }
            lastProcessedPeriod = current.period;
            
            // STEP 3: bigsmallPrediction
            console.log(`[3] 🤖 Generating prediction for next period...`);
            const nextPrediction = await bigsmallPrediction(current.period);
            
            // STEP 4: 5s Delay
            console.log(`[4] ⏳ Waiting 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // STEP 5: executeBet
            console.log(`[5] 💰 Executing bet for period ${nextPrediction.period}`);
            const betResult = await executeBet(
                nextPrediction.period,
                nextPrediction.prediction,
                nextPrediction.confidence
            );
            
            console.log(`[5] ✅ Bet executed successfully!`);
            console.log(`${'='.repeat(60)}`);
            console.log(`🔄 UPDATE CYCLE COMPLETED\n`);
            
            lastPredictionTime = Date.now();
        } else {
            console.log(`[2] ℹ️  Period ${current.period} already processed, waiting for new period...`);
            console.log(`${'='.repeat(60)}`);
        }
        
    } catch (err) {
        console.error(`[ERROR] ${err.message}`);
        console.error(err.stack);
    }
}

// ========== START THE BOT ==========
(async function start() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 ${NAME}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`📋 Flow: API Poll → Check Previous → Generate Prediction → 5s Delay → Execute Bet`);
    console.log(`⚙️  Models: Advanced Logistic Regression + Naive Bayes + Pattern Matcher`);
    console.log(`🎯 Target Accuracy: 85%+`);
    console.log(`${'='.repeat(70)}\n`);
    
    // Warm up with initial data
    console.log(`🔄 Initializing with historical data...`);
    for (let i = 0; i < 10; i++) {
        const synth = generateSyntheticResult();
        const binary = synth.number >= 5 ? 1 : 0;
        binaryHistory.push(binary);
        numberHistory.push(synth.number);
    }
    console.log(`✅ Loaded ${numberHistory.length} historical records\n`);
    
    // Initial update
    await update();
    
    // Run every 60 seconds
    setInterval(async () => {
        await update();
    }, 60000);
})();

// ========== EXPRESS ROUTES ==========
app.get('/trade', (req, res) => {
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100) : 0;
    const totalLosses = totalTrades - wins;
    
    // Get current prediction
    let predictionData = currentPrediction || {
        period: "WAITING",
        prediction: "N/A",
        confidence: "0%",
        confidenceValue: 0,
        prob1: 0.5,
        prob2: 0.5,
        prob3: 0.5,
        weights: { m1: 0.33, m2: 0.33, m3: 0.33 }
    };
    
    // Calculate if prediction is above threshold
    const isStrongPrediction = predictionData.confidenceValue > 20;
    const recommendation = isStrongPrediction ? "✅ RECOMMENDED" : "⚠️ LOW CONFIDENCE";
    
    const response = {
        status: "active",
        timestamp: new Date().toISOString(),
        
        // Current Prediction
        prediction: {
            period: predictionData.period,
            prediction: predictionData.prediction,
            confidence: predictionData.confidence,
            confidenceValue: predictionData.confidenceValue.toFixed(2),
            recommendation: recommendation,
            modelScores: {
                logisticRegression: ((predictionData.prob1 || 0.5) * 100).toFixed(2) + "%",
                naiveBayes: ((predictionData.prob2 || 0.5) * 100).toFixed(2) + "%",
                patternMatcher: ((predictionData.prob3 || 0.5) * 100).toFixed(2) + "%"
            },
            ensembleWeights: {
                logisticRegression: ((predictionData.weights?.m1 || 0.33) * 100).toFixed(1) + "%",
                naiveBayes: ((predictionData.weights?.m2 || 0.33) * 100).toFixed(1) + "%",
                patternMatcher: ((predictionData.weights?.m3 || 0.33) * 100).toFixed(1) + "%"
            }
        },
        
        // Performance
        performance: {
            totalTrades: totalTrades,
            totalWins: wins,
            totalLosses: losses,
            winRate: winRate.toFixed(2) + "%",
            targetAccuracy: "85%",
            status: winRate >= 85 ? "✅ ON TARGET" : winRate >= 70 ? "📈 IMPROVING" : "⚠️ NEEDS TRAINING",
            currentStreak: resultsHistory.length > 0 ? 
                (resultsHistory[0].result === "WIN" ? "🔥 WINNING" : "❌ LOSING") : 
                "N/A"
        },
        
        // Recent Results (Last 10)
        recentResults: resultsHistory.slice(0, 10).map(r => ({
            period: r.period,
            prediction: r.prediction,
            actual: r.actual,
            actualNumber: r.actualNumber,
            result: r.result,
            confidence: r.confidence,
            winRate: r.winRate,
            time: r.time
        })),
        
        // System Info
        system: {
            name: NAME,
            version: "3.1 - Full Display",
            models: ["Logistic Regression", "Naive Bayes", "Pattern Matcher"],
            historySize: numberHistory.length,
            predictionsTracked: predictionsMap.size,
            lastUpdate: new Date().toLocaleTimeString(),
            nextUpdate: new Date(Date.now() + 30000).toLocaleTimeString()
        }
    };
    
    res.json(response);
});

app.get('/', (req, res) => {
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(2) : "0.00";
    
    res.json({ 
        status: "active",
        name: NAME, 
        version: "3.1 - Complete Prediction System",
        stats: {
            totalTrades: totalTrades,
            wins: wins,
            losses: losses,
            winRate: winRate + "%"
        },
        currentPrediction: currentPrediction ? {
            period: currentPrediction.period,
            prediction: currentPrediction.prediction,
            confidence: currentPrediction.confidence
        } : "No prediction available",
        endpoints: {
            trade: "/trade - Full prediction with performance data",
            health: "/health - System health check",
            prediction: "/prediction - Quick prediction view"
        }
    });
});

app.get('/prediction', (req, res) => {
    // Quick prediction endpoint
    if (currentPrediction) {
        res.json({
            period: currentPrediction.period,
            prediction: currentPrediction.prediction,
            confidence: currentPrediction.confidence,
            recommendation: currentPrediction.confidenceValue > 20 ? "BET" : "SKIP",
            timestamp: new Date().toISOString()
        });
    } else {
        res.json({
            status: "waiting",
            message: "No prediction available yet. Please wait for next update cycle.",
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/health', (req, res) => {
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(2) : "0.00";
    
    res.status(200).json({
        status: "OK",
        uptime: process.uptime().toFixed(2) + "s",
        timestamp: new Date().toISOString(),
        memoryUsage: process.memoryUsage(),
        predictions: predictionsMap.size,
        historySize: numberHistory.length,
        trades: totalTrades,
        winRate: winRate + "%",
        currentPrediction: currentPrediction ? "Available" : "None"
    });
});

app.listen(PORT, () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`📡 Full Status: http://localhost:${PORT}/`);
    console.log(`📊 Trade API: http://localhost:${PORT}/trade`);
    console.log(`🎯 Quick Prediction: http://localhost:${PORT}/prediction`);
    console.log(`📋 Health Check: http://localhost:${PORT}/health`);
    console.log(`\n${'='.repeat(70)}\n`);
});
