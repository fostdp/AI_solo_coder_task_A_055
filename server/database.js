const fs = require('fs');
const path = require('path');

const useDb = process.env.USE_DB !== 'false';

let pool;
if (useDb) {
    try {
        const { Pool } = require('pg');
        pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'water_monitor',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            max: parseInt(process.env.DB_POOL_MAX) || 20,
            idleTimeoutMillis: 30000
        });
    } catch (e) {
        console.log('PostgreSQL模块未安装，使用内存模式');
    }
}

const memoryStorage = {
    sensorData: [],
    alarms: [],
    sensorStatus: new Map(),
    nightFlowBaseline: new Map(),
    leakSuspects: []
};

async function query(text, params) {
    if (!useDb || !pool) {
        return memoryQuery(text, params);
    }
    
    try {
        return await pool.query(text, params);
    } catch (err) {
        console.log('数据库查询失败，使用内存模式:', err.message);
        return memoryQuery(text, params);
    }
}

function memoryQuery(text, params) {
    if (text.includes('INSERT INTO sensor_data')) {
        memoryStorage.sensorData.push({
            node_id: params[0],
            pressure: params[1],
            flow_rate: params[2],
            timestamp: params[3],
            created_at: new Date()
        });
        if (memoryStorage.sensorData.length > 10000) {
            memoryStorage.sensorData = memoryStorage.sensorData.slice(-5000);
        }
        return { rows: [] };
    }
    
    if (text.includes('INSERT INTO sensor_status')) {
        memoryStorage.sensorStatus.set(params[0], {
            node_id: params[0],
            last_online: params[1],
            is_online: true,
            updated_at: new Date()
        });
        return { rows: [] };
    }
    
    if (text.includes('INSERT INTO alarms') || text.includes('INSERT INTO alarms')) {
        const alarm = {
            id: memoryStorage.alarms.length + 1,
            alarm_type: params[0],
            node_id: params[1],
            severity: params[2],
            message: params[3],
            value: params[4],
            threshold: params[5],
            timestamp: params[6],
            acknowledged: false,
            created_at: new Date()
        };
        memoryStorage.alarms.push(alarm);
        if (memoryStorage.alarms.length > 1000) {
            memoryStorage.alarms = memoryStorage.alarms.slice(-500);
        }
        return { rows: [], alarm };
    }
    
    if (text.includes('SELECT * FROM sensor_data')) {
        const nodeId = params[0];
        const data = memoryStorage.sensorData
            .filter(d => d.node_id === nodeId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return { rows: data };
    }
    
    if (text.includes('SELECT a.*, n.name as node_name')) {
        const limit = parseInt(params[0]) || 50;
        return { rows: memoryStorage.alarms.slice(-limit).reverse() };
    }
    
    if (text.includes('SELECT * FROM sensor_status')) {
        return { rows: Array.from(memoryStorage.sensorStatus.values()) };
    }
    
    return { rows: [] };
}

async function initDatabase() {
    if (!useDb || !pool) {
        console.log('使用内存存储模式');
        return;
    }
    
    try {
        await pool.query('SELECT 1');
        console.log('数据库连接成功');
    } catch (err) {
        console.log('数据库连接失败:', err.message);
    }
}

async function insertAlarm(alarmType, nodeId, severity, message, value, threshold, timestamp) {
    if (!useDb || !pool) {
        const result = await memoryQuery('INSERT INTO alarms VALUES ($1, $2, $3, $4, $5, $6, $7)', 
            [alarmType, nodeId, severity, message, value, threshold, timestamp]);
        return result.alarm;
    }
    
    try {
        const result = await pool.query(
            `INSERT INTO alarms (alarm_type, node_id, severity, message, value, threshold, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [alarmType, nodeId, severity, message, value, threshold, timestamp]
        );
        return result.rows[0];
    } catch (err) {
        console.error('插入告警失败:', err);
        return null;
    }
}

async function getSensorHistory(nodeId, limit = 10) {
    if (!useDb || !pool) {
        const data = memoryStorage.sensorData
            .filter(d => d.node_id === nodeId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
        return data;
    }
    
    try {
        const result = await pool.query(
            `SELECT * FROM sensor_data 
             WHERE node_id = $1 
             ORDER BY timestamp DESC LIMIT $2`,
            [nodeId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('获取历史数据失败:', err);
        return [];
    }
}

async function getOfflineSensors(thresholdMs) {
    if (!useDb || !pool) {
        const now = Date.now();
        const offline = [];
        memoryStorage.sensorStatus.forEach((status, nodeId) => {
            if (now - new Date(status.last_online).getTime() > thresholdMs) {
                offline.push({ node_id: nodeId, ...status });
            }
        });
        return offline;
    }
    
    try {
        const result = await pool.query(
            `SELECT * FROM sensor_status 
             WHERE last_online < NOW() - $1::interval
             AND is_online = true`,
            [`${thresholdMs} ms`]
        );
        return result.rows;
    } catch (err) {
        console.error('获取离线传感器失败:', err);
        return [];
    }
}

function getMemoryStorage() {
    return memoryStorage;
}

module.exports = {
    query,
    initDatabase,
    insertAlarm,
    getSensorHistory,
    getOfflineSensors,
    getMemoryStorage
};
