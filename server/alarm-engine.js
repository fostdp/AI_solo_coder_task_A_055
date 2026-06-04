const db = require('./database');
const config = require('../config/system');

const lastPressure = new Map();
const pendingBurstChecks = new Map();
const alarmCooldown = new Map();
const OFFLINE_THRESHOLD = config.sensors.offlineThreshold;
const PRESSURE_DROP_THRESHOLD = config.alarm.pressureDropThreshold;
const NIGHT_FLOW_MULTIPLIER = config.alarm.nightFlowMultiplier;
const NIGHT_START_HOUR = config.alarm.nightStartHour;
const NIGHT_END_HOUR = config.alarm.nightEndHour;
const COOLDOWN_PERIOD = 5 * 60 * 1000;
const BURST_OBSERVATION_PERIOD = 5 * 60 * 1000;
const PRESSURE_RECOVERY_RATIO = 0.7;

async function checkAlarms(nodeId, pressure, flowRate, timestamp) {
    const alarms = [];
    const now = new Date(timestamp);
    
    const pipeBurstAlarm = await checkPipeBurst(nodeId, pressure, now);
    if (pipeBurstAlarm) alarms.push(pipeBurstAlarm);
    
    const nightLeakAlarm = await checkNightFlowLeak(nodeId, flowRate, now);
    if (nightLeakAlarm) alarms.push(nightLeakAlarm);
    
    lastPressure.set(nodeId, { pressure, timestamp: now });
    
    return alarms;
}

async function checkPipeBurst(nodeId, currentPressure, timestamp) {
    const last = lastPressure.get(nodeId);
    
    if (!last) return null;
    
    const pressureDrop = last.pressure - currentPressure;
    
    if (pressureDrop >= PRESSURE_DROP_THRESHOLD) {
        const pendingKey = `burst_pending_${nodeId}`;
        const existing = pendingBurstChecks.get(pendingKey);
        
        if (existing) {
            if (currentPressure >= existing.originalPressure * PRESSURE_RECOVERY_RATIO) {
                pendingBurstChecks.delete(pendingKey);
                console.log(`节点 ${nodeId} 压力已恢复，取消爆管预警（恢复率 ${(currentPressure / existing.originalPressure * 100).toFixed(1)}%）`);
                return null;
            }
        }
        
        if (!existing) {
            pendingBurstChecks.set(pendingKey, {
                nodeId,
                originalPressure: last.pressure,
                dropTime: timestamp,
                dropAmount: pressureDrop,
                checkCount: 1
            });
            console.log(`节点 ${nodeId} 压力骤降 ${pressureDrop.toFixed(3)} MPa，进入5分钟观察期`);
            return null;
        }
        
        existing.checkCount++;
        const elapsed = timestamp - existing.dropTime;
        
        if (elapsed >= BURST_OBSERVATION_PERIOD) {
            const currentRecovery = currentPressure / existing.originalPressure;
            
            if (currentRecovery >= PRESSURE_RECOVERY_RATIO) {
                pendingBurstChecks.delete(pendingKey);
                console.log(`节点 ${nodeId} 观察期结束，压力已恢复 ${(currentRecovery * 100).toFixed(1)}%，判定为正常用水波动`);
                return null;
            }
            
            pendingBurstChecks.delete(pendingKey);
            
            const cooldownKey = `burst_${nodeId}`;
            const lastAlarm = alarmCooldown.get(cooldownKey);
            
            if (lastAlarm && (timestamp - lastAlarm < COOLDOWN_PERIOD)) {
                return null;
            }
            
            alarmCooldown.set(cooldownKey, timestamp);
            
            const totalDrop = existing.originalPressure - currentPressure;
            const alarm = await db.insertAlarm(
                'pipe_burst',
                nodeId,
                'critical',
                `节点 ${nodeId} 压力骤降 ${totalDrop.toFixed(3)} MPa，观察${Math.round(BURST_OBSERVATION_PERIOD/60000)}分钟后未恢复，可能发生爆管`,
                totalDrop,
                PRESSURE_DROP_THRESHOLD,
                timestamp
            );
            
            return alarm;
        }
        
        return null;
    }
    
    const pendingKey = `burst_pending_${nodeId}`;
    const existing = pendingBurstChecks.get(pendingKey);
    if (existing) {
        const recovery = currentPressure / existing.originalPressure;
        if (recovery >= PRESSURE_RECOVERY_RATIO) {
            pendingBurstChecks.delete(pendingKey);
            console.log(`节点 ${nodeId} 压力已恢复（恢复率 ${(recovery * 100).toFixed(1)}%），取消爆管预警`);
        }
    }
    
    return null;
}

