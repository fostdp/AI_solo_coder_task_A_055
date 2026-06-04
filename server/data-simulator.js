const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
    reportIntervalMs: 3000,
    anomalyInjectionInterval: 10,
    anomalyInjectionChance: 0.3,
    globalDefaults: {
        basePressure: 0.35,
        pressureNoise: 0.01,
        pressureDrift: 0.002,
        baseFlow: 15,
        flowNoise: 1.0,
        flowDrift: 0.5
    },
    typeDefaults: {
        plant: { basePressure: 0.40, baseFlow: 120, flowNoise: 3.0 },
        pump: { basePressure: 0.38, baseFlow: 65, flowNoise: 2.0 },
        pressure_station: { basePressure: 0.35, baseFlow: 40, flowNoise: 1.5 },
        junction: { basePressure: 0.32, baseFlow: 12, flowNoise: 1.0 },
        valve: { basePressure: 0.30, baseFlow: 8, flowNoise: 0.8 },
        hydrant: { basePressure: 0.28, baseFlow: 5, flowNoise: 0.5 }
    },
    nodeOverrides: {},
    anomalyProfiles: {
        burst: {
            pressureDropRate: { min: 0.03, max: 0.05 },
            flowIncreaseRate: { min: 5, max: 10 },
            duration: { min: 6, max: 12 }
        },
        leak: {
            flowOffsetRatio: { min: 0.2, max: 0.5 },
            duration: { min: 20, max: 40 }
        }
    },
    dailyPattern: {
        enabled: true,
        curve: [
            { hour: 0, factor: 0.40 },
            { hour: 2, factor: 0.30 },
            { hour: 4, factor: 0.25 },
            { hour: 5, factor: 0.35 },
            { hour: 6, factor: 0.60 },
            { hour: 7, factor: 0.90 },
            { hour: 8, factor: 1.00 },
            { hour: 9, factor: 0.95 },
            { hour: 10, factor: 0.85 },
            { hour: 11, factor: 0.80 },
            { hour: 12, factor: 0.75 },
            { hour: 13, factor: 0.80 },
            { hour: 14, factor: 0.85 },
            { hour: 15, factor: 0.80 },
            { hour: 16, factor: 0.75 },
            { hour: 17, factor: 0.85 },
            { hour: 18, factor: 1.00 },
            { hour: 19, factor: 0.95 },
            { hour: 20, factor: 0.85 },
            { hour: 21, factor: 0.70 },
            { hour: 22, factor: 0.55 },
            { hour: 23, factor: 0.45 },
            { hour: 24, factor: 0.40 }
        ],
        weekendFactor: 0.75,
        pressureFollowsFlow: true,
        pressureFactorScale: 0.3
    }
};

function loadConfig() {
    const configFileName = process.env.SIMULATOR_CONFIG || 'simulator-config.json';
    const configPath = path.join(__dirname, '../config', configFileName);

    try {
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8');
            const userConfig = JSON.parse(raw);
            console.log(`[DataSimulator] 加载配置: ${configPath}`);
            return deepMerge(DEFAULT_CONFIG, userConfig);
        }
    } catch (err) {
        console.warn(`[DataSimulator] 配置加载失败，使用默认值: ${err.message}`);
    }

    return DEFAULT_CONFIG;
}

function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

function randomInRange(min, max) {
    return min + Math.random() * (max - min);
}

function getDailyFlowFactor(hour, minute, curve) {
    const exactHour = hour + minute / 60;

    let lower = curve[0];
    let upper = curve[curve.length - 1];

    for (let i = 0; i < curve.length - 1; i++) {
        if (exactHour >= curve[i].hour && exactHour < curve[i + 1].hour) {
            lower = curve[i];
            upper = curve[i + 1];
            break;
        }
    }

    const range = upper.hour - lower.hour;
    const progress = range > 0 ? (exactHour - lower.hour) / range : 0;
    return lower.factor + (upper.factor - lower.factor) * progress;
}

