package algorithms

import (
	"math"
	"stone-relic-monitor/internal/models"
)

const (
	DEFAULT_ABLATION_THRESHOLD = 1.2
	MIN_LASER_POWER            = 10.0
	MAX_LASER_POWER            = 500.0
	MIN_PULSE_DURATION         = 100.0
	MAX_PULSE_DURATION         = 10000.0
	MIN_SCAN_SPEED             = 1.0
	MAX_SCAN_SPEED             = 500.0
	SPOT_DIAMETER              = 0.1
	THERMAL_DIFFUSIVITY        = 0.001
	MOLAR_MASS_CASO4           = 136.14
	ENTHALPY_VAPORIZATION      = 1.8e6
	DENSITY_SCALE              = 2.32e3
	SAFETY_MARGIN              = 0.85
)

var materialAblationParams = map[string]struct {
	threshold  float64
	efficiency float64
}{
	"gypsum":         {1.2, 0.72},
	"calcium_sulfate":{1.2, 0.72},
	"calcite":        {2.8, 0.85},
	"dolomite":       {2.5, 0.80},
	"silicate":       {3.5, 0.90},
	"default":        {2.0, 0.78},
}

func PredictLaserCleaning(req *models.LaserCleaningRequest) *models.LaserCleaningResult {
	params, ok := materialAblationParams[req.MaterialType]
	if !ok {
		params = materialAblationParams["default"]
	}

	result := &models.LaserCleaningResult{
		AblationThreshold: float32(params.threshold),
		Confidence:        0.88,
	}

	targetDepth := float64(req.TargetThickness)
	spotArea := math.Pi * math.Pow(SPOT_DIAMETER/2, 2)

	minEnergyDensity := params.threshold / params.efficiency
	targetEnergyDensity := (DENSITY_SCALE * ENTHALPY_VAPORIZATION * targetDepth / MOLAR_MASS_CASO4 * 1e6) / params.efficiency
	optimalEnergyDensity := (minEnergyDensity + targetEnergyDensity) / 2 * SAFETY_MARGIN

	pulseDuration := 800.0
	scanSpeed := 50.0
	laserPower := 200.0

	minError := math.MaxFloat64
	for p := 50.0; p <= 300.0; p += 10.0 {
		for pd := 200.0; pd <= 2000.0; pd += 100.0 {
			for ss := 10.0; ss <= 200.0; ss += 5.0 {
				pulseEnergy := p * pd / 1e6
				energyDensity := pulseEnergy / spotArea
				overlap := 1 - (ss * pd / 1e6) / (SPOT_DIAMETER * 0.8)
				if overlap < 0.1 || overlap > 0.9 {
					continue
				}
				effectiveEnergy := energyDensity * (1 + overlap*0.5)

				heatPenetration := math.Sqrt(4 * THERMAL_DIFFUSIVITY * pd / 1e6)
				if heatPenetration < targetDepth*0.8 || heatPenetration > targetDepth*3.0 {
					continue
				}

				edError := math.Abs(effectiveEnergy - optimalEnergyDensity)
				thresholdRatio := effectiveEnergy / params.threshold
				if thresholdRatio < 1.05 || thresholdRatio > 3.0 {
					continue
				}

				totalError := edError*2.0 + math.Abs(thresholdRatio-1.8)*10.0
				if totalError < minError {
					minError = totalError
					laserPower = p
					pulseDuration = pd
					scanSpeed = ss
					result.PredictedEnergyDensity = float32(energyDensity)
				}
			}
		}
	}

	result.OptimalPower = float32(math.Min(MAX_LASER_POWER, math.Max(MIN_LASER_POWER, laserPower)))
	result.OptimalPulse = float32(math.Min(MAX_PULSE_DURATION, math.Max(MIN_PULSE_DURATION, pulseDuration)))
	result.OptimalSpeed = float32(math.Min(MAX_SCAN_SPEED, math.Max(MIN_SCAN_SPEED, scanSpeed)))

	pulseEnergy := float64(result.OptimalPower) * float64(result.OptimalPulse) / 1e6
	energyDensity := pulseEnergy / spotArea
	overlap := 1 - (float64(result.OptimalSpeed)*float64(result.OptimalPulse)/1e6)/(SPOT_DIAMETER*0.8)
	effectiveEnergy := energyDensity * (1 + overlap*0.5)

	result.PredictedDepth = float32(
		math.Min(targetDepth*1.05,
			math.Max(0,
				(effectiveEnergy-params.threshold)*params.efficiency*MOLAR_MASS_CASO4/(DENSITY_SCALE*ENTHALPY_VAPORIZATION)*1e6)))

	if effectiveEnergy/params.threshold > 2.5 {
		result.SafetyWarning = "警告：能量密度接近石材基体损伤阈值，建议先进行小区域试验"
		result.Confidence *= 0.85
	} else if effectiveEnergy/params.threshold < 1.1 {
		result.SafetyWarning = "注意：能量接近结垢烧蚀阈值，可能需要多遍扫描"
		result.Confidence *= 0.9
	} else {
		result.SafetyWarning = "参数安全，建议从0.8倍功率开始校准"
	}

	return result
}

func CalculateAblationDepth(laserPower float32, pulseDuration float32, energyDensity float32) float32 {
	params := materialAblationParams["calcium_sulfate"]
	spotArea := math.Pi * math.Pow(SPOT_DIAMETER/2, 2)
	pulseEnergy := float64(laserPower) * float64(pulseDuration) / 1e6
	ed := pulseEnergy / spotArea

	if ed < params.threshold {
		return 0
	}
	return float32((ed - params.threshold) * params.efficiency * MOLAR_MASS_CASO4 / (DENSITY_SCALE * ENTHALPY_VAPORIZATION) * 1e6)
}

func OptimizeCleaningParametersBatch(targets []models.LaserCleaningRequest) []models.LaserCleaningResult {
	results := make([]models.LaserCleaningResult, len(targets))
	for i, req := range targets {
		results[i] = *PredictLaserCleaning(&req)
	}
	return results
}
