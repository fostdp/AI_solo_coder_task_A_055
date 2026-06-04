CREATE EXTENSION IF NOT EXISTS timescaledb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables
        WHERE hypertable_name = 'sensor_data'
    ) THEN
        PERFORM create_hypertable('sensor_data', 'timestamp', chunk_time_interval => interval '1 day', migrate_data => true);
    END IF;
END $$;

ALTER TABLE sensor_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'node_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_compression'
        AND hypertable_name = 'sensor_data'
    ) THEN
        PERFORM add_compress_chunks_policy('sensor_data', interval '7 days');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_retention'
        AND hypertable_name = 'sensor_data'
    ) THEN
        PERFORM add_retention_policy('sensor_data', interval '90 days');
    END IF;
END $$;

ALTER TABLE alarms SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'alarm_type',
    timescaledb.compress_orderby = 'timestamp DESC'
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_compression'
        AND hypertable_name = 'alarms'
    ) THEN
        PERFORM add_compress_chunks_policy('alarms', interval '30 days');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_retention'
        AND hypertable_name = 'alarms'
    ) THEN
        PERFORM add_retention_policy('alarms', interval '180 days');
    END IF;
END $$;

CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_data_hourly_avg
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS bucket,
    node_id,
    AVG(pressure) AS avg_pressure,
    AVG(flow_rate) AS avg_flow_rate,
    MIN(pressure) AS min_pressure,
    MAX(pressure) AS max_pressure,
    MIN(flow_rate) AS min_flow_rate,
    MAX(flow_rate) AS max_flow_rate,
    COUNT(*) AS sample_count
FROM sensor_data
GROUP BY bucket, node_id
WITH DATA;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_refresh_continuous_aggregate'
        AND hypertable_name = 'sensor_data_hourly_avg'
    ) THEN
        PERFORM add_continuous_aggregate_policy('sensor_data_hourly_avg',
            start_offset => interval '3 hours',
            end_offset => interval '1 hour',
            schedule_interval => interval '1 hour');
    END IF;
END $$;

CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_data_daily_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', timestamp) AS bucket,
    node_id,
    AVG(pressure) AS avg_pressure,
    AVG(flow_rate) AS avg_flow_rate,
    MIN(pressure) AS min_pressure,
    MAX(pressure) AS max_pressure,
    STDDEV(pressure) AS stddev_pressure,
    STDDEV(flow_rate) AS stddev_flow_rate,
    COUNT(*) AS sample_count
FROM sensor_data
GROUP BY bucket, node_id
WITH DATA;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_refresh_continuous_aggregate'
        AND hypertable_name = 'sensor_data_daily_stats'
    ) THEN
        PERFORM add_continuous_aggregate_policy('sensor_data_daily_stats',
            start_offset => interval '3 days',
            end_offset => interval '1 day',
            schedule_interval => interval '1 day');
    END IF;
END $$;
