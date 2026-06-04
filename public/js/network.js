class NetworkRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.pipes = [];
        this.nodeData = new Map();
        this.nodeMap = new Map();
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.hoveredNode = null;
        this.selectedNode = null;
        this.tooltip = null;
        this.dirty = true;
        this.renderRAF = null;
        this.mainPipes = [];
        this.secondaryPipes = [];
        this.branchPipes = [];
        this.viewportBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
        
        this.config = {
            normalPressureMin: 0.25,
            normalPressureMax: 0.45,
            warningPressureMin: 0.15,
            warningPressureMax: 0.55
        };
        
        this.init();
    }
    
    init() {
        this.resize();
        this.bindEvents();
        this.createTooltip();
    }
    
    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.updateViewportBounds();
        this.scheduleRender();
    }
    
    updateViewportBounds() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2 + this.offsetX;
        const cy = h / 2 + this.offsetY;
        const halfW = w / 2 / this.zoom;
        const halfH = h / 2 / this.zoom;
        const worldCX = (cx - w / 2) / this.zoom + 500;
        const worldCY = (cy - h / 2) / this.zoom + 500;
        const margin = 50;
        this.viewportBounds = {
            minX: worldCX - halfW - margin,
            minY: worldCY - halfH - margin,
            maxX: worldCX + halfW + margin,
            maxY: worldCY + halfH + margin
        };
    }
    
    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        
        this.canvas.addEventListener('mousedown', (e) => {
            const node = this.getNodeAtPosition(e.clientX, e.clientY);
            if (node) {
                this.selectedNode = node;
                if (this.onNodeClick) {
                    this.onNodeClick(node);
                }
            } else {
                this.isDragging = true;
            }
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.offsetX += e.clientX - this.lastMouseX;
                this.offsetY += e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.updateViewportBounds();
                this.scheduleRender();
            } else {
                this.hoveredNode = this.getNodeAtPosition(e.clientX, e.clientY);
                this.updateTooltip(e.clientX, e.clientY);
                this.scheduleRender();
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.hoveredNode = null;
            this.hideTooltip();
            this.scheduleRender();
        });
        
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom *= delta;
            this.zoom = Math.max(0.3, Math.min(3, this.zoom));
            this.updateViewportBounds();
            this.scheduleRender();
        });
    }
    
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tooltip';
        this.tooltip.style.display = 'none';
        document.body.appendChild(this.tooltip);
    }
    
    updateTooltip(x, y) {
        if (!this.hoveredNode) {
            this.hideTooltip();
            return;
        }
        
        const node = this.hoveredNode;
        const data = this.nodeData.get(node.node_id) || {};
        const pressureStatus = this.getPressureStatus(data.pressure);
        
        let html = `
            <div class="tooltip-title">${node.name || node.node_id}</div>
            <div class="tooltip-row">
                <span class="tooltip-label">类型:</span>
                <span class="tooltip-value">${this.getNodeTypeName(node.type)}</span>
            </div>
        `;
        
        if (data.pressure !== undefined && data.pressure !== null) {
            html += `
                <div class="tooltip-row">
                    <span class="tooltip-label">压力:</span>
                    <span class="tooltip-value ${pressureStatus}">${data.pressure.toFixed(3)} MPa</span>
                </div>
            `;
        }
        
        if (data.flow_rate !== undefined && data.flow_rate !== null) {
            html += `
                <div class="tooltip-row">
                    <span class="tooltip-label">流量:</span>
                    <span class="tooltip-value">${data.flow_rate.toFixed(2)} L/s</span>
                </div>
            `;
        }
        
        html += `
            <div class="tooltip-row">
                <span class="tooltip-label">压力传感器:</span>
                <span class="tooltip-value">${node.pressure_sensor ? '✓' : '✗'}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">流量计:</span>
                <span class="tooltip-value">${node.flow_sensor ? '✓' : '✗'}</span>
            </div>
        `;
        
        this.tooltip.innerHTML = html;
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = (x + 15) + 'px';
        this.tooltip.style.top = (y + 15) + 'px';
    }
    
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
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
    
    getPressureStatus(pressure) {
        if (pressure === undefined || pressure === null) return '';
        
        if (pressure < this.config.warningPressureMin || pressure > this.config.warningPressureMax) {
            return 'danger';
        }
        
        if (pressure < this.config.normalPressureMin || pressure > this.config.normalPressureMax) {
            return 'warning';
        }
        
        return 'normal';
    }
    
    getNodeAtPosition(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const cx = this.canvas.width / 2 + this.offsetX;
        const cy = this.canvas.height / 2 + this.offsetY;
        const x = (clientX - rect.left - cx) / this.zoom + 500;
        const y = (clientY - rect.top - cy) / this.zoom + 500;
        
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            const dx = node.x - x;
            const dy = node.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const radius = this.getNodeRadius(node);
            
            if (distance <= radius + 5) {
                return node;
            }
        }
        
        return null;
    }
    
    getNodeRadius(node) {
        const baseRadius = {
            'plant': 12,
            'pump': 10,
            'pressure_station': 10,
            'junction': 6,
            'valve': 5,
            'hydrant': 5
        };
        return baseRadius[node.type] || 6;
    }
    
    getNodeColor(node) {
        const data = this.nodeData.get(node.node_id) || {};
        const pressure = data.pressure;
        
        const typeColors = {
            'plant': '#3b82f6',
            'pump': '#8b5cf6',
            'pressure_station': '#06b6d4',
            'junction': '#22c55e',
            'valve': '#eab308',
            'hydrant': '#f97316'
        };
        
        if (pressure === undefined || pressure === null) {
            return typeColors[node.type] || '#64748b';
        }
        
        if (pressure < this.config.warningPressureMin || pressure > this.config.warningPressureMax) {
            return '#ef4444';
        }
        
        if (pressure < this.config.normalPressureMin || pressure > this.config.normalPressureMax) {
            return '#eab308';
        }
        
        return '#22c55e';
    }
    
    setData(nodes, pipes) {
        this.nodes = nodes;
        this.pipes = pipes;
        
        this.nodeMap.clear();
        nodes.forEach(n => this.nodeMap.set(n.node_id, n));
        
        this.mainPipes = [];
        this.secondaryPipes = [];
        this.branchPipes = [];
        
        pipes.forEach(pipe => {
            const d = pipe.diameter || 200;
            if (d >= 600) {
                this.mainPipes.push(pipe);
            } else if (d >= 300) {
                this.secondaryPipes.push(pipe);
            } else {
                this.branchPipes.push(pipe);
            }
        });
        
        this.scheduleRender();
    }
    
    updateNodeData(nodeId, data) {
        this.nodeData.set(nodeId, data);
        this.scheduleRender();
    }
    
    scheduleRender() {
        this.dirty = true;
        if (!this.renderRAF) {
            this.renderRAF = requestAnimationFrame(() => {
                this.renderRAF = null;
                if (this.dirty) {
                    this.dirty = false;
                    this.render();
                }
            });
        }
    }
    
    isInViewport(x, y) {
        const b = this.viewportBounds;
        return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
    }
    
    isPipeInViewport(startNode, endNode) {
        const b = this.viewportBounds;
        const minX = Math.min(startNode.x, endNode.x);
        const maxX = Math.max(startNode.x, endNode.x);
        const minY = Math.min(startNode.y, endNode.y);
        const maxY = Math.max(startNode.y, endNode.y);
        return maxX >= b.minX && minX <= b.maxX && maxY >= b.minY && minY <= b.maxY;
    }
    
    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
        
        ctx.save();
        ctx.translate(width / 2 + this.offsetX, height / 2 + this.offsetY);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-500, -500);
        
        this.drawGrid();
        
        this.drawPipeLayer(this.mainPipes, 1.0);
        this.drawPipeLayer(this.secondaryPipes, 0.7);
        this.drawPipeLayer(this.branchPipes, 0.4);
        
        this.drawNodesByPriority();
        
        ctx.restore();
    }
    
    drawGrid() {
        const ctx = this.ctx;
        const b = this.viewportBounds;
        
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 0.5;
        
        const startX = Math.floor(b.minX / 50) * 50;
        const endX = Math.ceil(b.maxX / 50) * 50;
        const startY = Math.floor(b.minY / 50) * 50;
        const endY = Math.ceil(b.maxY / 50) * 50;
        
        ctx.beginPath();
        for (let x = startX; x <= endX; x += 50) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += 50) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }
    
    drawPipeLayer(pipeList, opacity) {
        const ctx = this.ctx;
        
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        
        const lineWidths = new Map();
        
        for (let i = 0; i < pipeList.length; i++) {
            const pipe = pipeList[i];
            const startNode = this.nodeMap.get(pipe.start_node_id);
            const endNode = this.nodeMap.get(pipe.end_node_id);
            
            if (!startNode || !endNode) continue;
            if (!this.isPipeInViewport(startNode, endNode)) continue;
            
            const diameter = pipe.diameter || 200;
            const lineWidth = Math.min(8, Math.max(1, diameter / 100));
            
            if (!lineWidths.has(lineWidth)) {
                lineWidths.set(lineWidth, []);
            }
            lineWidths.get(lineWidth).push(startNode, endNode);
        }
        
        ctx.strokeStyle = '#475569';
        ctx.lineCap = 'round';
        
        lineWidths.forEach((segments, lw) => {
            ctx.lineWidth = lw;
            ctx.beginPath();
            for (let i = 0; i < segments.length; i += 2) {
                ctx.moveTo(segments[i].x, segments[i].y);
                ctx.lineTo(segments[i + 1].x, segments[i + 1].y);
            }
            ctx.stroke();
        });
        
        ctx.globalAlpha = 1.0;
    }
    
    drawNodesByPriority() {
        const ctx = this.ctx;
        const b = this.viewportBounds;
        const priorityTypes = new Set(['plant', 'pump', 'pressure_station']);
        
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (!this.isInViewport(node.x, node.y)) continue;
            if (priorityTypes.has(node.type)) continue;
            this.drawSingleNode(ctx, node);
        }
        
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (!this.isInViewport(node.x, node.y)) continue;
            if (!priorityTypes.has(node.type)) continue;
            this.drawSingleNode(ctx, node);
        }
    }
    
    drawSingleNode(ctx, node) {
        const x = node.x;
        const y = node.y;
        const radius = this.getNodeRadius(node);
        const color = this.getNodeColor(node);
        const isHovered = this.hoveredNode && this.hoveredNode.node_id === node.node_id;
        const isSelected = this.selectedNode && this.selectedNode.node_id === node.node_id;
        
        if (isHovered || isSelected) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
            ctx.fillStyle = color + '33';
            ctx.fill();
        }
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        
        const gradient = ctx.createRadialGradient(x - radius/3, y - radius/3, 0, x, y, radius);
        gradient.addColorStop(0, this.lightenColor(color, 30));
        gradient.addColorStop(1, color);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.strokeStyle = this.lightenColor(color, 50);
        ctx.lineWidth = 2;
        ctx.stroke();
        
        if (isSelected) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        if (node.type === 'plant' || node.type === 'pump' || node.type === 'pressure_station') {
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 +
            (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)
        ).toString(16).slice(1);
    }
    
    zoomIn() {
        this.zoom *= 1.2;
        this.zoom = Math.min(3, this.zoom);
        this.updateViewportBounds();
        this.scheduleRender();
    }
    
    zoomOut() {
        this.zoom *= 0.8;
        this.zoom = Math.max(0.3, this.zoom);
        this.updateViewportBounds();
        this.scheduleRender();
    }
    
    resetView() {
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.selectedNode = null;
        this.updateViewportBounds();
        this.scheduleRender();
    }
}
