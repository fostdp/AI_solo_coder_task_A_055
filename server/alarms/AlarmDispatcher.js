const db = require('../database');
const config = require('../../config/system');
const { collector } = require('../collectors/WaterDataCollector');
const { nightFlowAnalyzer } = require('../analyzers/NightFlowAnalyzer');
const { eventBus, events } = require('../core/EventBus');

class AlarmDispatcher {
    constructor() {
        this.lastPressure = new Map();
        this.pendingBurstChecks = new Map();
        this.alarmCooldown = new Map();
        this.offlineCheckInterval = null;
        this.isRunning = false;

        this.OFFLINE_THRESHOLD = config.sensors.offlineThreshold;
        this.PRESSURE_DROP_THRESHOLD = config.alarm.pressureDropThreshold;
        this.COOLDOWN_PERIOD = 5 * 60 * 1000;
        this.BURST_OBSERVATION_PERIOD = 5 * 60 * 1000;
        this.PRESSURE_RECOVERY_RATIO = 0.7;
        this.NIGHT_START_HOUR = config.alarm.nightStartHour;
        this.NIGHT_END_HOUR = config.alarm.nightEndHour;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        eventBus.subscribe(events.SENSOR_DATA_STORED, (data) => {
            this.processAlarms(data);
        });

        this.startOfflineCheck();

        console.log('[AlarmDispatcher] 已启动');
    }

    stop() {
        if (this.offlineCheckInterval) {
            clearInterval(this.offlineCheckInterval);
            this.offlineCheckInterval = null;
        }
        this.isRunning = false;
        console.log('[AlarmDispatcher] 已停止');
    }

    async processAlarms(data) {
        const alarms = [];

        const pipeBurstAlarm = this.checkPipeBurst(data.node_id, data.pressure, data.timestamp);
        if (pipeBurstAlarm) {
            alarms.push(pipeBurstAlarm);
        }

        const nightLeakAlarm = this.checkNightFlowLeak(data.node_id, data.flow_rate, data.timestamp);
        if (nightLeakAlarm) {
            alarms.push(nightLeakAlarm);
        }

        if (data.pressure !== null) {
            this.lastPressure.set(data.node_id, {
                pressure: data.pressure,
                timestamp: data.timestamp
            });
        }

        for (const alarm of alarms) {
            const savedAlarm = await this.saveAlarm(alarm);
            if (savedAlarm) {
                eventBus.publish(events.ALARM_DETECTED, savedAlarm);
            }
        }

        return alarms;
    }

    checkPipeBurst(nodeId, currentPressure, timestamp) {
        if (currentPressure === null || currentPressure === undefined) {
            return null;
        }

        const last = this.lastPressure.get(nodeId);
        if (!last) return null;

        const pressureDrop = last.pressure - currentPressure;

        if (pressureDrop >= this.PRESSURE_DROP_THRESHOLD) {
            const pendingKey = `burst_pending_${nodeId}`;
            const existing = this.pendingBurstChecks.get(pendingKey);

            if (existing) {
                if (currentPressure >= existing.originalPressure * this.PRESSURE_RECOVERY_RATIO) {
                    this.pendingBurstChecks.delete(pendingKey);
                    console.log(`[AlarmDispatcher] 节点 ${nodeId} 压力已恢复，取消爆管预警`);
                    return null;
                }
            }

            if (!existing) {
                this.pendingBurstChecks.set(pendingKey, {
                    nodeId,
                    originalPressure: last.pressure,
                    dropTime: timestamp,
                    dropAmount: pressureDrop,
                    checkCount: 1
                });
                console.log(`[AlarmDispatcher] 节点 ${nodeId} 压力骤降 ${pressureDrop.toFixed(3)} MPa，进入5分钟观察期`);
                return null;
            }

            existing.checkCount++;
            const elapsed = timestamp - existing.dropTime;

            if (elapsed >= this.BURST_OBSERVATION_PERIOD) {
                const currentRecovery = currentPressure / existing.originalPressure;

                if (currentRecovery >= this.PRESSURE_RECOVERY_RATIO) {
                    this.pendingBurstChecks.delete(pendingKey);
                    console.log(`[AlarmDispatcher] 节点 ${nodeId} 观察期结束，压力已恢复，判定为正常波动`);
                    return null;
                }

                this.pendingBurstChecks.delete(pendingKey);

                if (this.isInCooldown(`burst_${nodeId}`, timestamp)) {
                    return null;
                }

                const totalDrop = existing.originalPressure - currentPressure;
                return {
                    alarm_type: 'pipe_burst',
                    node_id: nodeId,
                    severity: 'critical',
                    message: `节点 ${nodeId} 压力骤降 ${totalDrop.toFixed(3)} MPa，观察5分钟后未恢复，可能发生爆管`,
                    value: totalDrop,
                    threshold: this.PRESSURE_DROP_THRESHOLD,
                    timestamp: timestamp
                };
            }

            return null;
        }

        const pendingKey = `burst_pending_${nodeId}`;
        const existing = this.pendingBurstChecks.get(pendingKey);
        if (existing) {
            const recovery = currentPressure / existing.originalPressure;
            if (recovery >= this.PRESSURE_RECOVERY_RATIO) {
                this.pendingBurstChecks.delete(pendingKey);
                console.log(`[AlarmDispatcher] 节点 ${nodeId} 压力已恢复，取消爆管预警`);
            }
        }

        return null;
    }

