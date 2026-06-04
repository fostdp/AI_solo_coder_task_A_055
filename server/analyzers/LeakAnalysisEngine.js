const db = require('../database');
const config = require('../../config/system');
const { collector } = require('../collectors/WaterDataCollector');
const { eventBus, events } = require('../core/EventBus');

class LeakAnalysisEngine {
    constructor() {
        this.leakSuspects = [];
        this.maxSuspects = 100;
        this.isRunning = false;
        
        this.normalPressureMin = config.hydraulic.normalPressureMin;
        this.normalPressureMax = config.hydraulic.normalPressureMax;
        this.leakProbabilityThreshold = 0.6;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        eventBus.subscribe(events.SENSOR_DATA_STORED, (data) => {
            this.analyzeNode(data.node_id);
        });

        console.log('[LeakAnalysisEngine] 已启动');
    }

    stop() {
        this.isRunning = false;
        console.log('[LeakAnalysisEngine] 已停止');
    }

    analyzeNode(nodeId) {
        const latestData = collector.getLatestData(nodeId);
        if (!latestData) return null;

        const probability = this.calculateLeakProbability(nodeId);

        if (probability > this.leakProbabilityThreshold) {
            const suspect = this.recordLeakSuspect(
                nodeId, 
                probability, 
                'pressure_flow_anomaly',
                {
                    pressure: latestData.pressure,
                    flowRate: latestData.flowRate,
                    pressureTrend: this.getPressureTrend(nodeId),
                    flowTrend: this.getFlowTrend(nodeId)
                },
                latestData.timestamp
            );

            eventBus.publish(events.LEAK_SUSPECT_DETECTED, suspect);
            return suspect;
        }

        return null;
    }

    calculateLeakProbability(nodeId) {
        let score = 0;
        let factors = 0;

        const pressureTrend = this.getPressureTrend(nodeId);
        if (pressureTrend < -0.01) {
            score += Math.min(0.3, Math.abs(pressureTrend) * 10);
            factors++;
        }

        const flowTrend = this.getFlowTrend(nodeId);
        if (flowTrend > 0.5) {
            score += Math.min(0.3, flowTrend * 0.5);
            factors++;
        }

        const latestData = collector.getLatestData(nodeId);
        if (latestData && latestData.pressure !== null) {
            if (latestData.pressure < this.normalPressureMin) {
                score += Math.min(0.2, (this.normalPressureMin - latestData.pressure) * 2);
                factors++;
            }
        }

        const flowVariance = this.getFlowVariance(nodeId);
        if (flowVariance > 2) {
            score += Math.min(0.2, flowVariance * 0.1);
            factors++;
        }

        return factors > 0 ? score / factors : 0;
    }

    getPressureTrend(nodeId) {
        const cache = collector.getNodeData(nodeId, 10);
        if (cache.length < 10) return 0;

        const recent = cache.slice(-10);
        return this.linearRegression(recent.map(d => d.pressure));
    }

    getFlowTrend(nodeId) {
        const cache = collector.getNodeData(nodeId, 10);
        if (cache.length < 10) return 0;

        const recent = cache.slice(-10);
        return this.linearRegression(recent.map(d => d.flowRate || 0));
    }

    linearRegression(values) {
        if (values.length < 2) return 0;

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = values.length;

        values.forEach((y, i) => {
            sumX += i;
            sumY += y;
            sumXY += i * y;
            sumX2 += i * i;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }

    getFlowVariance(nodeId) {
        const cache = collector.getNodeData(nodeId, 20);
        if (cache.length < 5) return 0;

        const flows = cache.map(d => d.flowRate || 0);
        const mean = flows.reduce((a, b) => a + b, 0) / flows.length;
        const variance = flows.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / flows.length;

        return Math.sqrt(variance);
    }

    async recordLeakSuspect(nodeId, probability, analysisType, details, timestamp) {
        const suspect = {
            nodeId,
            probability: Math.min(0.95, probability),
            analysisType,
            details,
            timestamp
        };

        this.leakSuspects.push(suspect);

        if (this.leakSuspects.length > this.maxSuspects) {
            this.leakSuspects.shift();
        }

        try {
            await db.query(
                `INSERT INTO leak_suspects (node_id, leak_probability, analysis_type, details, timestamp)
                 VALUES ($1, $2, $3, $4, $5)`,
                [nodeId, suspect.probability, analysisType, JSON.stringify(details), timestamp]
            );
        } catch (err) {
            console.error('[LeakAnalysisEngine] 保存漏损嫌疑失败:', err.message);
        }

        return suspect;
    }

    getLeakSuspects(limit = 20) {
        return this.leakSuspects
            .sort((a, b) => b.probability - a.probability)
            .slice(0, limit);
    }

    getTopSuspects(limit = 10) {
        const suspects = new Map();

        this.leakSuspects.forEach(s => {
            const existing = suspects.get(s.nodeId);
            if (!existing || s.probability > existing.probability) {
                suspects.set(s.nodeId, s);
            }
        });

        return Array.from(suspects.values())
            .sort((a, b) => b.probability - a.probability)
            .slice(0, limit);
    }

    getStats() {
        return {
            totalSuspects: this.leakSuspects.length,
            highProbabilityCount: this.leakSuspects.filter(s => s.probability >= 0.75).length,
            isRunning: this.isRunning
        };
    }

    clearSuspects() {
        this.leakSuspects = [];
    }
}

const leakAnalysisEngine = new LeakAnalysisEngine();

module.exports = {
    LeakAnalysisEngine,
    leakAnalysisEngine
};
