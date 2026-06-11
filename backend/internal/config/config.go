package config

import (
	"fmt"
	"github.com/spf13/viper"
	"go.uber.org/zap"
)

type Config struct {
	Server     ServerConfig
	ClickHouse ClickHouseConfig
	Alert      AlertConfig
	Threshold  ThresholdConfig
	Simulator  SimulatorConfig
	Relics     []RelicInfo
}

type ServerConfig struct {
	Port int
	Mode string
}

type ClickHouseConfig struct {
	Host            string
	Port            int
	Database        string
	Username        string
	Password        string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime int
}

type AlertConfig struct {
	DingtalkWebhook string
	DingtalkSecret  string
	EnableWS        bool
}

type ThresholdConfig struct {
	ScaleThicknessMM float64
	RoughnessUM      float64
}

type SimulatorConfig struct {
	EtherCATPort    int
	IntervalSeconds int
}

type RelicInfo struct {
	ID       int
	Name     string
	Location string
	Sensors  SensorCount
}

type SensorCount struct {
	Ultrasonic int
	Roughness  int
}

func Load() *Config {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		zap.L().Warn("Config file not found, using defaults", zap.Error(err))
	}

	cfg := &Config{}
	if err := viper.Unmarshal(cfg); err != nil {
		panic(fmt.Errorf("failed to unmarshal config: %w", err))
	}

	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8080
	}
	if cfg.Server.Mode == "" {
		cfg.Server.Mode = "debug"
	}
	if cfg.ClickHouse.Host == "" {
		cfg.ClickHouse.Host = "127.0.0.1"
		cfg.ClickHouse.Port = 9000
		cfg.ClickHouse.Database = "stone_relic"
		cfg.ClickHouse.Username = "default"
		cfg.ClickHouse.MaxOpenConns = 50
		cfg.ClickHouse.MaxIdleConns = 10
		cfg.ClickHouse.ConnMaxLifetime = 3600
	}
	if cfg.Threshold.ScaleThicknessMM == 0 {
		cfg.Threshold.ScaleThicknessMM = 3.0
	}
	if cfg.Threshold.RoughnessUM == 0 {
		cfg.Threshold.RoughnessUM = 50.0
	}

	zap.L().Info("Config loaded successfully")
	return cfg
}
