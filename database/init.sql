CREATE TABLE IF NOT EXISTS nodes (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100),
    x_coordinate FLOAT NOT NULL,
    y_coordinate FLOAT NOT NULL,
    node_type VARCHAR(20) NOT NULL,
    pressure_sensor BOOLEAN DEFAULT FALSE,
    flow_sensor BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pipes (
    id SERIAL PRIMARY KEY,
    pipe_id VARCHAR(50) UNIQUE NOT NULL,
    start_node_id VARCHAR(50) NOT NULL REFERENCES nodes(node_id),
    end_node_id VARCHAR(50) NOT NULL REFERENCES nodes(node_id),
    diameter FLOAT NOT NULL,
    length FLOAT NOT NULL,
    material VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensor_data (
    id BIGSERIAL PRIMARY KEY,
    node_id VARCHAR(50) NOT NULL REFERENCES nodes(node_id),
    pressure FLOAT,
    flow_rate FLOAT,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_data_node_time ON sensor_data(node_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp);

CREATE TABLE IF NOT EXISTS alarms (
    id BIGSERIAL PRIMARY KEY,
    alarm_type VARCHAR(30) NOT NULL,
    node_id VARCHAR(50) REFERENCES nodes(node_id),
    pipe_id VARCHAR(50) REFERENCES pipes(pipe_id),
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    value FLOAT,
    threshold FLOAT,
    timestamp TIMESTAMP NOT NULL,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alarms_timestamp ON alarms(timestamp);
CREATE INDEX IF NOT EXISTS idx_alarms_type ON alarms(alarm_type);
CREATE INDEX IF NOT EXISTS idx_alarms_node ON alarms(node_id);

CREATE TABLE IF NOT EXISTS night_flow_baseline (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(50) NOT NULL REFERENCES nodes(node_id),
    baseline_flow FLOAT NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(node_id, date)
);

CREATE TABLE IF NOT EXISTS leak_suspects (
    id BIGSERIAL PRIMARY KEY,
    pipe_id VARCHAR(50) REFERENCES pipes(pipe_id),
    node_id VARCHAR(50) REFERENCES nodes(node_id),
    leak_probability FLOAT NOT NULL,
    analysis_type VARCHAR(30) NOT NULL,
    details JSON,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensor_status (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(50) UNIQUE NOT NULL REFERENCES nodes(node_id),
    last_online TIMESTAMP NOT NULL,
    is_online BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO nodes (node_id, name, x_coordinate, y_coordinate, node_type, pressure_sensor, flow_sensor) VALUES
('N0001', '水厂1', 100, 500, 'plant', true, true),
('N0002', '水厂2', 900, 500, 'plant', true, true),
('N0003', '泵站1', 300, 300, 'pump', true, true),
('N0004', '泵站2', 700, 700, 'pump', true, true),
('N0005', '调压站1', 500, 200, 'pressure_station', true, true),
('N0006', '调压站2', 500, 800, 'pressure_station', true, true)
ON CONFLICT (node_id) DO NOTHING;
