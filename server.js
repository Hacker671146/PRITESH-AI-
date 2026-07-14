const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API Config
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?ts=";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://hgnice.biz",
    "Origin": "https://hgnice.biz"
};

// State Variables
let lastPeriod = null;
let activePrediction = null; 
let systemStats = {
    totalWins: 0,
    totalLosses: 0,
    history: [] // Holds standard image-style JSON array
};

// --- CORE MATHEMATICAL ENGINE ---
function sigmoid(x) {
    const boundedX = Math.max(-500.0, Math.min(500.0, x));
    return 1.0 / (1.0 + Math.exp(-boundedX));
}

function relu(x) {
    return Math.max(0.0, x);
}

function dotProduct(vec1, vec2) {
    let sum = 0;
    const len = Math.min(vec1.length, vec2.length);
    for (let i = 0; i < len; i++) {
        sum += vec1[i] * vec2[i];
    }
    return sum;
}

function generateWeights(rows, cols, min = -0.02, max = 0.02) {
    let arr = [];
    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
            row.push(Math.random() * (max - min) + min);
        }
        arr.push(row);
    }
    return arr;
}

// --- 15-LAYER HIGHWAY NETWORK ---
class AdvancedHighwayPredictor {
    constructor() {
        this.inputDim = 10;
        this.hiddenDim = 32;
        this.numLayers = 13;

        this.W_input = generateWeights(this.hiddenDim, this.inputDim, -0.02, 0.02);
        this.b_input = new Array(this.hiddenDim).fill(0.0);

        this.W_H = []; this.W_T = []; this.b_H = []; this.b_T = [];
        for (let i = 0; i < this.numLayers; i++) {
            this.W_H.push(generateWeights(this.hiddenDim, this.hiddenDim, -0.02, 0.02));
            this.b_H.push(new Array(this.hiddenDim).fill(0.0));
            this.W_T.push(generateWeights(this.hiddenDim, this.hiddenDim, -0.02, 0.02));
            this.b_T.push(new Array(this.hiddenDim).fill(-1.0));
        }

        this.W_out = generateWeights(1, this.hiddenDim, -0.02, 0.02);
        this.b_out = [0.0];
    }

    forward(x) {
        let currentLayer = [];
        for (let j = 0; j < this.hiddenDim; j++) {
            let z = dotProduct(x, this.W_input[j]) + this.b_input[j];
            currentLayer.push(relu(z));
        }

        for (let i = 0; i < this.numLayers; i++) {
            let nextLayer = [];
            for (let j = 0; j < this.hiddenDim; j++) {
                let z_H = dotProduct(currentLayer, this.W_H[i][j]) + this.b_H[i][j];
                let h_val = relu(z_H);

                let z_T = dotProduct(currentLayer, this.W_T[i][j]) + this.b_T[i][j];
                let t_val = sigmoid(z_T);

                let y_val = h_val * t_val + currentLayer[j] * (1.0 - t_val);
                nextLayer.push(y_val);
            }
            currentLayer = nextLayer;
        }

        let z_out = dotProduct(currentLayer, this.W_out[0]) + this.b_out[0];
        return sigmoid(z_out);
    }
}

// --- 14-LAYER DEEP LOGIC NETWORK ---
class DeepLogicPredictor {
    constructor() {
        this.inputDim = 10;
        this.hiddenDim = 16;
        this.numHiddenLayers = 12;

        this.weights = [];
        this.biases = [];

        this.weights.push(generateWeights(this.hiddenDim, this.inputDim, -0.05, 0.05));
        this.biases.push(new Array(this.hiddenDim).fill(0.0));

        for (let i = 0; i < this.numHiddenLayers - 1; i++) {
            this.weights.push(generateWeights(this.hiddenDim, this.hiddenDim, -0.05, 0.05));
            this.biases.push(new Array(this.hiddenDim).fill(0.0));
        }

        this.weights.push(generateWeights(1, this.hiddenDim, -0.05, 0.05));
        this.biases.push([0.0]);
    }

    forward(x) {
        let currentInput = x;
        for (let i = 0; i < this.weights.length; i++) {
            let nextInput = [];
            for (let j = 0; j < this.weights[i].length; j++) {
                let z = dotProduct(currentInput, this.weights[i][j]) + this.biases[i][j];
                nextInput.push(sigmoid(z));
            }
            currentInput = nextInput;
        }
        return currentInput[0];
    }
}

