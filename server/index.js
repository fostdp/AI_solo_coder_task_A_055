const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const config = require('../config/system');
const db = require('./database');

const { eventBus, events } = require('./core/EventBus');
const { collector } = require('./collectors/WaterDataCollector');
const { nightFlowAnalyzer } = require('./analyzers/NightFlowAnalyzer');
const { leakAnalysisEngine } = require('./analyzers/LeakAnalysisEngine');
const { alarmDispatcher } = require('./alarms/AlarmDispatcher');
const { alertNotifier } = require('./notifiers/AlertNotifier');
const { networkTopology } = require('./config/NetworkTopology');
const dataSimulator = require('./data-simulator');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

app.get('/api/nodes', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM nodes ORDER BY node_id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/pipes', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM pipes ORDER BY pipe_id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sensor-data/:nodeId', async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { hours = 24 } = req.query;
        const result = await db.query(
            `SELECT * FROM sensor_data 
             WHERE node_id = $1 AND timestamp >= NOW() - $2::interval
             ORDER BY timestamp DESC`,
            [nodeId, `${hours} hours`]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/alarms', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const result = await db.query(
            `SELECT a.*, n.name as node_name 
             FROM alarms a 
             LEFT JOIN nodes n ON a.node_id = n.node_id
             ORDER BY timestamp DESC LIMIT $1`,
            [limit]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/leak-suspects', async (req, res) => {
    try {
        const suspects = leakAnalysisEngine.getTopSuspects(20);
        res.json(suspects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/network-data', (req, res) => {
    try {
        if (!networkTopology.isLoaded) {
            return res.status(500).json({ error: '拓扑数据未加载' });
        }
        res.json({
            nodes: networkTopology.getNodes(),
            pipes: networkTopology.getPipes()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats', (req, res) => {
    res.json({
        collector: collector.getCacheStats(),
        nightFlow: nightFlowAnalyzer.getStats(),
        leakAnalysis: leakAnalysisEngine.getStats(),
        alarms: alarmDispatcher.getStats(),
        notifier: alertNotifier.getStats(),
        topology: networkTopology.getStats(),
        simulator: dataSimulator.getStats()
    });
});

app.post('/api/simulator/inject', (req, res) => {
    try {
        const { nodeId, type } = req.body;
        if (!nodeId || !type) {
            return res.status(400).json({ error: '需要 nodeId 和 type(burst/leak) 参数' });
        }
        const result = dataSimulator.injectAnomaly(nodeId, type);
        res.json({ success: result, nodeId, type });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/simulator/batch-inject', (req, res) => {
    try {
        const { nodes, type } = req.body;
        if (!Array.isArray(nodes) || !type) {
            return res.status(400).json({ error: '需要 nodes(数组) 和 type(burst/leak) 参数' });
        }
        dataSimulator.batchInject(nodes, type);
        res.json({ success: true, count: nodes.length, type });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/simulator/set-node', (req, res) => {
    try {
        const { nodeId, pressure, flow } = req.body;
        if (!nodeId) {
            return res.status(400).json({ error: '需要 nodeId 参数' });
        }
        const results = {};
        if (pressure !== undefined) results.pressure = dataSimulator.setNodePressure(nodeId, pressure);
        if (flow !== undefined) results.flow = dataSimulator.setNodeFlow(nodeId, flow);
        res.json({ success: true, nodeId, ...results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/simulator/scenario', (req, res) => {
    try {
        const scenario = req.body;
        if (!scenario.steps || !Array.isArray(scenario.steps)) {
            return res.status(400).json({ error: '需要 steps 数组参数' });
        }
        dataSimulator.loadScenario(scenario);
        res.json({ success: true, stepCount: scenario.steps.length, name: scenario.name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/simulator/nodes', (req, res) => {
    try {
        const states = dataSimulator.getAllNodeStates();
        res.json(states);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

wss.on('connection', (ws) => {
    console.log('客户端已连接');
    
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'sensor_data') {
                await collector.collect(message.data);
            }
        } catch (err) {
            console.error('消息处理错误:', err);
        }
    });
    
    ws.on('close', () => {
        console.log('客户端已断开');
    });
});

function initModules() {
    console.log('\n========== 初始化模块 ==========');
    
    collector.init();
    console.log('[√] WaterDataCollector 已初始化');
    
    const topologyLoaded = networkTopology.loadFromConfig('demo');
    console.log(`[${topologyLoaded ? '√' : '×'}] NetworkTopology 已加载`);
    
    nightFlowAnalyzer.start();
    console.log('[√] NightFlowAnalyzer 已启动');
    
    leakAnalysisEngine.start();
    console.log('[√] LeakAnalysisEngine 已启动');
    
    alarmDispatcher.start();
    console.log('[√] AlarmDispatcher 已启动');
    
    alertNotifier.attachWebSocketServer(wss);
    alertNotifier.start();
    console.log('[√] AlertNotifier 已启动');
    
    console.log('================================\n');
}

const HTTP_PORT = process.env.HTTP_PORT || config.server.httpPort;

server.listen(HTTP_PORT, async () => {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║   城市供水管网漏损监测系统 v2.0         ║`);
    console.log(`║   模块化重构版本                        ║`);
    console.log(`╚════════════════════════════════════════╝\n`);
    
    console.log(`服务器运行在: http://localhost:${HTTP_PORT}`);
    console.log(`WebSocket 服务已就绪\n`);
    
    initModules();
    
    if (process.env.USE_DB !== 'false') {
        await db.initDatabase();
    }
    
    if (process.env.SIMULATE_DATA !== 'false') {
        dataSimulator.start((data) => collector.collect(data));
    }
});

module.exports = {
    app,
    server,
    wss,
    eventBus,
    collector,
    nightFlowAnalyzer,
    leakAnalysisEngine,
    alarmDispatcher,
    alertNotifier,
    networkTopology
};
