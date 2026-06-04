class DataStore {
    constructor() {
        this.nodeHistory = new Map();
        this.networkData = { nodes: [], pipes: [] };
        this.maxHistorySize = 288;
    }

    updateNodeData(nodeId, data) {
        if (!this.nodeHistory.has(nodeId)) {
            this.nodeHistory.set(nodeId, []);
        }

        const history = this.nodeHistory.get(nodeId);
        history.push({
            timestamp: new Date(data.timestamp),
            pressure: data.pressure,
            flow_rate: data.flow_rate
        });

        if (history.length > this.maxHistorySize) {
            history.shift();
        }

        return history;
    }

    getNodeHistory(nodeId, limit = 288) {
        const history = this.nodeHistory.get(nodeId);
        if (!history) return [];
        return history.slice(-limit);
    }

    getLatestData(nodeId) {
        const history = this.nodeHistory.get(nodeId);
        if (!history || history.length === 0) return null;
        return history[history.length - 1];
    }

    setNetworkData(nodes, pipes) {
        this.networkData = { nodes, pipes };
        eventBus.publish(events.NETWORK_DATA_LOADED, this.networkData);
        return this.networkData;
    }

    getNetworkData() {
        return this.networkData;
    }

    getSensorNodes() {
        return this.networkData.nodes.filter(n => n.pressure_sensor || n.flow_sensor);
    }

    getNode(nodeId) {
        return this.networkData.nodes.find(n => n.node_id === nodeId) || null;
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = values.length;

        values.forEach((y, i) => {
            sumX += i;
            sumY += y;
            sumXY += i * y;
            sumX2 += i * i;
        });

        return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }

    clear() {
        this.nodeHistory.clear();
        this.networkData = { nodes: [], pipes: [] };
    }
}

const dataStore = new DataStore();
