const db = require('../database');
const { eventBus, events } = require('../core/EventBus');

class WaterDataCollector {
    constructor() {
        this.nodeDataCache = new Map();
        this.maxCacheSize = 288;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        console.log('[WaterDataCollector] 初始化完成');
    }

    async collect(data) {
        const { node_id, pressure, flow_rate, timestamp } = data;

        if (!node_id) {
            console.warn('[WaterDataCollector] 缺少node_id，丢弃数据');
            return null;
        }

        const parsedData = {
            node_id,
            pressure: pressure !== undefined ? pressure : null,
            flow_rate: flow_rate !== undefined ? flow_rate : null,
            timestamp: timestamp ? new Date(timestamp) : new Date()
        };

        eventBus.publish(events.SENSOR_DATA_RECEIVED, parsedData);

        try {
            await this.storeData(parsedData);
            this.updateSensorStatus(parsedData);
            this.cacheData(parsedData);

            eventBus.publish(events.SENSOR_DATA_STORED, parsedData);

            return parsedData;
        } catch (err) {
            console.error('[WaterDataCollector] 数据处理失败:', err);
            return null;
        }
    }

    async storeData(data) {
        await db.query(
            `INSERT INTO sensor_data (node_id, pressure, flow_rate, timestamp)
             VALUES ($1, $2, $3, $4)`,
            [data.node_id, data.pressure, data.flow_rate, data.timestamp]
        );
    }

    async updateSensorStatus(data) {
        await db.query(
            `INSERT INTO sensor_status (node_id, last_online, is_online)
             VALUES ($1, $2, true)
             ON CONFLICT (node_id) DO UPDATE 
             SET last_online = $2, is_online = true, updated_at = NOW()`,
            [data.node_id, data.timestamp]
        );
    }

    cacheData(data) {
        if (!this.nodeDataCache.has(data.node_id)) {
            this.nodeDataCache.set(data.node_id, []);
        }

        const cache = this.nodeDataCache.get(data.node_id);
        cache.push({
            pressure: data.pressure,
            flowRate: data.flow_rate,
            timestamp: data.timestamp
        });

        if (cache.length > this.maxCacheSize) {
            cache.shift();
        }
    }

    getNodeData(nodeId, limit = 288) {
        const cache = this.nodeDataCache.get(nodeId);
        if (!cache) return [];
        return cache.slice(-limit);
    }

    getAllNodeIds() {
        return Array.from(this.nodeDataCache.keys());
    }

    getLatestData(nodeId) {
        const cache = this.nodeDataCache.get(nodeId);
        if (!cache || cache.length === 0) return null;
        return cache[cache.length - 1];
    }

    clearCache() {
        this.nodeDataCache.clear();
    }

    getCacheStats() {
        let totalEntries = 0;
        this.nodeDataCache.forEach(cache => {
            totalEntries += cache.length;
        });
        return {
            nodeCount: this.nodeDataCache.size,
            totalEntries,
            avgPerNode: this.nodeDataCache.size > 0 ? Math.round(totalEntries / this.nodeDataCache.size) : 0
        };
    }
}

const collector = new WaterDataCollector();

module.exports = {
    WaterDataCollector,
    collector
};
