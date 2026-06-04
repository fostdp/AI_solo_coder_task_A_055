class LeakManager {
    constructor() {
        this.leakSuspects = [];
        this.maxSuspects = 20;
    }

    init() {
        eventBus.subscribe(events.NIGHT_ANALYSIS_COMPLETE, (result) => {
            this.handleNightAnalysis(result);
        });

        eventBus.subscribe(events.LEAK_SUSPECT, (suspect) => {
            this.addLeakSuspect(suspect);
        });

        console.log('[LeakManager] 已初始化');
    }

    addLeakSuspect(suspect) {
        const existingIndex = this.leakSuspects.findIndex(s => s.nodeId === suspect.nodeId);
        
        if (existingIndex >= 0) {
            if (suspect.probability > this.leakSuspects[existingIndex].probability) {
                this.leakSuspects[existingIndex] = suspect;
            }
        } else {
            this.leakSuspects.push(suspect);
        }

        this.leakSuspects.sort((a, b) => b.probability - a.probability);
        
        if (this.leakSuspects.length > this.maxSuspects) {
            this.leakSuspects = this.leakSuspects.slice(0, this.maxSuspects);
        }

        this.updateUI();
        return suspect;
    }

    handleNightAnalysis(result) {
        result.anomalies.forEach(anomaly => {
            this.addLeakSuspect({
                nodeId: anomaly.nodeId,
                probability: Math.min(0.95, 0.5 + anomaly.ratio * 0.15),
                analysisType: 'night_flow',
                details: {
                    baseline: anomaly.baseline,
                    current: anomaly.current,
                    ratio: anomaly.ratio
                }
            });
        });
    }

    calculateLeakSuspectsFromRealtime() {
        const suspects = [];

        dataStore.nodeHistory.forEach((history, nodeId) => {
            if (history.length < 10) return;

            const recent = history.slice(-10);
            const pressureTrend = dataStore.calculateTrend(recent.map(d => d.pressure || 0));
            const flowTrend = dataStore.calculateTrend(recent.map(d => d.flow_rate || 0));

            let probability = 0;

            if (pressureTrend < -0.005) {
                probability += Math.min(0.4, Math.abs(pressureTrend) * 20);
            }

            if (flowTrend > 0.1) {
                probability += Math.min(0.4, flowTrend * 2);
            }

            const avgPressure = recent.reduce((sum, d) => sum + (d.pressure || 0.35), 0) / recent.length;
            if (avgPressure < 0.25) {
                probability += 0.2;
            }

            if (probability > 0.5) {
                suspects.push({
                    nodeId,
                    probability: Math.min(0.95, probability),
                    analysisType: 'real_time',
                    details: {
                        pressureTrend,
                        flowTrend,
                        avgPressure
                    }
                });
            }
        });

        suspects.sort((a, b) => b.probability - a.probability);
        return suspects.slice(0, 10);
    }

    getLeakSuspects(limit = 10) {
        return this.leakSuspects.slice(0, limit);
    }

    updateUI() {
        this.updateLeakList();
        this.updateLeakCount();
    }

    updateLeakList() {
        const leakList = document.getElementById('leakList');
        if (!leakList) return;

        if (this.leakSuspects.length === 0) {
            leakList.innerHTML = '<div class="empty-state">暂无分析数据</div>';
            document.getElementById('leakSuspectCount').textContent = '0';
            return;
        }

        document.getElementById('leakSuspectCount').textContent = this.leakSuspects.length;

        const analysisTypeName = {
            'night_flow': '夜间流量',
            'real_time': '实时分析',
            'pressure_flow_anomaly': '压力流量异常'
        };

        leakList.innerHTML = this.leakSuspects.slice(0, 10).map(suspect => {
            const probPercent = Math.round(suspect.probability * 100);
            const probClass = suspect.probability >= 0.75 ? 'high' : 
                             suspect.probability >= 0.6 ? 'medium' : 'low';

            return `
                <div class="leak-item">
                    <div class="leak-header">
                        <span class="leak-node">${suspect.nodeId}</span>
                        <span class="leak-probability ${probClass}">${probPercent}%</span>
                    </div>
                    <div class="leak-details">
                        分析类型: ${analysisTypeName[suspect.analysisType] || suspect.analysisType}
                    </div>
                </div>
            `;
        }).join('');
    }

    updateLeakCount() {
        const countEl = document.getElementById('leakSuspectCount');
        if (countEl) {
            countEl.textContent = this.leakSuspects.length;
        }
    }

    clear() {
        this.leakSuspects = [];
        this.updateUI();
    }
}

const leakManager = new LeakManager();
