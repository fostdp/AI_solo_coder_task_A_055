const Contour = {
    canvas: null,
    ctx: null,
    gridSize: 80,
    dataGrid: [],
    relicData: null,

    init() {
        this.canvas = document.getElementById('contour-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        document.getElementById('contour-levels').addEventListener('change', () => this.render());
        document.getElementById('contour-mode').addEventListener('change', () => this.render());
        document.getElementById('export-contour').addEventListener('click', () => this.exportPNG());
    },

    resizeCanvas() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth - 220;
        this.canvas.height = parent.clientHeight;
        if (this.relicData) this.render();
    },

    generateDataGrid(latestData) {
        const usData = latestData.filter(d => d.latest_unit === 'mm');
        if (usData.length === 0) usData.push({ 
            sensor_id: 1, latest_value: 0.8, 
            latest_so2: 20, latest_humidity: 55, latest_temperature: 15 
        });

        this.dataGrid = [];
        const w = this.gridSize;
        const h = this.gridSize;

        const sensorPositions = usData.map((d, i) => ({
            x: 0.15 + (i * 0.25) % 0.7,
            y: 0.2 + Math.floor(i * 0.25 / 0.7) * 0.3,
            value: d.latest_value,
            radius: 0.25 + Math.random() * 0.15
        }));

        for (let y = 0; y < h; y++) {
            const row = [];
            for (let x = 0; x < w; x++) {
                const nx = x / (w - 1);
                const ny = y / (h - 1);

                let sumWeights = 0;
                let sumValue = 0;

                sensorPositions.forEach(sp => {
                    const dx = nx - sp.x;
                    const dy = ny - sp.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const weight = Math.exp(-(dist * dist) / (sp.radius * sp.radius * 0.5));
                    sumValue += sp.value * weight;
                    sumWeights += weight;
                });

                const base = sumWeights > 0 ? sumValue / sumWeights : 0.5;
                const noise = (Math.sin(nx * 15) + Math.cos(ny * 12) + Math.sin((nx + ny) * 8)) * 0.05;
                const edgeFade = 1 - Math.pow(Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2, 3) * 0.3;

                row.push(Math.max(0, (base + noise) * edgeFade));
            }
            this.dataGrid.push(row);
        }
    },

    getValue(x, y) {
        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return 0;
        const fx = Math.floor(x);
        const fy = Math.floor(y);
        const cx = fx + 1;
        const cy = fy + 1;
        const tx = x - fx;
        const ty = y - fy;

        const v00 = this.dataGrid[fy]?.[fx] || 0;
        const v10 = this.dataGrid[fy]?.[cx] || v00;
        const v01 = this.dataGrid[cy]?.[fx] || v00;
        const v11 = this.dataGrid[cy]?.[cx] || v00;

        const a = v00 * (1 - tx) + v10 * tx;
        const b = v01 * (1 - tx) + v11 * tx;
        return a * (1 - ty) + b * ty;
    },

    getColor(value, max) {
        const ratio = Math.min(value / max, 1);
        let h, s, l;

        if (ratio < 0.2) {
            h = 120 - ratio * 300;
        } else if (ratio < 0.5) {
            const t = (ratio - 0.2) / 0.3;
            h = 60 - t * 30;
        } else if (ratio < 0.8) {
            const t = (ratio - 0.5) / 0.3;
            h = 30 - t * 10;
        } else {
            h = 0;
        }

        s = 85;
        l = 35 + ratio * 20;

        return `hsl(${h}, ${s}%, ${l}%)`;
    },

    renderFilled(max, cellW, cellH) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const imgData = this.ctx.createImageData(w, h);

        for (let py = 0; py < h; py++) {
            const gy = (py / h) * (this.gridSize - 1);
            for (let px = 0; px < w; px++) {
                const gx = (px / w) * (this.gridSize - 1);
                const val = this.getValue(gx, gy);
                const ratio = Math.min(val / max, 1);

                let r, g, b;
                if (ratio < 0.2) {
                    r = 0;
                    g = 230;
                    b = 118;
                } else if (ratio < 0.4) {
                    const t = (ratio - 0.2) / 0.2;
                    r = Math.floor(t * 118);
                    g = 230;
                    b = Math.floor(118 * (1 - t));
                } else if (ratio < 0.6) {
                    const t = (ratio - 0.4) / 0.2;
                    r = 118 + Math.floor(t * 137);
                    g = 230 - Math.floor(t * 30);
                    b = 0;
                } else if (ratio < 0.8) {
                    const t = (ratio - 0.6) / 0.2;
                    r = 255;
                    g = 200 - Math.floor(t * 150);
                    b = 0;
                } else {
                    const t = (ratio - 0.8) / 0.2;
                    r = 255;
                    g = 50 - Math.floor(t * 30);
                    b = Math.floor(t * 50);
                }

                const idx = (py * w + px) * 4;
                imgData.data[idx] = r;
                imgData.data[idx + 1] = g;
                imgData.data[idx + 2] = b;
                imgData.data[idx + 3] = 220;
            }
        }
        this.ctx.putImageData(imgData, 0, 0);
    },

    renderHeatmap(max, cellW, cellH) {
        for (let y = 0; y < this.gridSize - 1; y++) {
            for (let x = 0; x < this.gridSize - 1; x++) {
                const val = (this.dataGrid[y][x] + this.dataGrid[y+1][x] + 
                           this.dataGrid[y][x+1] + this.dataGrid[y+1][x+1]) / 4;
                this.ctx.fillStyle = this.getColor(val, max);
                this.ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
            }
        }
    },

    marchingSquares(level, max, scaleX, scaleY) {
        const lines = [];
        const threshold = level;

        for (let y = 0; y < this.gridSize - 1; y++) {
            for (let x = 0; x < this.gridSize - 1; x++) {
                const v00 = this.dataGrid[y][x];
                const v10 = this.dataGrid[y][x + 1];
                const v11 = this.dataGrid[y + 1][x + 1];
                const v01 = this.dataGrid[y + 1][x];

                let code = 0;
                if (v00 > threshold) code |= 1;
                if (v10 > threshold) code |= 2;
                if (v11 > threshold) code |= 4;
                if (v01 > threshold) code |= 8;

                if (code === 0 || code === 15) continue;

                const lerp = (a, b, va, vb) => {
                    if (Math.abs(vb - va) < 0.0001) return 0.5;
                    return (threshold - va) / (vb - va);
                };

                const top = x + lerp(x, x + 1, v00, v10);
                const right = y + lerp(y, y + 1, v10, v11);
                const bottom = x + lerp(x, x + 1, v01, v11);
                const left = y + lerp(y, y + 1, v00, v01);

                const cases = {
                    1: [[top, y], [x, left]],
                    2: [[x + 1, right], [top, y]],
                    3: [[x + 1, right], [x, left]],
                    4: [[right, y + 1], [x + 1, right]],
                    5: [[top, y], [x, left], [right, y + 1], [bottom, y + 1]],
                    6: [[right, y + 1], [top, y]],
                    7: [[right, y + 1], [x, left]],
                    8: [[x, left], [bottom, y + 1]],
                    9: [[bottom, y + 1], [top, y]],
                    10: [[x + 1, right], [top, y], [x, left], [bottom, y + 1]],
                    11: [[bottom, y + 1], [x + 1, right]],
                    12: [[x + 1, right], [x, left]],
                    13: [[x + 1, right], [top, y]],
                    14: [[top, y], [x, left]],
                };

                const segs = cases[code] || [];
                for (let i = 0; i < segs.length; i += 2) {
                    if (segs[i + 1]) {
                        lines.push([
                            [segs[i][0] * scaleX, segs[i][1] * scaleY],
                            [segs[i + 1][0] * scaleX, segs[i + 1][1] * scaleY]
                        ]);
                    }
                }
            }
        }
        return lines;
    },

    renderContourLines(levels, max, scaleX, scaleY) {
        const maxVal = max;
        for (let i = 0; i < levels; i++) {
            const level = (i + 1) * (maxVal / (levels + 1));
            const ratio = level / maxVal;
            const lines = this.marchingSquares(level, max, scaleX, scaleY);

            this.ctx.strokeStyle = `hsla(${120 - ratio * 120}, 90%, 60%, ${0.4 + ratio * 0.5})`;
            this.ctx.lineWidth = ratio > 0.7 ? 2 : 1;
            this.ctx.beginPath();
            lines.forEach(line => {
                this.ctx.moveTo(line[0][0], line[0][1]);
                this.ctx.lineTo(line[1][0], line[1][1]);
            });
            this.ctx.stroke();

            if (i % 2 === 1) {
                this.ctx.fillStyle = `hsla(${120 - ratio * 120}, 90%, 80%, 0.9)`;
                this.ctx.font = '9px monospace';
                for (let j = 0; j < lines.length; j += 8) {
                    const line = lines[j];
                    if (line) {
                        const mx = (line[0][0] + line[1][0]) / 2;
                        const my = (line[0][1] + line[1][1]) / 2;
                        this.ctx.fillText(`${level.toFixed(2)}mm`, mx, my);
                    }
                }
            }
        }
    },

    render(relicData) {
        if (relicData) this.relicData = relicData;
        if (!this.relicData) return;

        const latestData = this.relicData.latest_data || [];
        this.generateDataGrid(latestData);

        const levels = parseInt(document.getElementById('contour-levels').value);
        const mode = document.getElementById('contour-mode').value;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const w = this.canvas.width;
        const h = this.canvas.height;
        const cellW = w / this.gridSize;
        const cellH = h / this.gridSize;

        let max = 0;
        this.dataGrid.forEach(row => row.forEach(v => max = Math.max(max, v)));
        max = Math.max(max, 1);

        if (mode === 'filled') {
            this.renderFilled(max, cellW, cellH);
        } else if (mode === 'heatmap') {
            this.renderHeatmap(max, cellW, cellH);
        }

        if (mode !== 'heatmap' || levels > 0) {
            this.renderContourLines(levels, max, cellW, cellH);
        }

        this.renderFrame(w, h);
        this.renderScaleBar(w, h, max);
        this.renderSensorPositions(latestData, w, h);
    },

    renderFrame(w, h) {
        this.ctx.strokeStyle = 'rgba(102, 126, 234, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(10, 10, w - 20, h - 20);

        this.ctx.strokeStyle = 'rgba(102, 126, 234, 0.15)';
        this.ctx.lineWidth = 1;
        for (let i = 1; i < 10; i++) {
            const x = 10 + (i / 10) * (w - 20);
            this.ctx.beginPath();
            this.ctx.moveTo(x, 10);
            this.ctx.lineTo(x, h - 10);
            this.ctx.stroke();

            const y = 10 + (i / 10) * (h - 20);
            this.ctx.beginPath();
            this.ctx.moveTo(10, y);
            this.ctx.lineTo(w - 10, y);
            this.ctx.stroke();
        }
    },

    renderScaleBar(w, h, max) {
        const barX = w - 50;
        const barY = 30;
        const barW = 18;
        const barH = h - 100;

        const grad = this.ctx.createLinearGradient(0, barY, 0, barY + barH);
        grad.addColorStop(0, 'hsl(0, 85%, 55%)');
        grad.addColorStop(0.3, 'hsl(20, 85%, 50%)');
        grad.addColorStop(0.5, 'hsl(50, 85%, 50%)');
        grad.addColorStop(0.7, 'hsl(80, 85%, 50%)');
        grad.addColorStop(1, 'hsl(120, 85%, 50%)');

        this.ctx.fillStyle = grad;
        this.ctx.fillRect(barX, barY, barW, barH);

        this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(barX, barY, barW, barH);

        this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'left';

        const ticks = 6;
        for (let i = 0; i <= ticks; i++) {
            const t = i / ticks;
            const y = barY + barH * (1 - t);
            const val = max * t;
            this.ctx.fillText(val.toFixed(1), barX + barW + 6, y + 3);

            this.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            this.ctx.beginPath();
            this.ctx.moveTo(barX, y);
            this.ctx.lineTo(barX - 4, y);
            this.ctx.stroke();
        }

        this.ctx.save();
        this.ctx.translate(barX + barW + 40, barY + barH / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.fillText('结垢厚度 (mm)', 0, 0);
        this.ctx.restore();
    },

    renderSensorPositions(latestData, w, h) {
        const usData = latestData.filter(d => d.latest_unit === 'mm');
        usData.forEach((d, i) => {
            const nx = 0.15 + (i * 0.25) % 0.7;
            const ny = 0.2 + Math.floor(i * 0.25 / 0.7) * 0.3;
            const px = 10 + nx * (w - 20);
            const py = 10 + ny * (h - 20);
            const val = d.latest_value;

            let color;
            if (val > 3) color = '#f44336';
            else if (val > 2) color = '#ff9800';
            else if (val > 1) color = '#ffeb3b';
            else color = '#4caf50';

            this.ctx.beginPath();
            this.ctx.arc(px, py, 8, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 0.4;
            this.ctx.fill();
            this.ctx.globalAlpha = 1;

            this.ctx.beginPath();
            this.ctx.arc(px, py, 5, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 9px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(val.toFixed(2), px, py + 3);

            this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
            this.ctx.font = '9px sans-serif';
            this.ctx.fillText(`S${d.sensor_id}`, px, py + 20);
        });
    },

    exportPNG() {
        const link = document.createElement('a');
        link.download = `contour-${Date.now()}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }
};