    checkNightFlowLeak(nodeId, flowRate, timestamp) {
        if (flowRate === null || flowRate === undefined) {
            return null;
        }

        const hour = timestamp.getHours();
        if (hour < this.NIGHT_START_HOUR || hour >= this.NIGHT_END_HOUR) {
            return null;
        }

        const anomaly = nightFlowAnalyzer.checkLeakAnomaly(nodeId, flowRate, timestamp);
        if (!anomaly) return null;

        if (this.isInCooldown(`night_leak_${nodeId}`, timestamp)) {
            return null;
        }

        const dayCategory = anomaly.category === 'weekend' ? '周末' : '工作日';
        return {
            alarm_type: 'night_flow_leak',
            node_id: nodeId,
            severity: 'warning',
            message: `节点 ${nodeId} 夜间流量 ${flowRate.toFixed(2)} L/s 超过${dayCategory}基准值 1.5 倍，疑似漏损`,
            value: flowRate,
            threshold: anomaly.threshold,
            timestamp: timestamp
        };
    }

    startOfflineCheck() {
        if (this.offlineCheckInterval) return;

        this.offlineCheckInterval = setInterval(async () => {
            const offlineSensors = await db.getOfflineSensors(this.OFFLINE_THRESHOLD);
            const now = new Date();

            for (const sensor of offlineSensors) {
                if (this.isInCooldown(`offline_${sensor.node_id}`, now)) {
                    continue;
                }

                const alarm = {
                    alarm_type: 'sensor_offline',
                    node_id: sensor.node_id,
                    severity: 'warning',
                    message: `传感器 ${sensor.node_id} 离线超过 ${this.OFFLINE_THRESHOLD / 60000} 分钟`,
                    value: null,
                    threshold: this.OFFLINE_THRESHOLD,
                    timestamp: now
                };

                const savedAlarm = await this.saveAlarm(alarm);
                if (savedAlarm) {
                    eventBus.publish(events.ALARM_DETECTED, savedAlarm);
                }
            }
        }, 60000);
    }

    isInCooldown(key, timestamp) {
        const lastAlarm = this.alarmCooldown.get(key);
        if (lastAlarm && (timestamp - lastAlarm < this.COOLDOWN_PERIOD)) {
            return true;
        }
        this.alarmCooldown.set(key, timestamp);
        return false;
    }

    async saveAlarm(alarm) {
        try {
            return await db.insertAlarm(
                alarm.alarm_type,
                alarm.node_id,
                alarm.severity,
                alarm.message,
                alarm.value,
                alarm.threshold,
                alarm.timestamp
            );
        } catch (err) {
            console.error('[AlarmDispatcher] 保存告警失败:', err);
            return null;
        }
    }

    getPendingBurstChecks() {
        return Array.from(this.pendingBurstChecks.values());
    }

    getStats() {
        return {
            pendingBurstChecks: this.pendingBurstChecks.size,
            cooldownEntries: this.alarmCooldown.size,
            isRunning: this.isRunning
        };
    }

    clearState() {
        this.lastPressure.clear();
        this.pendingBurstChecks.clear();
        this.alarmCooldown.clear();
    }
}

const alarmDispatcher = new AlarmDispatcher();

module.exports = {
    AlarmDispatcher,
    alarmDispatcher
};
