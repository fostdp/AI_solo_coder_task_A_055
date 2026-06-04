const WebSocket = require('ws');
const { eventBus, events } = require('../core/EventBus');

class AlertNotifier {
    constructor() {
        this.clients = new Set();
        this.isRunning = false;
        this.messageStats = {
            sensorUpdates: 0,
            alarms: 0,
            nightAnalysis: 0,
            leakSuspects: 0
        };
    }

    attachWebSocketServer(wss) {
        wss.on('connection', (ws) => {
            this.addClient(ws);
            
            ws.on('close', () => {
                this.removeClient(ws);
            });
        });
    }

    addClient(ws) {
        this.clients.add(ws);
        console.log(`[AlertNotifier] 客户端已连接，当前连接数: ${this.clients.size}`);
    }

    removeClient(ws) {
        this.clients.delete(ws);
        console.log(`[AlertNotifier] 客户端已断开，当前连接数: ${this.clients.size}`);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        eventBus.subscribe(events.SENSOR_DATA_STORED, (data) => {
            this.broadcastSensorUpdate(data);
        });

        eventBus.subscribe(events.ALARM_DETECTED, (alarm) => {
            this.broadcastAlarm(alarm);
        });

        eventBus.subscribe(events.NIGHT_ANALYSIS_COMPLETE, (result) => {
            this.broadcastNightAnalysis(result);
        });

        eventBus.subscribe(events.LEAK_SUSPECT_DETECTED, (suspect) => {
            this.broadcastLeakSuspect(suspect);
        });

        console.log('[AlertNotifier] 已启动');
    }

    stop() {
        this.isRunning = false;
        console.log('[AlertNotifier] 已停止');
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        let successCount = 0;
        let failCount = 0;

        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(data);
                    successCount++;
                } catch (err) {
                    failCount++;
                    console.error('[AlertNotifier] 消息发送失败:', err.message);
                }
            }
        });

        eventBus.publish(events.NOTIFICATION_SENT, {
            messageType: message.type,
            successCount,
            failCount
        });

        return successCount;
    }

    broadcastSensorUpdate(data) {
        this.messageStats.sensorUpdates++;
        return this.broadcast({
            type: 'sensor_update',
            data: {
                node_id: data.node_id,
                pressure: data.pressure,
                flow_rate: data.flow_rate,
                timestamp: data.timestamp
            }
        });
    }

    broadcastAlarm(alarm) {
        this.messageStats.alarms++;
        return this.broadcast({
            type: 'alarm',
            data: alarm
        });
    }

    broadcastNightAnalysis(result) {
        this.messageStats.nightAnalysis++;
        return this.broadcast({
            type: 'night_analysis_complete',
            data: result
        });
    }

    broadcastLeakSuspect(suspect) {
        this.messageStats.leakSuspects++;
        return this.broadcast({
            type: 'leak_suspect',
            data: suspect
        });
    }

    broadcastCustom(type, data) {
        return this.broadcast({ type, data });
    }

    getClientCount() {
        return this.clients.size;
    }

    getStats() {
        return {
            ...this.messageStats,
            clientCount: this.clients.size,
            isRunning: this.isRunning
        };
    }

    resetStats() {
        this.messageStats = {
            sensorUpdates: 0,
            alarms: 0,
            nightAnalysis: 0,
            leakSuspects: 0
        };
    }
}

const alertNotifier = new AlertNotifier();

module.exports = {
    AlertNotifier,
    alertNotifier
};
