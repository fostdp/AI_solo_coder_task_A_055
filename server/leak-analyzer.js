const db = require('./database');
const config = require('../config/system');

const nodeDataCache = new Map();
const nightFlowData = new Map();
const leakSuspectAreas = [];

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const NIGHT_START_HOUR = config.alarm.nightStartHour;
const NIGHT_END_HOUR = config.alarm.nightEndHour;

async function analyzeData(nodeId, pressure, flowRate, timestamp) {
    cacheNodeData(nodeId, pressure, flowRate, timestamp);
    
    const hour = timestamp.getHours();
    if (hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR) {
        collectNightFlowData(nodeId, flowRate, timestamp);
    }
    
    const leakProbability = calculateLeakProbability(nodeId, pressure, flowRate);
    
    if (leakProbability > 0.6) {
        await recordLeakSuspect(nodeId, leakProbability, 'pressure_flow_anomaly', {
            pressure,
            flowRate,
            pressureTrend: getPressureTrend(nodeId),
            flowTrend: getFlowTrend(nodeId)
        }, timestamp);
    }
    
    return leakProbability;
}

function cacheNodeData(nodeId, pressure, flowRate, timestamp) {
    if (!nodeDataCache.has(nodeId)) {
        nodeDataCache.set(nodeId, []);
    }
    
    const cache = nodeDataCache.get(nodeId);
    cache.push({ pressure, flowRate, timestamp });
    
    if (cache.length > 288) {
        cache.shift();
    }
}

function getWeekdayCategory(date) {
    const day = date.getDay();
    if (day === 0 || day === 6) return 'weekend';
    return 'weekday';
}

function collectNightFlowData(nodeId, flowRate, timestamp) {
    const weekdayCat = getWeekdayCategory(timestamp);
    const dateKey = timestamp.toDateString();
    const compositeKey = `${dateKey}_${weekdayCat}`;
    
    if (!nightFlowData.has(compositeKey)) {
        nightFlowData.set(compositeKey, {
            weekdayCategory: weekdayCat,
            date: dateKey,
            nodeData: new Map()
        });
    }
    
    const dayEntry = nightFlowData.get(compositeKey);
    if (!dayEntry.nodeData.has(nodeId)) {
        dayEntry.nodeData.set(nodeId, []);
    }
    
    dayEntry.nodeData.get(nodeId).push({ flowRate, timestamp });
}

function calculateLeakProbability(nodeId, pressure, flowRate) {
    let score = 0;
    let factors = 0;
    
    const pressureTrend = getPressureTrend(nodeId);
    if (pressureTrend < -0.01) {
        score += Math.min(0.3, Math.abs(pressureTrend) * 10);
        factors++;
    }
    
    const flowTrend = getFlowTrend(nodeId);
    if (flowTrend > 0.5) {
        score += Math.min(0.3, flowTrend * 0.5);
        factors++;
    }
    
    const { normalPressureMin, normalPressureMax } = config.hydraulic;
    if (pressure < normalPressureMin) {
        score += Math.min(0.2, (normalPressureMin - pressure) * 2);
        factors++;
    }
    
    const flowVariance = getFlowVariance(nodeId);
    if (flowVariance > 2) {
        score += Math.min(0.2, flowVariance * 0.1);
        factors++;
    }
    
    return factors > 0 ? score / factors : 0;
}

function getPressureTrend(nodeId) {
    const cache = nodeDataCache.get(nodeId);
    if (!cache || cache.length < 10) return 0;
    
    const recent = cache.slice(-10);
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = recent.length;
    
    recent.forEach((d, i) => {
        sumX += i;
        sumY += d.pressure;
        sumXY += i * d.pressure;
        sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
}

function getFlowTrend(nodeId) {
    const cache = nodeDataCache.get(nodeId);
    if (!cache || cache.length < 10) return 0;
    
    const recent = cache.slice(-10);
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = recent.length;
    
    recent.forEach((d, i) => {
        sumX += i;
        sumY += d.flowRate || 0;
        sumXY += i * (d.flowRate || 0);
        sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
}

function getFlowVariance(nodeId) {
    const cache = nodeDataCache.get(nodeId);
    if (!cache || cache.length < 5) return 0;
    
    const recent = cache.slice(-20).map(d => d.flowRate || 0);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
    
    return Math.sqrt(variance);
}

async function recordLeakSuspect(nodeId, probability, analysisType, details, timestamp) {
    leakSuspectAreas.push({
        nodeId,
        probability,
        analysisType,
        details,
        timestamp
    });
    
    if (leakSuspectAreas.length > 100) {
        leakSuspectAreas.shift();
    }
    
    try {
        await db.query(
            `INSERT INTO leak_suspects (node_id, leak_probability, analysis_type, details, timestamp)
             VALUES ($1, $2, $3, $4, $5)`,
            [nodeId, probability, analysisType, JSON.stringify(details), timestamp]
        );
    } catch (err) {
    }
}

let nightAnalysisInterval;

function startNightAnalysis(broadcast) {
    if (nightAnalysisInterval) return;
    
    nightAnalysisInterval = setInterval(() => {
        const now = new Date();
        const hour = now.getHours();
        
        if (hour === NIGHT_END_HOUR && now.getMinutes() === 0) {
            performNightAnalysis(broadcast);
        }
    }, 60000);
}

async function performNightAnalysis(broadcast) {
    console.log('执行夜间流量分析（按工作日/周末分类）...');
    
    const weekdayBaselines = new Map();
    const weekendBaselines = new Map();
    
    nightFlowData.forEach((entry) => {
        const cat = entry.weekdayCategory;
        const targetMap = cat === 'weekend' ? weekendBaselines : weekdayBaselines;
        
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
            } else {
                finalBaselines.get(nodeId).weekend = avg;
            }
        });
    });
    
    const today = new Date();
    const todayCategory = getWeekdayCategory(today);
    
    const anomalies = [];
    finalBaselines.forEach((baselines, nodeId) => {
        const cache = nodeDataCache.get(nodeId);
        if (!cache) return;
        
        const recentFlows = cache.slice(-12).map(d => d.flowRate || 0);
        const avgRecent = recentFlows.reduce((a, b) => a + b, 0) / recentFlows.length;
        
        let baseline;
        if (todayCategory === 'weekend' && baselines.weekend !== null) {
            baseline = baselines.weekend;
        } else if (todayCategory === 'weekday' && baselines.weekday !== null) {
            baseline = baselines.weekday;
        } else {
            baseline = baselines.weekday !== null ? baselines.weekday : baselines.weekend;
        }
        
        if (baseline === null) return;
        
        if (avgRecent > baseline * config.alarm.nightFlowMultiplier) {
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
    
    if (anomalies.length > 0 && broadcast) {
        broadcast({
            type: 'night_analysis_complete',
            data: {
                date: today.toDateString(),
                dayCategory: todayCategory,
                anomalies,
                totalAnalyzed: finalBaselines.size
            }
        });
    }
    
    console.log(`夜间分析完成: 分析 ${finalBaselines.size} 个节点 (${todayCategory}), 发现 ${anomalies.length} 个异常`);
}

function getWeekdayBaseline(nodeId, dayOfWeek) {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const key = `${nodeId}_${isWeekend ? 'weekend' : 'weekday'}`;
    return nightFlowData.get(key);
}

function getLeakSuspects() {
    return leakSuspectAreas.sort((a, b) => b.probability - a.probability).slice(0, 20);
}

module.exports = {
    analyzeData,
    startNightAnalysis,
    getLeakSuspects,
    calculateLeakProbability,
    getWeekdayBaseline,
    getWeekdayCategory
};
