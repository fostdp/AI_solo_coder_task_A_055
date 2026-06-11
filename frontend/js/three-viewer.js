const ThreeViewer = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    relicGroup: null,
    sensors: [],
    scaleOverlay: null,
    wireframeMode: false,
    showSensors: true,
    showScaleOverlay: true,
    currentRelic: null,
    animating: false,

    init() {
        const container = document.getElementById('model-viewer');
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d1525);
        this.scene.fog = new THREE.Fog(0x0d1525, 50, 200);

        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(15, 12, 20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 80;

        this.setupLights();
        this.setupGround();
        this.relicGroup = new THREE.Group();
        this.scene.add(this.relicGroup);

        window.addEventListener('resize', () => this.onResize());
        this.onResize();

        this.setupControls();

        this.animate();
    },

    setupLights() {
        const ambient = new THREE.AmbientLight(0x404060, 0.5);
        this.scene.add(ambient);

        const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.4);
        this.scene.add(hemi);

        const dirLight = new THREE.DirectionalLight(0xffeedd, 1);
        dirLight.position.set(20, 30, 15);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 100;
        dirLight.shadow.camera.left = -30;
        dirLight.shadow.camera.right = 30;
        dirLight.shadow.camera.top = 30;
        dirLight.shadow.camera.bottom = -30;
        this.scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x88ccff, 0.3);
        fillLight.position.set(-15, 10, -10);
        this.scene.add(fillLight);

        const rimLight = new THREE.PointLight(0xffaa55, 0.5, 50);
        rimLight.position.set(0, 15, -15);
        this.scene.add(rimLight);
    },

    setupGround() {
        const groundGeo = new THREE.CircleGeometry(40, 64);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x2a3450,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.01;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const gridHelper = new THREE.GridHelper(40, 40, 0x3a4460, 0x252d45);
        gridHelper.position.y = 0.01;
        this.scene.add(gridHelper);
    },

    setupControls() {
        document.getElementById('show-wireframe').addEventListener('change', (e) => {
            this.wireframeMode = e.target.checked;
            this.updateWireframeMode();
        });
        document.getElementById('show-sensors').addEventListener('change', (e) => {
            this.showSensors = e.target.checked;
            this.sensors.forEach(s => s.visible = this.showSensors);
        });
        document.getElementById('show-scale-overlay').addEventListener('change', (e) => {
            this.showScaleOverlay = e.target.checked;
            if (this.scaleOverlay) this.scaleOverlay.visible = this.showScaleOverlay;
        });
    },

    createBuddhaStatue(seed = 1) {
        const group = new THREE.Group();
        const rng = this.seededRandom(seed);

        const stoneColor = new THREE.Color().setHSL(0.08 + rng() * 0.05, 0.3, 0.45);
        const stoneMat = new THREE.MeshStandardMaterial({
            color: stoneColor,
            roughness: 0.85,
            metalness: 0.05,
            flatShading: false
        });

        const baseGeo = new THREE.CylinderGeometry(4, 4.5, 1.5, 16);
        const base = new THREE.Mesh(baseGeo, stoneMat);
        base.position.y = 0.75;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        const pedestalGeo = new THREE.CylinderGeometry(3, 3.8, 2, 16);
        const pedestal = new THREE.Mesh(pedestalGeo, stoneMat);
        pedestal.position.y = 2.5;
        pedestal.castShadow = true;
        pedestal.receiveShadow = true;
        group.add(pedestal);

        const seatGeo = new THREE.CylinderGeometry(3.2, 3.2, 0.8, 16);
        const seat = new THREE.Mesh(seatGeo, stoneMat);
        seat.position.y = 3.9;
        seat.castShadow = true;
        group.add(seat);

        const bodyGeo = new THREE.SphereGeometry(2.8, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2.2);
        const body = new THREE.Mesh(bodyGeo, stoneMat);
        body.position.y = 6.5;
        body.scale.set(1, 1.3, 0.85);
        body.castShadow = true;
        group.add(body);

        const chestGeo = new THREE.BoxGeometry(3.5, 2.5, 1.8);
        const chest = new THREE.Mesh(chestGeo, stoneMat);
        chest.position.y = 6.2;
        chest.castShadow = true;
        group.add(chest);

        const robeGeo = new THREE.CylinderGeometry(2.8, 3.5, 3.5, 20);
        const robe = new THREE.Mesh(robeGeo, stoneMat);
        robe.position.y = 5.2;
        robe.castShadow = true;
        group.add(robe);

        const neckGeo = new THREE.CylinderGeometry(1, 1.1, 0.8, 16);
        const neck = new THREE.Mesh(neckGeo, stoneMat);
        neck.position.y = 8.2;
        neck.castShadow = true;
        group.add(neck);

        const headGeo = new THREE.SphereGeometry(1.6, 32, 32);
        const head = new THREE.Mesh(headGeo, stoneMat);
        head.position.y = 10.2;
        head.scale.set(1, 1.1, 1);
        head.castShadow = true;
        group.add(head);

        const ushnishaGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const ushnisha = new THREE.Mesh(ushnishaGeo, stoneMat);
        ushnisha.position.y = 11.8;
        ushnisha.scale.set(1, 1.5, 1);
        ushnisha.castShadow = true;
        group.add(ushnisha);

        for (let i = 0; i < 32; i++) {
            const curlGeo = new THREE.SphereGeometry(0.08, 6, 6);
            const curl = new THREE.Mesh(curlGeo, stoneMat);
            const phi = Math.acos(1 - i / 32 * 1.4);
            const theta = i * 1.8;
            const r = 1.65;
            curl.position.set(
                head.position.x + r * Math.sin(phi) * Math.cos(theta),
                head.position.y + r * Math.cos(phi) - 0.3,
                head.position.z + r * Math.sin(phi) * Math.sin(theta)
            );
            group.add(curl);
        }

        const earGeo = new THREE.BoxGeometry(0.3, 1.2, 0.4);
        const leftEar = new THREE.Mesh(earGeo, stoneMat);
        leftEar.position.set(-1.8, 9.9, 0);
        leftEar.castShadow = true;
        group.add(leftEar);
        const rightEar = leftEar.clone();
        rightEar.position.x = 1.8;
        group.add(rightEar);

        const shoulderGeo = new THREE.SphereGeometry(1.2, 16, 16);
        const leftShoulder = new THREE.Mesh(shoulderGeo, stoneMat);
        leftShoulder.position.set(-2.5, 6.8, 0);
        leftShoulder.scale.set(1, 0.8, 1);
        leftShoulder.castShadow = true;
        group.add(leftShoulder);
        const rightShoulder = leftShoulder.clone();
        rightShoulder.position.x = 2.5;
        group.add(rightShoulder);

        const armGeo = new THREE.CylinderGeometry(0.5, 0.6, 3, 12);
        const leftArm = new THREE.Mesh(armGeo, stoneMat);
        leftArm.position.set(-3.2, 5, 1.5);
        leftArm.rotation.x = Math.PI / 3;
        leftArm.rotation.z = Math.PI / 8;
        leftArm.castShadow = true;
        group.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, stoneMat);
        rightArm.position.set(3.2, 5, 1.5);
        rightArm.rotation.x = Math.PI / 3;
        rightArm.rotation.z = -Math.PI / 8;
        rightArm.castShadow = true;
        group.add(rightArm);

        const handGeo = new THREE.SphereGeometry(0.6, 16, 16);
        const leftHand = new THREE.Mesh(handGeo, stoneMat);
        leftHand.position.set(-3.8, 3.5, 2.8);
        leftHand.scale.set(1, 0.7, 1.3);
        group.add(leftHand);
        const rightHand = leftHand.clone();
        rightHand.position.x = 3.8;
        group.add(rightHand);

        const auraGeo = new THREE.RingGeometry(3.2, 3.5, 48);
        const auraMat = new THREE.MeshBasicMaterial({ 
            color: 0xd4a017, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });
        const aura = new THREE.Mesh(auraGeo, auraMat);
        aura.position.set(0, 9.5, -1);
        aura.rotation.x = 0.3;
        group.add(aura);

        this.addWeathering(group, stoneMat, rng);

        return group;
    },

    seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    },

    addWeathering(group, mat, rng) {
        const crackMat = new THREE.MeshBasicMaterial({ color: 0x2a1810 });
        for (let i = 0; i < 15; i++) {
            const crackGeo = new THREE.PlaneGeometry(0.02 + rng() * 0.05, 0.5 + rng() * 2);
            const crack = new THREE.Mesh(crackGeo, crackMat);
            crack.position.set(
                (rng() - 0.5) * 6,
                1 + rng() * 10,
                1.8 + rng() * 1
            );
            crack.rotation.y = (rng() - 0.5) * 0.5;
            crack.rotation.z = (rng() - 0.5) * 0.5;
            group.add(crack);
        }

        for (let i = 0; i < 8; i++) {
            const chipGeo = new THREE.SphereGeometry(0.2 + rng() * 0.4, 8, 8);
            const chipMat = mat.clone();
            chipMat.color.setHex(0x1a1410);
            const chip = new THREE.Mesh(chipGeo, chipMat);
            chip.position.set(
                (rng() - 0.5) * 5.5,
                1 + rng() * 9,
                (rng() - 0.5) * 3
            );
            chip.scale.set(
                0.5 + rng() * 0.5,
                0.3 + rng() * 0.4,
                0.2 + rng() * 0.3
            );
            group.add(chip);
        }
    },

    async loadRelic(relic) {
        this.currentRelic = relic;
        document.getElementById('selected-relic-name').textContent = 
            `🏛️ ${relic.name} (${relic.location})`;

        while (this.relicGroup.children.length > 0) {
            this.relicGroup.remove(this.relicGroup.children[0]);
        }
        this.sensors = [];

        const statue = this.createBuddhaStatue(relic.id);
        this.relicGroup.add(statue);

        if (relic.sensors && relic.sensors.length > 0) {
            this.addSensorMarkers(relic.sensors, relic.latest_data || []);
        }

        this.addScaleOverlay(relic.latest_data || []);

        this.camera.position.set(18, 14, 22);
        this.controls.target.set(0, 6, 0);
        this.controls.update();
    },

    addSensorMarkers(sensors, latestData) {
        const dataMap = {};
        latestData.forEach(d => { dataMap[d.sensor_id] = d; });

        sensors.forEach(s => {
            const isUS = s.type === 'ultrasonic';
            const data = dataMap[s.id];
            const value = data ? data.latest_value : 0;

            const height = isUS ? 0.01 : 0.01;
            const scaleMax = isUS ? 4 : 60;
            const ratio = Math.min(value / scaleMax, 1);
            
            let color;
            if (isUS) {
                if (value > 3) color = 0xf44336;
                else if (value > 2) color = 0xff9800;
                else if (value > 1) color = 0xffeb3b;
                else color = 0x4caf50;
            } else {
                if (value > 50) color = 0xf44336;
                else if (value > 40) color = 0xff9800;
                else color = 0x2196f3;
            }

            const geo = new THREE.SphereGeometry(isUS ? 0.15 : 0.12, 16, 16);
            const mat = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.5 + ratio * 0.5,
                roughness: 0.3,
                metalness: 0.8
            });
            const marker = new THREE.Mesh(geo, mat);

            const angle = s.position_x * Math.PI * 2;
            const yPos = 2 + s.position_y * 10;
            const radius = 2.5 + Math.sin(yPos * 0.3) * 0.8;

            marker.position.set(
                Math.cos(angle) * radius,
                yPos,
                Math.sin(angle) * radius
            );
            marker.visible = this.showSensors;
            marker.userData = {
                sensor: s,
                data: data,
                isUltrasonic: isUS
            };

            this.relicGroup.add(marker);
            this.sensors.push(marker);

            const ringGeo = new THREE.RingGeometry(isUS ? 0.18 : 0.14, isUS ? 0.22 : 0.18, 32);
            const ringMat = new THREE.MeshBasicMaterial({ 
                color: color, 
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(marker.position);
            ring.lookAt(this.camera.position);
            ring.visible = this.showSensors;
            this.relicGroup.add(ring);
            this.sensors.push(ring);
        });
    },

    addScaleOverlay(latestData) {
        if (this.scaleOverlay) {
            this.relicGroup.remove(this.scaleOverlay);
        }

        const usData = latestData.filter(d => d.latest_unit === 'mm');
        if (usData.length === 0) {
            this.scaleOverlay = null;
            return;
        }

        const values = usData.map(d => d.latest_value);
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);
        const range = maxVal - minVal || 1;

        const group = new THREE.Group();

        for (let lat = 0; lat < 20; lat++) {
            const phi = (lat / 20) * Math.PI;
            for (let lon = 0; lon < 32; lon++) {
                const theta = (lon / 32) * Math.PI * 2;
                const radius = 3;
                const y = radius * Math.cos(phi);
                const r = radius * Math.sin(phi);
                const x = r * Math.cos(theta);
                const z = r * Math.sin(theta);

                const virtualPos = (y + 3) / 6;
                const interpolated = this.interpolateValue(usData, virtualPos, lon / 32);
                const normalizedVal = Math.min((interpolated - minVal) / range, 1);

                const h = (1 - normalizedVal) * 0.3;
                const s = 0.9;
                const l = 0.35 + normalizedVal * 0.25;
                const color = new THREE.Color().setHSL(h, s, l);

                const dotGeo = new THREE.SphereGeometry(0.08, 6, 6);
                const dotMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.75
                });
                const dot = new THREE.Mesh(dotGeo, dotMat);

                const offset = 1 + normalizedVal * 0.3;
                dot.position.set(x * offset, y * 0.8 + 5, z * offset);
                group.add(dot);
            }
        }

        group.visible = this.showScaleOverlay;
        this.relicGroup.add(group);
        this.scaleOverlay = group;
    },

    interpolateValue(data, yPos, angle) {
        let totalDist = 0;
        let weightedSum = 0;
        data.forEach((d, i) => {
            const dataAngle = (i / Math.max(data.length - 1, 1)) ;
            const dataY = 0.3 + (i % 3) * 0.2;
            const dy = (yPos - dataY);
            const da = Math.abs(angle - dataAngle);
            const dist = Math.sqrt(dy*dy + Math.min(da, 1-da)*Math.min(da, 1-da));
            const weight = 1 / (dist * 5 + 0.1);
            weightedSum += d.latest_value * weight;
            totalDist += weight;
        });
        return totalDist > 0 ? weightedSum / totalDist : 0.5;
    },

    updateWireframeMode() {
        this.relicGroup.traverse(obj => {
            if (obj.isMesh && obj.material && !this.sensors.includes(obj) && obj !== this.scaleOverlay) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.wireframe = this.wireframeMode);
                } else {
                    obj.material.wireframe = this.wireframeMode;
                }
            }
        });
    },

    onResize() {
        const container = document.getElementById('model-viewer');
        const width = container.clientWidth;
        const height = container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    },

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();

        this.sensors.forEach(s => {
            if (s.geometry && s.geometry.type === 'RingGeometry') {
                s.lookAt(this.camera.position);
            }
        });

        const time = Date.now() * 0.001;
        this.sensors.forEach(s => {
            if (s.userData && s.userData.sensor) {
                s.position.y += Math.sin(time * 2 + s.userData.sensor.id) * 0.002;
            }
        });

        this.renderer.render(this.scene, this.camera);
    }
};
