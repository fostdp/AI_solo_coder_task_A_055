package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go.uber.org/zap"
	"math"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

type SensorConfig struct {
	ID           uint64
	RelicID      uint64
	Type         string
	BaseValue    float64
	DriftRate    float64
	CurrentValue float64
	LastUpdate   time.Time
}

type SensorData struct {
	ID               uint64    `json:"id"`
	SensorID         uint64    `json:"sensor_id"`
	RelicID          uint64    `json:"relic_id"`
	Timestamp        time.Time `json:"timestamp"`
	Value            float32   `json:"value"`
	Unit             string    `json:"unit"`
	SO2Concentration float32   `json:"so2_concentration"`
	Humidity         float32   `json:"humidity"`
	Temperature      float32   `json:"temperature"`
}

type EtherCATSimulator struct {
	apiEndpoint   string
	interval      time.Duration
	sensors       []*SensorConfig
	stopChan      chan struct{}
	mu            sync.Mutex
	totalSent     uint64
	alertCounter  uint64
	historicStart time.Time
}

var relicSensorLayout = []struct {
	RelicID    uint64
	Ultrasonic int
	Roughness  int
}{
	{1, 3, 2}, {2, 4, 3}, {3, 4, 2}, {4, 3, 2}, {5, 2, 2},
	{6, 3, 2}, {7, 2, 2}, {8, 3, 2}, {9, 3, 1}, {10, 3, 2},
}

func NewEtherCATSimulator(apiEndpoint string, interval time.Duration) *EtherCATSimulator {
	sim := &EtherCATSimulator{
		apiEndpoint:   apiEndpoint,
		interval:      interval,
		stopChan:      make(chan struct{}),
		historicStart: time.Now().AddDate(0, -1, 0),
	}
	sim.initSensors()
	return sim
}

func (s *EtherCATSimulator) initSensors() {
	nextUS := uint64(1)
	nextRT := uint64(101)

	for _, layout := range relicSensorLayout {
		for i := 0; i < layout.Ultrasonic; i++ {
			baseV := 0.3 + rand.Float64()*1.5
			s.sensors = append(s.sensors, &SensorConfig{
				ID:           nextUS,
				RelicID:      layout.RelicID,
				Type:         "ultrasonic",
				BaseValue:    baseV,
				DriftRate:    0.0005 + rand.Float64()*0.0015,
				CurrentValue: baseV,
				LastUpdate:   s.historicStart,
			})
			nextUS++
		}
		for i := 0; i < layout.Roughness; i++ {
			baseV := 5.0 + rand.Float64()*20.0
			s.sensors = append(s.sensors, &SensorConfig{
				ID:           nextRT,
				RelicID:      layout.RelicID,
				Type:         "roughness",
				BaseValue:    baseV,
				DriftRate:    0.01 + rand.Float64()*0.05,
				CurrentValue: baseV,
				LastUpdate:   s.historicStart,
			})
			nextRT++
		}
	}
	zap.L().Info(fmt.Sprintf("Initialized %d sensors", len(s.sensors)))
}

func (s *EtherCATSimulator) simulateValue(sensor *SensorConfig, ts time.Time) float64 {
	hoursElapsed := ts.Sub(s.historicStart).Hours()
	diurnalCycle := math.Sin(2*math.Pi*float64(ts.Hour())/24) * 0.08
	seasonalCycle := math.Sin(2*math.Pi*float64(ts.YearDay())/365) * 0.12
	growthTrend := sensor.DriftRate * hoursElapsed
	randomNoise := (rand.Float64() - 0.5) * 0.1

	anomaly := 0.0
	if rand.Float64() < 0.005 {
		anomaly = rand.Float64() * 1.5
		zap.L().Warn(fmt.Sprintf("Sensor %d anomaly spike generated", sensor.ID))
	}

	value := sensor.BaseValue * (1 + growthTrend + diurnalCycle + seasonalCycle + randomNoise)
	value += anomaly

	if value < 0 {
		value = 0
	}
	if sensor.Type == "ultrasonic" && value > 8 {
		value = 8
	}
	if sensor.Type == "roughness" && value > 200 {
		value = 200
	}
	return value
}

func (s *EtherCATSimulator) generateSO2(relicID uint64, ts time.Time) float32 {
	base := 10.0 + float64(relicID)*2.5
	seasonal := 8.0 * math.Sin(2*math.Pi*float64(ts.YearDay())/365+1.5)
	random := (rand.Float64() - 0.3) * 5.0
	return float32(math.Max(0, base+seasonal+random))
}

func (s *EtherCATSimulator) generateHumidity(relicID uint64, ts time.Time) float32 {
	baseHumidity := map[uint64]float64{
		1: 45, 2: 75, 3: 55, 4: 35, 5: 60,
		6: 70, 7: 50, 8: 48, 9: 52, 10: 40,
	}
	base := baseHumidity[relicID]
	diurnal := -10.0 * math.Sin(2*math.Pi*float64(ts.Hour()-6)/24)
	random := (rand.Float64() - 0.5) * 8.0
	h := base + diurnal + random
	return float32(math.Max(10, math.Min(98, h)))
}

