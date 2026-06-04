class WebSocketClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 3000;
        this.isConnected = false;
        this.messageHandlers = new Map();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('[WebSocketClient] 连接成功');
            eventBus.publish(events.CONNECTION_STATUS_CHANGED, { connected: true });
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            console.log('[WebSocketClient] 连接断开');
            eventBus.publish(events.CONNECTION_STATUS_CHANGED, { connected: false });
            this.attemptReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[WebSocketClient] 连接错误:', err);
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (err) {
                console.error('[WebSocketClient] 消息解析失败:', err);
            }
        };
    }

    handleMessage(message) {
        switch (message.type) {
            case 'sensor_update':
                eventBus.publish(events.SENSOR_UPDATE, message.data);
                break;
            case 'alarm':
                eventBus.publish(events.ALARM_RECEIVED, message.data);
                break;
            case 'night_analysis_complete':
                eventBus.publish(events.NIGHT_ANALYSIS_COMPLETE, message.data);
                break;
            case 'leak_suspect':
                eventBus.publish(events.LEAK_SUSPECT, message.data);
                break;
        }

        if (this.messageHandlers.has(message.type)) {
            this.messageHandlers.get(message.type)(message.data);
        }
    }

    sendSensorData(data) {
        if (this.isConnected) {
            this.ws.send(JSON.stringify({
                type: 'sensor_data',
                data: data
            }));
        }
    }

    onMessage(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WebSocketClient] 达到最大重连次数');
            return;
        }

        this.reconnectAttempts++;
        console.log(`[WebSocketClient] 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }
}

const wsClient = new WebSocketClient();
