class AlarmManager {
    constructor() {
        this.alarms = [];
        this.maxAlarms = 50;
        this.audioContext = null;
    }

    init() {
        eventBus.subscribe(events.ALARM_RECEIVED, (alarm) => {
            this.addAlarm(alarm);
        });
        console.log('[AlarmManager] 已初始化');
    }

    addAlarm(alarm) {
        this.alarms.unshift(alarm);
        if (this.alarms.length > this.maxAlarms) {
            this.alarms.pop();
        }
        this.playAlarmSound();
        this.updateUI();
        return alarm;
    }

    getAlarms(limit = 20) {
        return this.alarms.slice(0, limit);
    }

    getAlarmCount() {
        return this.alarms.length;
    }

    getCriticalAlarms() {
        return this.alarms.filter(a => a.severity === 'critical');
    }

    playAlarmSound() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.3);
        } catch (e) {
        }
    }

    updateUI() {
        this.updateAlarmList();
        this.updateAlarmCount();
    }

    updateAlarmList() {
        const alarmList = document.getElementById('alarmList');
        if (!alarmList) return;

        if (this.alarms.length === 0) {
            alarmList.innerHTML = '<div class="empty-state">暂无告警</div>';
            return;
        }

        const alarmTypeNames = {
            'pipe_burst': '爆管预警',
            'night_flow_leak': '漏损预警',
            'sensor_offline': '离线告警'
        };

        alarmList.innerHTML = this.alarms.slice(0, 20).map(alarm => {
            const severity = alarm.severity === 'critical' ? 'critical' : 
                           alarm.severity === 'warning' ? 'warning' : 'info';
            const time = new Date(alarm.timestamp).toLocaleTimeString('zh-CN');

            return `
                <div class="alarm-item ${severity}">
                    <div class="alarm-header">
                        <span class="alarm-type">${alarmTypeNames[alarm.alarm_type] || alarm.alarm_type}</span>
                        <span class="alarm-time">${time}</span>
                    </div>
                    <div class="alarm-message">${alarm.message}</div>
                </div>
            `;
        }).join('');
    }

    updateAlarmCount() {
        const countEl = document.getElementById('alarmCount');
        if (countEl) {
            countEl.textContent = this.alarms.length;
        }
    }

    clear() {
        this.alarms = [];
        this.updateUI();
    }
}

const alarmManager = new AlarmManager();
