class App {
    constructor() {
        this.networkRenderer = null;
        this.selectedNode = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        
        console.log('\n========== 初始化前端应用 ==========');
        
        this.networkRenderer = new NetworkRenderer('networkCanvas');
        console.log('[√] NetworkRenderer 已初始化');
        
        alarmManager.init();
        console.log('[√] AlarmManager 已初始化');
        
        leakManager.init();
        console.log('[√] LeakManager 已初始化');
        
        this.bindEvents();
        console.log('[√] 事件绑定完成');
        
        this.subscribeToEvents();
        console.log('[√] 事件订阅完成');
        
        await this.loadNetworkData();
        
        wsClient.connect();
        console.log('[√] WebSocket 连接中...');
        
        this.isInitialized = true;
        console.log('====================================\n');
    }

    bindEvents() {
        document.getElementById('zoomIn').addEventListener('click', () => {
            this.networkRenderer.zoomIn();
        });

        document.getElementById('zoomOut').addEventListener('click', () => {
            this.networkRenderer.zoomOut();
        });

        document.getElementById('resetView').addEventListener('click', () => {
            this.networkRenderer.resetView();
            this.hideNodeDetail();
        });

        document.getElementById('closeNodeDetail').addEventListener('click', () => {
            this.hideNodeDetail();
        });

        this.networkRenderer.onNodeClick = (node) => {
            this.showNodeDetail(node);
        };
    }

    subscribeToEvents() {
        eventBus.subscribe(events.SENSOR_UPDATE, (data) => {
            this.handleSensorUpdate(data);
        });

        eventBus.subscribe(events.CONNECTION_STATUS_CHANGED, (status) => {
            this.updateConnectionStatus(status.connected);
        });

        eventBus.subscribe(events.NETWORK_DATA_LOADED, (data) => {
            this.updateStats(data);
        });
    }

    async loadNetworkData() {
        try {
            const response = await fetch('/api/network-data');
            const data = await response.json();
            
            dataStore.setNetworkData(data.nodes, data.pipes);
            this.networkRenderer.setData(data.nodes, data.pipes);
            
            console.log(`[App] 管网数据加载完成: ${data.nodes.length} 节点, ${data.pipes.length} 管线`);
        } catch (err) {
            console.error('[App] 加载管网数据失败:', err);
        }
    }

    handleSensorUpdate(data) {
        this.networkRenderer.updateNodeData(data.node_id, data);
        dataStore.updateNodeData(data.node_id, data);

        if (this.selectedNode && this.selectedNode.node_id === data.node_id) {
            this.updateNodeDetailChart(this.selectedNode);
        }

        const realtimeSuspects = leakManager.calculateLeakSuspectsFromRealtime();
        realtimeSuspects.forEach(s => leakManager.addLeakSuspect(s));
    }

    updateConnectionStatus(online) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');

        if (online) {
            statusDot.className = 'status-dot online';
            statusText.textContent = '已连接';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = '连接断开';
        }
    }

    updateStats(data) {
        document.getElementById('totalNodes').textContent = data.nodes.length;
        
        const sensorNodes = data.nodes.filter(n => n.pressure_sensor || n.flow_sensor);
        document.getElementById('onlineSensors').textContent = sensorNodes.length;
    }

    showNodeDetail(node) {
        this.selectedNode = node;
        this.networkRenderer.selectedNode = node;
        eventBus.publish(events.NODE_SELECTED, node);

        const panel = document.getElementById('nodeDetailPanel');
        const content = document.getElementById('nodeDetailContent');
        const nodeData = dataStore.getNode(node.node_id);
        const history = dataStore.getNodeHistory(node.node_id);
        const latest = history.length > 0 ? history[history.length - 1] : null;

        content.innerHTML = `
            <div class="node-info">
                <div class="node-info-row">
                    <span class="node-info-label">节点ID</span>
                    <span class="node-info-value">${node.node_id}</span>
                </div>
                <div class="node-info-row">
                    <span class="node-info-label">名称</span>
                    <span class="node-info-value">${node.name || '-'}</span>
                </div>
                <div class="node-info-row">
                    <span class="node-info-label">类型</span>
                    <span class="node-info-value">${this.getNodeTypeName(node.type)}</span>
                </div>
                <div class="node-info-row">
                    <span class="node-info-label">当前压力</span>
                    <span class="node-info-value">${latest && latest.pressure !== null ? latest.pressure.toFixed(3) + ' MPa' : '-'}</span>
                </div>
                <div class="node-info-row">
                    <span class="node-info-label">当前流量</span>
                    <span class="node-info-value">${latest && latest.flow_rate !== null ? latest.flow_rate.toFixed(2) + ' L/s' : '-'}</span>
                </div>
                <div class="node-info-row">
                    <span class="node-info-label">压力传感器</span>
                    <span class="node-info-value">${node.pressure_sensor ? '✓ 已安装' : '✗ 未安装'}</span>
                </div>
                <div class="node-info-row">
                    <span class="node-info-label">流量计</span>
                    <span class="node-info-value">${node.flow_sensor ? '✓ 已安装' : '✗ 未安装'}</span>
                </div>
            </div>
            <div class="chart-container">
                <div class="chart-title">📈 近24小时趋势</div>
                <canvas id="trendCanvas" width="220" height="120"></canvas>
            </div>
        `;

        panel.style.display = 'block';

        setTimeout(() => {
            this.updateNodeDetailChart(node);
        }, 100);
    }

    hideNodeDetail() {
        this.selectedNode = null;
        this.networkRenderer.selectedNode = null;
        document.getElementById('nodeDetailPanel').style.display = 'none';
        this.networkRenderer.render();
    }

    updateNodeDetailChart(node) {
        const canvas = document.getElementById('trendCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const history = dataStore.getNodeHistory(node.node_id);

        const width = canvas.width;
        const height = canvas.height;

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, width, height);

        if (history.length < 2) {
            ctx.fillStyle = '#64748b';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('数据收集中...', width / 2, height / 2);
            return;
        }

        const pressures = history.map(d => d.pressure).filter(p => p !== null);
        const flows = history.map(d => d.flow_rate).filter(f => f !== null);

        const padding = { top: 15, right: 10, bottom: 15, left: 10 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }

        if (pressures.length > 1) {
            const minPressure = Math.min(...pressures);
            const maxPressure = Math.max(...pressures);
            const pressureRange = maxPressure - minPressure || 0.1;

            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            pressures.forEach((pressure, i) => {
                const x = padding.left + (chartWidth / (pressures.length - 1)) * i;
                const y = padding.top + chartHeight - ((pressure - minPressure) / pressureRange) * chartHeight;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
        }

        if (flows.length > 1) {
            const minFlow = Math.min(...flows);
            const maxFlow = Math.max(...flows);
            const flowRange = maxFlow - minFlow || 10;

            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            flows.forEach((flow, i) => {
                const x = padding.left + (chartWidth / (flows.length - 1)) * i;
                const y = padding.top + chartHeight - ((flow - minFlow) / flowRange) * chartHeight;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
        }

        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('压力', 10, 12);
        ctx.fillStyle = '#22c55e';
        ctx.fillText('流量', 45, 12);
    }

    getNodeTypeName(type) {
        const names = {
            'plant': '水厂',
            'pump': '泵站',
            'pressure_station': '调压站',
            'junction': '节点',
            'valve': '阀门',
            'hydrant': '消火栓'
        };
        return names[type] || type;
    }
}

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new App();
    app.init();
});
