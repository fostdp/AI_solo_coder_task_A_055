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
                console.error(`[EventBus] Error in event [${event}]:`, err);
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
}

const eventBus = new EventBus();

const events = {
    SENSOR_UPDATE: 'sensor:update',
    ALARM_RECEIVED: 'alarm:received',
    NIGHT_ANALYSIS_COMPLETE: 'night:analysis:complete',
    LEAK_SUSPECT: 'leak:suspect',
    NODE_SELECTED: 'node:selected',
    NETWORK_DATA_LOADED: 'network:data:loaded',
    CONNECTION_STATUS_CHANGED: 'connection:status:changed'
};