func (s *EtherCATSimulator) generateTemperature(relicID uint64, ts time.Time) float32 {
	baseTemp := map[uint64]float64{
		1: 8, 2: 18, 3: 14, 4: 11, 5: 10,
		6: 17, 7: 12, 8: 9, 9: 13, 10: 7,
	}
	base := baseTemp[relicID]
	seasonal := 15.0 * math.Sin(2*math.Pi*(float64(ts.YearDay())-80)/365)
	diurnal := 6.0 * math.Sin(2*math.Pi*float64(ts.Hour()-14)/24)
	random := (rand.Float64() - 0.5) * 2.0
	return float32(base + seasonal + diurnal + random)
}

func (s *EtherCATSimulator) generateBatch(ts time.Time) []SensorData {
	var batch []SensorData
	baseID := uint64(ts.UnixNano() / 1e6)

	for i, sensor := range s.sensors {
		value := s.simulateValue(sensor, ts)
		unit := "mm"
		if sensor.Type == "roughness" {
			unit = "μm"
		}

		batch = append(batch, SensorData{
			ID:               baseID + uint64(i),
			SensorID:         sensor.ID,
			RelicID:          sensor.RelicID,
			Timestamp:        ts,
			Value:            float32(value),
			Unit:             unit,
			SO2Concentration: s.generateSO2(sensor.RelicID, ts),
			Humidity:         s.generateHumidity(sensor.RelicID, ts),
			Temperature:      s.generateTemperature(sensor.RelicID, ts),
		})

		sensor.CurrentValue = value
		sensor.LastUpdate = ts
	}
	return batch
}

func (s *EtherCATSimulator) sendBatch(batch []SensorData) error {
	payload := map[string]interface{}{
		"data": batch,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := s.apiEndpoint + "/api/v1/sensors/upload"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-EtherCAT-Node", fmt.Sprintf("sim-node-%d", time.Now().Unix()%100))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	s.mu.Lock()
	s.totalSent += uint64(len(batch))
	for _, d := range batch {
		if (d.Unit == "mm" && d.Value > 3.0) || (d.Unit == "μm" && d.Value > 50.0) {
			s.alertCounter++
		}
	}
	s.mu.Unlock()

	return nil
}

func (s *EtherCATSimulator) BackfillHistory() {
	zap.L().Info("Starting historical data backfill...")
	step := 2 * time.Hour
	current := s.historicStart
	end := time.Now().Add(-2 * time.Hour)
	batchSize := 12

	var pending []SensorData
	count := 0
	for current.Before(end) {
		batch := s.generateBatch(current)
		pending = append(pending, batch...)

		if len(pending) >= batchSize*len(s.sensors) {
			if err := s.sendBatch(pending); err != nil {
				zap.L().Error("Backfill batch failed", zap.Error(err))
			} else {
				count += len(pending)
			}
			pending = nil
			time.Sleep(100 * time.Millisecond)
		}
		current = current.Add(step)
	}
	if len(pending) > 0 {
		if err := s.sendBatch(pending); err != nil {
			zap.L().Error("Final backfill batch failed", zap.Error(err))
		} else {
			count += len(pending)
		}
	}
	zap.L().Info(fmt.Sprintf("Historical backfill complete: %d records inserted", count))
}

func (s *EtherCATSimulator) Start() {
	zap.L().Info(fmt.Sprintf("EtherCAT simulator started, interval=%v, endpoint=%s", s.interval, s.apiEndpoint))

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	statsTicker := time.NewTicker(1 * time.Minute)
	defer statsTicker.Stop()

	for {
		select {
		case ts := <-ticker.C:
			batch := s.generateBatch(ts)
			go func(b []SensorData) {
				if err := s.sendBatch(b); err != nil {
					zap.L().Error("Send batch failed", zap.Error(err), zap.Time("timestamp", b[0].Timestamp))
				} else {
					zap.L().Debug(fmt.Sprintf("Sent EtherCAT batch: %d samples at %s", len(b), b[0].Timestamp.Format("15:04:05")))
				}
			}(batch)

		case <-statsTicker.C:
			s.mu.Lock()
			zap.L().Info(fmt.Sprintf("Simulator stats: total=%d, alerts=%d, sensors=%d", s.totalSent, s.alertCounter, len(s.sensors)))
			s.mu.Unlock()

		case <-s.stopChan:
			zap.L().Info("EtherCAT simulator stopped")
			return
		}
	}
}

func (s *EtherCATSimulator) Stop() {
	close(s.stopChan)
}

func (s *EtherCATSimulator) GetStats() map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]interface{}{
		"total_sent":  s.totalSent,
		"alerts":      s.alertCounter,
		"sensors":     len(s.sensors),
		"interval_s":  s.interval.Seconds(),
		"api_endpoint": s.apiEndpoint,
	}
}

func main() {
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()
	zap.ReplaceGlobals(logger)

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	_ = rng

	endpoint := "http://127.0.0.1:8080"
	interval := 10 * time.Second

	sim := NewEtherCATSimulator(endpoint, interval)

	zap.L().Info("Waiting 3s for backend to be ready...")
	time.Sleep(3 * time.Second)

	sim.BackfillHistory()

	sim.Start()
}
