const fs = require('fs');
const path = require('path');
const { eventBus, events } = require('../core/EventBus');

class NetworkTopology {
    constructor() {
        this.nodes = [];
        this.pipes = [];
        this.nodeMap = new Map();
        this.pipeMap = new Map();
        this.isLoaded = false;
        this.configPath = null;
    }

    loadFromConfig(configName = 'demo') {
        const nodesPath = path.join(__dirname, `../../data/nodes-${configName}.json`);
        const pipesPath = path.join(__dirname, `../../data/pipes-${configName}.json`);

        try {
            if (!fs.existsSync(nodesPath)) {
                throw new Error(`节点配置文件不存在: ${nodesPath}`);
            }
            if (!fs.existsSync(pipesPath)) {
                throw new Error(`管线配置文件不存在: ${pipesPath}`);
            }

            const nodesData = fs.readFileSync(nodesPath, 'utf8');
            const pipesData = fs.readFileSync(pipesPath, 'utf8');

            this.nodes = JSON.parse(nodesData);
            this.pipes = JSON.parse(pipesData);
            this.configPath = { nodes: nodesPath, pipes: pipesPath };

            this.buildIndexes();
            this.isLoaded = true;

            eventBus.publish(events.NETWORK_TOPOLOGY_LOADED, {
                nodeCount: this.nodes.length,
                pipeCount: this.pipes.length,
                configName
            });

            console.log(`[NetworkTopology] 拓扑数据加载完成: ${this.nodes.length} 节点, ${this.pipes.length} 管线`);
            return true;
        } catch (err) {
            console.error('[NetworkTopology] 加载拓扑数据失败:', err.message);
            return false;
        }
    }

    loadFromDatabase(db) {
        return new Promise((resolve, reject) => {
            Promise.all([
                db.query('SELECT * FROM nodes ORDER BY node_id'),
                db.query('SELECT * FROM pipes ORDER BY pipe_id')
            ]).then(([nodesResult, pipesResult]) => {
                this.nodes = nodesResult.rows.map(row => ({
                    node_id: row.node_id,
                    name: row.name,
                    x: row.x_coordinate,
                    y: row.y_coordinate,
                    type: row.node_type,
                    pressure_sensor: row.pressure_sensor,
                    flow_sensor: row.flow_sensor
                }));

                this.pipes = pipesResult.rows.map(row => ({
                    pipe_id: row.pipe_id,
                    start_node_id: row.start_node_id,
                    end_node_id: row.end_node_id,
                    diameter: row.diameter,
                    length: row.length,
                    material: row.material
                }));

                this.buildIndexes();
                this.isLoaded = true;

                eventBus.publish(events.NETWORK_TOPOLOGY_LOADED, {
                    nodeCount: this.nodes.length,
                    pipeCount: this.pipes.length,
                    source: 'database'
                });

                console.log(`[NetworkTopology] 从数据库加载拓扑: ${this.nodes.length} 节点, ${this.pipes.length} 管线`);
                resolve(true);
            }).catch(err => {
                console.error('[NetworkTopology] 从数据库加载失败:', err.message);
                reject(err);
            });
        });
    }

    buildIndexes() {
        this.nodeMap.clear();
        this.nodes.forEach(node => {
            this.nodeMap.set(node.node_id, node);
        });

        this.pipeMap.clear();
        this.pipes.forEach(pipe => {
            this.pipeMap.set(pipe.pipe_id, pipe);
        });
    }

    getNode(nodeId) {
        return this.nodeMap.get(nodeId) || null;
    }

    getPipe(pipeId) {
        return this.pipeMap.get(pipeId) || null;
    }

    getNodes() {
        return [...this.nodes];
    }

    getPipes() {
        return [...this.pipes];
    }

    getSensorNodes() {
        return this.nodes.filter(n => n.pressure_sensor || n.flow_sensor);
    }

    getPressureSensorNodes() {
        return this.nodes.filter(n => n.pressure_sensor);
    }

    getFlowSensorNodes() {
        return this.nodes.filter(n => n.flow_sensor);
    }

    getNodePipes(nodeId) {
        return this.pipes.filter(p => 
            p.start_node_id === nodeId || p.end_node_id === nodeId
        );
    }

    getConnectedNodes(nodeId) {
        const connected = new Set();
        this.pipes.forEach(p => {
            if (p.start_node_id === nodeId) {
                connected.add(p.end_node_id);
            } else if (p.end_node_id === nodeId) {
                connected.add(p.start_node_id);
            }
        });
        return Array.from(connected);
    }

    getNodesByType(type) {
        return this.nodes.filter(n => n.type === type);
    }

    getPipesByDiameterRange(minDiameter, maxDiameter) {
        return this.pipes.filter(p => 
            p.diameter >= minDiameter && p.diameter <= maxDiameter
        );
    }

    getTotalPipeLength() {
        return this.pipes.reduce((sum, p) => sum + (p.length || 0), 0);
    }

    getStats() {
        return {
            nodeCount: this.nodes.length,
            pipeCount: this.pipes.length,
            sensorNodeCount: this.getSensorNodes().length,
            pressureSensorCount: this.getPressureSensorNodes().length,
            flowSensorCount: this.getFlowSensorNodes().length,
            totalPipeLength: this.getTotalPipeLength(),
            isLoaded: this.isLoaded
        };
    }

    reload() {
        if (this.configPath) {
            return this.loadFromConfig();
        }
        return false;
    }

    clear() {
        this.nodes = [];
        this.pipes = [];
        this.nodeMap.clear();
        this.pipeMap.clear();
        this.isLoaded = false;
        this.configPath = null;
    }
}

const networkTopology = new NetworkTopology();

module.exports = {
    NetworkTopology,
    networkTopology
};
