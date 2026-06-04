const fs = require('fs');
const path = require('path');

function generateNetworkTopology() {
    const nodes = [];
    const pipes = [];
    
    const nodeTypes = ['plant', 'pump', 'pressure_station', 'valve', 'hydrant', 'junction'];
    const materials = ['铸铁管', '钢管', 'PE管', 'PVC管', '球墨铸铁管'];
    const diameters = [100, 150, 200, 300, 400, 500, 600, 800, 1000];
    
    const plants = [
        { id: 'N0001', name: '水厂1', x: 100, y: 500 },
        { id: 'N0002', name: '水厂2', x: 900, y: 500 }
    ];
    
    const mainJunctions = [
        { id: 'N0003', name: '泵站1', x: 300, y: 300 },
        { id: 'N0004', name: '泵站2', x: 700, y: 700 },
        { id: 'N0005', name: '调压站1', x: 500, y: 200 },
        { id: 'N0006', name: '调压站2', x: 500, y: 800 }
    ];
    
    plants.forEach(p => {
        nodes.push({
            node_id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            type: 'plant',
            pressure_sensor: true,
            flow_sensor: true
        });
    });
    
    mainJunctions.forEach(j => {
        nodes.push({
            node_id: j.id,
            name: j.name,
            x: j.x,
            y: j.y,
            type: j.name.includes('泵站') ? 'pump' : 'pressure_station',
            pressure_sensor: true,
            flow_sensor: true
        });
    });
    
    const gridSize = 45;
    const offsetX = 80;
    const offsetY = 80;
    
    for (let i = 0; i < 1994; i++) {
        const nodeId = `N${String(i + 7).padStart(4, '0')}`;
        const gridX = i % gridSize;
        const gridY = Math.floor(i / gridSize);
        
        const x = offsetX + gridX * 18 + (Math.random() - 0.5) * 10;
        const y = offsetY + gridY * 18 + (Math.random() - 0.5) * 10;
        
        const hasPressure = i < 290;
        const hasFlow = i < 190;
        
        nodes.push({
            node_id: nodeId,
            name: `节点${i + 7}`,
            x: Math.min(950, Math.max(50, x)),
            y: Math.min(950, Math.max(50, y)),
            type: nodeTypes[3 + Math.floor(Math.random() * 3)],
            pressure_sensor: hasPressure,
            flow_sensor: hasFlow
        });
    }
    
    const majorConnections = [
        ['N0001', 'N0003'], ['N0001', 'N0005'],
        ['N0002', 'N0004'], ['N0002', 'N0006'],
        ['N0003', 'N0005'], ['N0004', 'N0006'],
        ['N0003', 'N0004'], ['N0005', 'N0006']
    ];
    
    let pipeIndex = 1;
    majorConnections.forEach(([start, end]) => {
        const startNode = nodes.find(n => n.node_id === start);
        const endNode = nodes.find(n => n.node_id === end);
        const length = Math.sqrt(
            Math.pow(endNode.x - startNode.x, 2) + 
            Math.pow(endNode.y - startNode.y, 2)
        ) * 100;
        
        pipes.push({
            pipe_id: `P${String(pipeIndex++).padStart(4, '0')}`,
            start_node_id: start,
            end_node_id: end,
            diameter: diameters[Math.floor(Math.random() * 3) + 6],
            length: Math.round(length),
            material: materials[Math.floor(Math.random() * 3)]
        });
    });
    
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const connections = Math.floor(Math.random() * 3) + 1;
        
        const nearbyNodes = nodes
            .filter((n, idx) => idx !== i && idx > i)
            .map(n => ({
                node: n,
                dist: Math.sqrt(Math.pow(n.x - node.x, 2) + Math.pow(n.y - node.y, 2)
            }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, connections);
        
        nearbyNodes.forEach(({ node: nearNode, dist }) => {
            if (dist < 30 && Math.random() > 0.3) {
                pipes.push({
                    pipe_id: `P${String(pipeIndex++).padStart(4, '0')}`,
                    start_node_id: node.node_id,
                    end_node_id: nearNode.node_id,
                    diameter: diameters[Math.floor(Math.random() * diameters.length)],
                    length: Math.round(dist * 100),
                    material: materials[Math.floor(Math.random() * materials.length)]
                });
            }
        });
    }
    
    const totalLength = pipes.reduce((sum, p) => sum + p.length, 0);
    console.log(`生成了 ${nodes.length} 个节点, ${pipes.length} 条管道`);
    console.log(`管道总长: ${(totalLength / 1000).toFixed(2)} 公里`);
    console.log(`压力传感器: ${nodes.filter(n => n.pressure_sensor).length} 个`);
    console.log(`流量计: ${nodes.filter(n => n.flow_sensor).length} 个`);
    
    return { nodes, pipes };
}

const { nodes, pipes } = generateNetworkTopology();

fs.writeFileSync(
    path.join(__dirname, 'nodes.json'),
    JSON.stringify(nodes, null, 2)
);

fs.writeFileSync(
    path.join(__dirname, 'pipes.json'),
    JSON.stringify(pipes, null, 2)
);

console.log('拓扑数据已保存');