async function checkNightFlowLeak(nodeId, flowRate, timestamp) {
    const hour = timestamp.getHours();
    
    if (hour < NIGHT_START_HOUR || hour >= NIGHT_END_HOUR) {
        return null;
    }
    
    if (!flowRate) return null;
    
    const baseline = getNightFlowBaseline(nodeId, timestamp);
    if (!baseline) {
        updateNightFlowBaseline(nodeId, flowRate, timestamp);
        return null;
    }
    
    const threshold = baseline * NIGHT_FLOW_MULTIPLIER;
    if (flowRate > threshold) {
        const cooldownKey = `night_leak_${nodeId}`;
        const lastAlarm = alarmCooldown.get(cooldownKey);
        
        if (lastAlarm && (timestamp - lastAlarm < COOLDOWN_PERIOD)) {
            return null;
        }
        
        alarmCooldown.set(cooldownKey, timestamp);
        
        const dayCategory = getWeekdayCategory(timestamp);
        const alarm = await db.insertAlarm(
            'night_flow_leak',
            nodeId,
            'warning',
            `节点 ${nodeId} 夜间流量 ${flowRate.toFixed(2)} L/s 超过${dayCategory === 'weekend' ? '周末' : '工作日'}基准值 ${NIGHT_FLOW_MULTIPLIER} 倍，疑似漏损`,
            flowRate,
            threshold,
            timestamp
        );
        
        return alarm;
    }
    
    updateNightFlowBaseline(nodeId, flowRate, timestamp);
    return null;
}

function getWeekdayCategory(date) {
    const day = date.getDay();
    if (day === 0 || day === 6) return 'weekend';
    return 'weekday';
}

const nightFlowBaselines = new Map();

function getNightFlowBaseline(nodeId, timestamp) {
    const cat = getWeekdayCategory(timestamp);
    const key = `${nodeId}_${cat}`;
    return nightFlowBaselines.get(key);
}

function updateNightFlowBaseline(nodeId, flowRate, timestamp) {
    const cat = getWeekdayCategory(timestamp);
    const key = `${nodeId}_${cat}`;
    const current = nightFlowBaselines.get(key);
    if (!current) {
        nightFlowBaselines.set(key, flowRate);
    } else {
        const newBaseline = current * 0.9 + flowRate * 0.1;
        nightFlowBaselines.set(key, newBaseline);
    }
}

let offlineCheckInterval;

function startOfflineCheck(broadcast) {
    if (offlineCheckInterval) return;
    
    offlineCheckInterval = setInterval(async () => {
        const offlineSensors = await db.getOfflineSensors(OFFLINE_THRESHOLD);
        
        for (const sensor of offlineSensors) {
            const cooldownKey = `offline_${sensor.node_id}`;
            const lastAlarm = alarmCooldown.get(cooldownKey);
            const now = new Date();
            
            if (lastAlarm && (now - lastAlarm < COOLDOWN_PERIOD)) {
                continue;
            }
            
            alarmCooldown.set(cooldownKey, now);
            
            const alarm = await db.insertAlarm(
                'sensor_offline',
                sensor.node_id,
                'warning',
                `传感器 ${sensor.node_id} 离线超过 ${OFFLINE_THRESHOLD / 60000} 分钟`,
                null,
                OFFLINE_THRESHOLD,
                now
            );
            
            if (alarm && broadcast) {
                broadcast({ type: 'alarm', data: alarm });
            }
        }
    }, 60000);
}

function getPressureStatus(pressure) {
    const { normalPressureMin, normalPressureMax, warningPressureMin, warningPressureMax } = config.hydraulic;
    
    if (pressure < warningPressureMin || pressure > warningPressureMax) {
        return 'critical';
    }
    
    if (pressure < normalPressureMin || pressure > normalPressureMax) {
        return 'warning';
    }
    
    return 'normal';
}

module.exports = {
    checkAlarms,
    startOfflineCheck,
    getPressureStatus,
    getNightFlowBaseline
};
