package models

import "time"

type StoneRelic struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	Location  string    `json:"location"`
	ModelPath string    `json:"model_path"`
	CreatedAt time.Time `json:"created_at"`
}

type Sensor struct {
	ID        uint64    `json:"id"`
	RelicID   uint64    `json:"relic_id"`
	Type      string    `json:"type"`
	Model     string    `json:"model"`
	PositionX float32   `json:"position_x"`
	PositionY float32   `json:"position_y"`
	CreatedAt time.Time `json:"created_at"`
}

type SensorData struct {
	ID                uint64    `json:"id"`
	SensorID          uint64    `json:"sensor_id"`
	RelicID           uint64    `json:"relic_id"`
	Timestamp         time.Time `json:"timestamp"`
	Value             float32   `json:"value"`
	Unit              string    `json:"unit"`
	SO2Concentration  float32   `json:"so2_concentration"`
	Humidity          float32   `json:"humidity"`
	Temperature       float32   `json:"temperature"`
}

type SensorDataBatch struct {
	Data []SensorData `json:"data"`
}

type LatestSensorData struct {
	RelicID          uint64    `json:"relic_id"`
	SensorID         uint64    `json:"sensor_id"`
	LatestTime       time.Time `json:"latest_time"`
	LatestValue      float32   `json:"latest_value"`
	LatestUnit       string    `json:"latest_unit"`
	LatestSO2        float32   `json:"latest_so2"`
	LatestHumidity   float32   `json:"latest_humidity"`
	LatestTemperature float32  `json:"latest_temperature"`
}

type AlertRecord struct {
	ID        uint64    `json:"id"`
	RelicID   uint64    `json:"relic_id"`
	SensorID  uint64    `json:"sensor_id"`
	Type      string    `json:"type"`
	Level     string    `json:"level"`
	Value     float32   `json:"value"`
	Threshold float32   `json:"threshold"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

type CleaningRecord struct {
	ID             uint64    `json:"id"`
	RelicID        uint64    `json:"relic_id"`
	AreaID         uint32    `json:"area_id"`
	LaserPower     float32   `json:"laser_power"`
	PulseDuration  float32   `json:"pulse_duration"`
	ScanSpeed      float32   `json:"scan_speed"`
	PredictedDepth float32   `json:"predicted_depth"`
	ActualDepth    float32   `json:"actual_depth"`
	Operator       string    `json:"operator"`
	CreatedAt      time.Time `json:"created_at"`
}

type CleaningParameterOpt struct {
	ID                      uint64    `json:"id"`
	RelicID                 uint64    `json:"relic_id"`
	AreaID                  uint32    `json:"area_id"`
	TargetThickness         float32   `json:"target_thickness"`
	MaterialType            string    `json:"material_type"`
	OptimalPower            float32   `json:"optimal_power"`
	OptimalPulse            float32   `json:"optimal_pulse"`
	OptimalSpeed            float32   `json:"optimal_speed"`
	PredictedEnergyDensity  float32   `json:"predicted_energy_density"`
	AblationThreshold       float32   `json:"ablation_threshold"`
	Confidence              float32   `json:"confidence"`
	CreatedAt               time.Time `json:"created_at"`
}

type ScaleGrowthPrediction struct {
	Hours             int       `json:"hours"`
	InitialThickness  float32   `json:"initial_thickness"`
	SO2Concentration  float32   `json:"so2_concentration"`
	Humidity          float32   `json:"humidity"`
	Temperature       float32   `json:"temperature"`
	PredictedThickness []float32 `json:"predicted_thickness"`
}

type LaserCleaningRequest struct {
	TargetThickness float32 `json:"target_thickness"`
	MaterialType    string  `json:"material_type"`
	RelicID         uint64  `json:"relic_id"`
	AreaID          uint32  `json:"area_id"`
}

type LaserCleaningResult struct {
	OptimalPower           float32 `json:"optimal_power"`
	OptimalPulse           float32 `json:"optimal_pulse"`
	OptimalSpeed           float32 `json:"optimal_speed"`
	PredictedDepth         float32 `json:"predicted_depth"`
	PredictedEnergyDensity float32 `json:"predicted_energy_density"`
	AblationThreshold      float32 `json:"ablation_threshold"`
	Confidence             float32 `json:"confidence"`
	SafetyWarning          string  `json:"safety_warning"`
}

type DailyStatistics struct {
	RelicID       uint64    `json:"relic_id"`
	Date          time.Time `json:"date"`
	AvgThickness  float32   `json:"avg_thickness"`
	MaxThickness  float32   `json:"max_thickness"`
	AvgRoughness  float32   `json:"avg_roughness"`
	MaxRoughness  float32   `json:"max_roughness"`
	AvgSO2        float32   `json:"avg_so2"`
	AvgHumidity   float32   `json:"avg_humidity"`
	AvgTemperature float32  `json:"avg_temperature"`
	DataCount     uint64    `json:"data_count"`
}

type RelicDetail struct {
	StoneRelic
	Sensors        []Sensor            `json:"sensors"`
	LatestData     []LatestSensorData  `json:"latest_data"`
	MaxThickness   float32             `json:"max_thickness"`
	AvgRoughness   float32             `json:"avg_roughness"`
	AlertCount     int                 `json:"alert_count"`
}