// --- HYBRID RUNTIME ENGINE ---
class HybridEngine {
    constructor() {
        this.model15 = new AdvancedHighwayPredictor();
        this.model14 = new DeepLogicPredictor();
    }

    prepareFeatures(n1, n2, n3) {
        return [
            n1 / 9.0,
            n2 / 9.0,
            n3 / 9.0,
            (n1 + n2) / 18.0,
            (n2 + n3) / 18.0,
            (n1 + n2 + n3) / 27.0,
            Math.abs(n1 - n2) / 9.0,
            Math.abs(n2 - n3) / 9.0,
            Math.sin(n1) * 0.5 + 0.5,
            Math.cos(n2) * 0.5 + 0.5
        ];
    }

    predict(n1, n2, n3) {
        const features = this.prepareFeatures(n1, n2, n3);
        const prob_15 = this.model15.forward(features);
        const prob_14 = this.model14.forward(features);

        // Hybrid Weighted Voting (60% / 40%)
        const combinedProb = (prob_15 * 0.6) + (prob_14 * 0.4);
        const finalPrediction = combinedProb >= 0.5 ? "BIG" : "SMALL";
        const finalConfidence = combinedProb >= 0.5 ? combinedProb : 1.0 - combinedProb;

        // Exact digit styling logic matching the screenshot target "[6,5]"
        let digitChoices = [];
        if (finalPrediction === "BIG") {
            const digit = Math.min(9, Math.max(5, Math.floor(5 + finalConfidence * 4)));
            const backupDigit = (digit - 1 >= 5) ? (digit - 1) : 9;
            digitChoices = [digit, backupDigit];
        } else {
            const digit = Math.min(4, Math.max(0, Math.floor((1 - finalConfidence) * 5)));
            const backupDigit = (digit + 1 <= 4) ? (digit + 1) : 0;
            digitChoices = [digit, backupDigit];
        }

        return {
            prediction: finalPrediction,
            digits: digitChoices,
            confidence: finalConfidence
        };
    }
}

const engine = new HybridEngine();

// Fetch loop evaluation and database builder
async function evaluateLastGame() {
    try {
        const response = await axios.get(`${API_URL}${Date.now()}`, { headers: HEADERS, timeout: 8000 });
        if (response.status === 200 && response.data && response.data.data && response.data.data.list) {
            const list = response.data.data.list;
            if (list.length < 3) return;

            const latest = list[0];
            const currentPeriod = String(latest.issueNumber);
            const currentNumber = parseInt(latest.number);

            // Trigger on new cycle/period arrival
            if (currentPeriod !== lastPeriod) {
                
                // Track historical list formatting as per requested image
                if (activePrediction && activePrediction.targetPeriod === currentPeriod) {
                    const actualType = currentNumber >= 5 ? "BIG" : "SMALL";
                    const isWin = (actualType === activePrediction.prediction) ? "✅ WIN" : "❌ LOSS";

                    if (isWin === "✅ WIN") {
                        systemStats.totalWins++;
                    } else {
                        systemStats.totalLosses++;
                    }

                    // FORMAT EXACTLY MATCHING YOUR SCREENSHOT ARRAY STRUCT
                    systemStats.history.unshift({
                        period: currentPeriod,
                        prediction: `${activePrediction.prediction} [${activePrediction.digits.join(',')}]`,
                        status: isWin,
                        result: currentNumber
                    });

                    // Cap history list limit to last 50 games
                    if (systemStats.history.length > 50) systemStats.history.pop();
                }

                // Update tracker
                lastPeriod = currentPeriod;

                const n1 = parseInt(list[0].number);
                const n2 = parseInt(list[1].number);
                const n3 = parseInt(list[2].number);

                const nextPeriod = String(BigInt(currentPeriod) + 1n);
                const predResult = engine.predict(n1, n2, n3);

                activePrediction = {
                    targetPeriod: nextPeriod,
                    prediction: predResult.prediction,
                    digits: predResult.digits,
                    confidence: predResult.confidence
                };
            }
        }
    } catch (err) {
        console.error("Fetch API Error: ", err.message);
    }
}

// Tick processing every 5 seconds to prevent timeout blockages
setInterval(evaluateLastGame, 5000);

// --- REST ENDPOINTS ---

// Main Landing Page 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// JSON API Endpoint (Exact Copy of the Screenshot Response)
app.get('/api/history', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(