class DataSimulator {
    constructor() {
        this.config = null;
        this.nodes = [];
        this.nodeStates = new Map();
        this.simulateInterval = null;
        this.reportCount = 0;
        this.scenarioQueue = [];
    }

    init() {
        this.config = loadConfig();

        const nodesPath = path.join(__dirname, '../data/nodes-demo.json');
        const nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));
        this.nodes = nodes.filter(n => n.pressure_sensor || n.flow_sensor);

        this.nodes.forEach(node => {
            const state = this.createNodeState(node);
            this.nodeStates.set(node.node_id, state);
        });

        console.log(`[DataSimulator] 初始化完成: ${this.nodes.length} 传感器, 上报间隔 ${this.config.reportIntervalMs}ms`);
    }

    createNodeState(node) {
        const typeDefault = this.config.typeDefaults[node.type] || this.config.globalDefaults;
        const global = this.config.globalDefaults;
        const override = this.config.nodeOverrides[node.node_id] || {};

        const basePressure = override.basePressure ?? typeDefault.basePressure ?? global.basePressure;
        const baseFlow = override.baseFlow ?? typeDefault.baseFlow ?? global.baseFlow;
        const pressureNoise = override.pressureNoise ?? typeDefault.pressureNoise ?? global.pressureNoise;
        const flowNoise = override.flowNoise ?? typeDefault.flowNoise ?? global.flowNoise;
        const pressureDrift = override.pressureDrift ?? typeDefault.pressureDrift ?? global.pressureDrift;
        const flowDrift = override.flowDrift ?? typeDefault.flowDrift ?? global.flowDrift;

        const jitter = (base) => base * (0.95 + Math.random() * 0.1);

        return {
            basePressure: jitter(basePressure),
            baseFlow: jitter(baseFlow),
            currentPressure: jitter(basePressure),
            currentFlow: jitter(baseFlow),
            pressureNoise,
            flowNoise,
            pressureDrift,
            flowDrift,
            pressureTrend: 0,
            flowTrend: 0,
            anomaly: null,
            nodeType: node.type
        };
    }

    start(handleSensorData) {
        if (this.simulateInterval) return;
        if (!this.config) this.init();

        console.log(`[DataSimulator] 启动数据模拟器，共 ${this.nodes.length} 个传感器节点`);

        this.simulateInterval = setInterval(() => {
            this.reportCount++;

            this.processScenarioQueue();

            if (this.reportCount % this.config.anomalyInjectionInterval === 0) {
                this.injectRandomAnomaly();
            }

            this.nodes.forEach(node => {
                const data = this.generateSensorData(node);
                handleSensorData(data);
            });

            if (this.reportCount % 20 === 0) {
                console.log(`[DataSimulator] 已上报 ${this.reportCount * this.nodes.length} 条传感器数据`);
            }
        }, this.config.reportIntervalMs);
    }

    generateSensorData(node) {
        const state = this.nodeStates.get(node.node_id);
        const now = new Date();
        const timestamp = now.toISOString();

        let dailyFlowFactor = 1.0;
        let dailyPressureFactor = 1.0;

        if (this.config.dailyPattern && this.config.dailyPattern.enabled) {
            const dp = this.config.dailyPattern;
            dailyFlowFactor = getDailyFlowFactor(now.getHours(), now.getMinutes(), dp.curve);

            const dayOfWeek = now.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                dailyFlowFactor *= dp.weekendFactor;
            }

            if (dp.pressureFollowsFlow) {
                dailyPressureFactor = 1.0 + (dailyFlowFactor - 0.5) * dp.pressureFactorScale;
            }
        }

        const pressureNoise = (Math.random() - 0.5) * 2 * state.pressureNoise;
        const flowNoise = (Math.random() - 0.5) * 2 * state.flowNoise;

        if (state.anomaly) {
            if (state.anomaly.type === 'burst') {
                state.currentPressure -= state.anomaly.pressureDropRate;
                state.currentFlow += state.anomaly.flowIncreaseRate;
                state.anomaly.remaining--;

                if (state.anomaly.remaining <= 0) {
                    state.anomaly = null;
                    state.currentPressure = state.basePressure * 0.7;
                }
            } else if (state.anomaly.type === 'leak') {
                state.currentFlow += flowNoise + state.anomaly.flowOffset;
                state.anomaly.remaining--;

                if (state.anomaly.remaining <= 0) {
                    state.anomaly = null;
                }
            }
        } else {
            state.pressureTrend = state.pressureTrend * 0.9 + (Math.random() - 0.5) * state.pressureDrift;
            state.flowTrend = state.flowTrend * 0.9 + (Math.random() - 0.5) * state.flowDrift;

            state.currentPressure = state.basePressure * dailyPressureFactor + state.pressureTrend + pressureNoise;
            state.currentFlow = state.baseFlow * dailyFlowFactor + state.flowTrend + flowNoise;
        }

        state.currentPressure = Math.max(0.05, Math.min(0.8, state.currentPressure));
        state.currentFlow = Math.max(0, state.currentFlow);

        return {
            node_id: node.node_id,
            pressure: node.pressure_sensor ? Math.round(state.currentPressure * 1000) / 1000 : null,
            flow_rate: node.flow_sensor ? Math.round(state.currentFlow * 100) / 100 : null,
            timestamp
        };
    }

    injectRandomAnomaly() {
        const candidates = this.nodes.filter(n => {
            const state = this.nodeStates.get(n.node_id);
            return !state.anomaly && n.type !== 'plant';
        });

        if (candidates.length === 0) return;

        const useBurst = Math.random() < this.config.anomalyInjectionChance;
        const targetNode = candidates[Math.floor(Math.random() * candidates.length)];
        const state = this.nodeStates.get(targetNode.node_id);
        const profiles = this.config.anomalyProfiles;

        if (useBurst) {
            const p = profiles.burst;
            state.anomaly = {
                type: 'burst',
                pressureDropRate: randomInRange(p.pressureDropRate.min, p.pressureDropRate.max),
                flowIncreaseRate: randomInRange(p.flowIncreaseRate.min, p.flowIncreaseRate.max),
                remaining: Math.round(randomInRange(p.duration.min, p.duration.max))
            };
            console.log(`[DataSimulator] 注入爆管异常: ${targetNode.node_id}`);
        } else {
            const p = profiles.leak;
            const offsetRatio = randomInRange(p.flowOffsetRatio.min, p.flowOffsetRatio.max);
            state.anomaly = {
                type: 'leak',
                flowOffset: state.baseFlow * offsetRatio + Math.random() * 3,
                remaining: Math.round(randomInRange(p.duration.min, p.duration.max))
            };
            console.log(`[DataSimulator] 注入漏损异常: ${targetNode.node_id}`);
        }
    }

    processScenarioQueue() {
        while (this.scenarioQueue.length > 0) {
            const scenario = this.scenarioQueue.shift();
            if (scenario.delay && scenario.delay > 0) {
                scenario.delay--;
                this.scenarioQueue.unshift(scenario);
                return;
            }
            this.executeScenarioAction(scenario);
        }
    }

    executeScenarioAction(scenario) {
        switch (scenario.action) {
            case 'inject_burst':
                this.injectAnomaly(scenario.nodeId, 'burst');
                console.log(`[DataSimulator] 场景: 注入爆管 ${scenario.nodeId}`);
                break;
            case 'inject_leak':
                this.injectAnomaly(scenario.nodeId, 'leak');
                console.log(`[DataSimulator] 场景: 注入漏损 ${scenario.nodeId}`);
                break;
            case 'set_pressure':
                this.setNodePressure(scenario.nodeId, scenario.value);
                console.log(`[DataSimulator] 场景: 设置压力 ${scenario.nodeId} = ${scenario.value}`);
                break;
            case 'set_flow':
                this.setNodeFlow(scenario.nodeId, scenario.value);
                console.log(`[DataSimulator] 场景: 设置流量 ${scenario.nodeId} = ${scenario.value}`);
                break;
            case 'batch_inject':
                this.batchInject(scenario.nodes, scenario.type);
                break;
            default:
                console.warn(`[DataSimulator] 未知场景动作: ${scenario.action}`);
        }
    }

    batchInject(nodeIds, type) {
        let injected = 0;
        nodeIds.forEach(nodeId => {
            if (this.injectAnomaly(nodeId, type)) {
                injected++;
            }
        });
        console.log(`[DataSimulator] 批量注入: ${injected}/${nodeIds.length} 节点, 类型: ${type}`);
    }

    loadScenario(scenarioConfig) {
        const steps = scenarioConfig.steps || [];
        steps.forEach(step => {
            this.scenarioQueue.push({ ...step, delay: step.delay || 0 });
        });
        console.log(`[DataSimulator] 加载场景: ${scenarioConfig.name || 'unnamed'}, ${steps.length} 步骤`);
    }

    injectAnomaly(nodeId, type) {
        const state = this.nodeStates.get(nodeId);
        if (!state || state.anomaly) return false;

        const profiles = this.config.anomalyProfiles;
        if (type === 'burst') {
            const p = profiles.burst;
            state.anomaly = {
                type: 'burst',
                pressureDropRate: randomInRange(p.pressureDropRate.min, p.pressureDropRate.max),
                flowIncreaseRate: randomInRange(p.flowIncreaseRate.min, p.flowIncreaseRate.max),
                remaining: Math.round(randomInRange(p.duration.min, p.duration.max))
            };
        } else if (type === 'leak') {
            const p = profiles.leak;
            state.anomaly = {
                type: 'leak',
                flowOffset: state.baseFlow * 0.5,
                remaining: Math.round(randomInRange(p.duration.min, p.duration.max))
            };
        }

        return true;
    }

    setNodePressure(nodeId, value) {
        const state = this.nodeStates.get(nodeId);
        if (!state) return false;
        state.currentPressure = value;
        state.basePressure = value;
        return true;
    }

    setNodeFlow(nodeId, value) {
        const state = this.nodeStates.get(nodeId);
        if (!state) return false;
        state.currentFlow = value;
        state.baseFlow = value;
        return true;
    }

    stop() {
        if (this.simulateInterval) {
            clearInterval(this.simulateInterval);
            this.simulateInterval = null;
        }
        console.log('[DataSimulator] 已停止');
    }

    getNodeState(nodeId) {
        return this.nodeStates.get(nodeId);
    }

    getAllNodeStates() {
        const result = {};
        this.nodeStates.forEach((state, nodeId) => {
            result[nodeId] = {
                basePressure: state.basePressure,
                baseFlow: state.baseFlow,
                currentPressure: state.currentPressure,
                currentFlow: state.currentFlow,
                anomaly: state.anomaly ? { type: state.anomaly.type, remaining: state.anomaly.remaining } : null,
                nodeType: state.nodeType
            };
        });
        return result;
    }

    getStats() {
        return {
            nodeCount: this.nodes.length,
            reportCount: this.reportCount,
            totalDataPoints: this.reportCount * this.nodes.length,
            activeAnomalies: Array.from(this.nodeStates.values()).filter(s => s.anomaly).length,
            pendingScenarios: this.scenarioQueue.length,
            isRunning: !!this.simulateInterval
        };
    }
}

const simulator = new DataSimulator();

module.exports = {
    start: (handleSensorData) => {
        simulator.init();
        simulator.start(handleSensorData);
    },
    stop: () => simulator.stop(),
    getNodeState: (nodeId) => simulator.getNodeState(nodeId),
    getAllNodeStates: () => simulator.getAllNodeStates(),
    injectAnomaly: (nodeId, type) => simulator.injectAnomaly(nodeId, type),
    setNodePressure: (nodeId, value) => simulator.setNodePressure(nodeId, value),
    setNodeFlow: (nodeId, value) => simulator.setNodeFlow(nodeId, value),
    loadScenario: (scenarioConfig) => simulator.loadScenario(scenarioConfig),
    batchInject: (nodeIds, type) => simulator.batchInject(nodeIds, type),
    getStats: () => simulator.getStats(),
    DataSimulator
};
