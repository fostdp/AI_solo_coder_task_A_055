class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    subscribe(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        return () => this.unsubscribe(event, callback);
    }

    unsubscribe(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    publish(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach(callback => {
            try {
                callback(data);
            } catch (err) {
                console.error(`[EventBus] 事件处理错误 [${event}]:`, err);
            }
        });
    }

    once(event, callback) {
        const wrapper = (data) => {
            this.unsubscribe(event, wrapper);
            callback(data);
        };
        this.subscribe(event, wrapper);
    }

    clear() {
        this.listeners.clear();
    }

    getListenerCount(event) {
        return this.listeners.has(event) ? this.listeners.get(event).length : 0;
    }
}

const eventBus = new EventBus();

module.exports = {
    EventBus,
    eventBus,
    events: {
        SENSOR_DATA_RECEIVED: 'sensor:data:received',
        SENSOR_DATA_STORED: 'sensor:data:stored',
        NIGHT_FLOW_BASELINE_UPDATED: 'nightflow:baseline:updated',
        NIGHT_ANALYSIS_COMPLETE: 'nightflow:analysis:complete',
        LEAK_SUSPECT_DETECTED: 'leak:suspect:detected',
        ALARM_DETECTED: 'alarm:detected',
        ALARM_BROADCAST: 'alarm:broadcast',
        NOTIFICATION_SENT: 'notification:sent',
        NETWORK_TOPOLOGY_LOADED: 'network:topology:loaded'
    }
};
