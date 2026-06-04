const config = require('../../config/system');
const { collector } = require('../collectors/WaterDataCollector');
const { eventBus, events } = require('../core/EventBus');

class NightFlowAnalyzer {
    constructor() {
        this.nightFlowData = new Map();
        this.baselines = new Map();
        this.analysisInterval = null;
        this.isRunning = false;
        
        this.NIGHT_START_HOUR = config.alarm.nightStartHour;
        this.NIGHT_END_HOUR = config.alarm.nightEndHour;
        this.NIGHT_FLOW_MULTIPLIER = config.alarm.nightFlowMultiplier;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        eventBus.subscribe(events.SENSOR_DATA_STORED, (data) => {
            this.processNightData(data);
        });
        
        this.scheduleNightAnalysis();
        console.log('[NightFlowAnalyzer] 已启动');
    }

    stop() {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        this.isRunning = false;
        console.log('[NightFlowAnalyzer] 已停止');
    }

    getWeekdayCategory(date) {
        const day = date.getDay();
        return (day === 0 || day === 6) ? 'weekend' : 'weekday';
    }

    isNightTime(hour) {
        return hour >= this.NIGHT_START_HOUR && hour < this.NIGHT_END_HOUR;
    }

    processNightData(data) {
        const hour = data.timestamp.getHours();
        
        if (!this.isNightTime(hour)) {
            return;
        }

        if (data.flow_rate === null || data.flow_rate === undefined) {
            return;
        }

        const weekdayCat = this.getWeekdayCategory(data.timestamp);
        const dateKey = data.timestamp.toDateString();
        const compositeKey = `${dateKey}_${weekdayCat}`;

        if (!this.nightFlowData.has(compositeKey)) {
            this.nightFlowData.set(compositeKey, {
                weekdayCategory: weekdayCat,
                date: dateKey,
                nodeData: new Map()
            });
        }

        const dayEntry = this.nightFlowData.get(compositeKey);
        if (!dayEntry.nodeData.has(data.node_id)) {
            dayEntry.nodeData.set(data.node_id, []);
        }

        dayEntry.nodeData.get(data.node_id).push({
            flowRate: data.flow_rate,
            timestamp: data.timestamp
        });

        this.updateRealtimeBaseline(data.node_id, data.flow_rate, weekdayCat);
    }

    updateRealtimeBaseline(nodeId, flowRate, category) {
        const key = `${nodeId}_${category}`;
        const current = this.baselines.get(key);
        
        const newBaseline = current 
            ? current * 0.9 + flowRate * 0.1 
            : flowRate;
        
        this.baselines.set(key, newBaseline);
        
        eventBus.publish(events.NIGHT_FLOW_BASELINE_UPDATED, {
            nodeId,
            category,
            baseline: newBaseline
        });
    }

    getBaseline(nodeId, timestamp) {
        const category = this.getWeekdayCategory(timestamp);
        const key = `${nodeId}_${category}`;
        return this.baselines.get(key) || null;
    }

    checkLeakAnomaly(nodeId, flowRate, timestamp) {
        const baseline = this.getBaseline(nodeId, timestamp);
        if (!baseline) return null;

        const threshold = baseline * this.NIGHT_FLOW_MULTIPLIER;
        if (flowRate > threshold) {
            return {
                nodeId,
                baseline,
                threshold,
                current: flowRate,
                ratio: flowRate / baseline,
                category: this.getWeekdayCategory(timestamp)
            };
        }
        return null;
    }

    scheduleNightAnalysis() {
        this.analysisInterval = setInterval(() => {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();
            
            if (hour === this.NIGHT_END_HOUR && minute === 0) {
                this.performFullAnalysis();
            }
        }, 60000);
    }

    performFullAnalysis() {
        console.log('[NightFlowAnalyzer] 执行夜间流量综合分析...');

        const weekdayBaselines = new Map();
        const weekendBaselines = new Map();

        this.nightFlowData.forEach((entry) => {
            const targetMap = entry.weekdayCategory === 'weekend' 
                ? weekendBaselines 
                : weekdayBaselines;

            entry.nodeData.forEach((data, nodeId) => {
                if (data.length === 0) return;

                const sortedFlows = data.map(d => d.flowRate).sort((a, b) => a - b);
                const median = sortedFlows[Math.floor(sortedFlows.length / 2)];

                if (!targetMap.has(nodeId)) {
                    targetMap.set(nodeId, []);
                }
                targetMap.get(nodeId).push(median);
            });
        });

        const finalBaselines = new Map();

        [weekdayBaselines, weekendBaselines].forEach(baselineMap => {
            baselineMap.forEach((medians, nodeId) => {
                if (!finalBaselines.has(nodeId)) {
                    finalBaselines.set(nodeId, { weekday: null, weekend: null });
                }

                const avg = medians.reduce((a, b) => a + b, 0) / medians.length;

                if (baselineMap === weekdayBaselines) {
                    finalBaselines.get(nodeId).weekday = avg;
                    this.baselines.set(`${nodeId}_weekday`, avg);
                } else {
                    finalBaselines.get(nodeId).weekend = avg;
                    this.baselines.set(`${nodeId}_weekend`, avg);
                }
            });
        });

        const today = new Date();
        const todayCategory = this.getWeekdayCategory(today);
        const anomalies = [];

        finalBaselines.forEach((baselines, nodeId) => {
            const cache = collector.getNodeData(nodeId, 12);
            if (cache.length < 6) return;

            const recentFlows = cache
                .filter(d => d.flowRate !== null && d.flowRate !== undefined)
                .map(d => d.flowRate);
            
            if (recentFlows.length === 0) return;

            const avgRecent = recentFlows.reduce((a, b) => a + b, 0) / recentFlows.length;

            let baseline = todayCategory === 'weekend' && baselines.weekend !== null
                ? baselines.weekend
                : baselines.weekday !== null
                    ? baselines.weekday
                    : (baselines.weekday !== null ? baselines.weekday : baselines.weekend);

            if (baseline === null) return;

            if (avgRecent > baseline * this.NIGHT_FLOW_MULTIPLIER) {
                anomalies.push({
                    nodeId,
                    baseline,
                    baselineType: todayCategory,
                    current: avgRecent,
                    ratio: avgRecent / baseline,
                    weekdayBaseline: baselines.weekday,
                    weekendBaseline: baselines.weekend
                });
            }
        });

        const result = {
            date: today.toDateString(),
            dayCategory: todayCategory,
            anomalies,
            totalAnalyzed: finalBaselines.size
        };

        eventBus.publish(events.NIGHT_ANALYSIS_COMPLETE, result);
        
        console.log(`[NightFlowAnalyzer] 分析完成: ${finalBaselines.size} 节点, ${anomalies.length} 异常`);
        return result;
    }

    getStats() {
        return {
            daysCollected: this.nightFlowData.size,
            baselinesCount: this.baselines.size,
            isRunning: this.isRunning
        };
    }

    clearData() {
        this.nightFlowData.clear();
        this.baselines.clear();
    }
}

const nightFlowAnalyzer = new NightFlowAnalyzer();

module.exports = {
    NightFlowAnalyzer,
    nightFlowAnalyzer
};
