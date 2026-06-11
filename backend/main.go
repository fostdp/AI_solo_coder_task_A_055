package main

import (
	"fmt"
	"go.uber.org/zap"
	"stone-relic-monitor/internal/alert"
	"stone-relic-monitor/internal/algorithms"
	"stone-relic-monitor/internal/config"
	"stone-relic-monitor/internal/db"
	"stone-relic-monitor/internal/handlers"
	"stone-relic-monitor/internal/router"
	"stone-relic-monitor/internal/services"
)

func main() {
	cfg := config.Load()

	logger, _ := zap.NewDevelopment()
	defer logger.Sync()
	zap.ReplaceGlobals(logger)

	algorithms.SetLaserConfig(cfg.Laser)

	clickhouseDB := db.NewClickHouse(cfg)
	if err := clickhouseDB.Connect(); err != nil {
		zap.L().Fatal("Failed to connect to ClickHouse", zap.Error(err))
	}
	defer clickhouseDB.Close()

	wsHub := alert.NewHub()
	go wsHub.Run()

	alertService := alert.NewAlertService(cfg, clickhouseDB, wsHub)
	monitorService := services.NewMonitorService(cfg, clickhouseDB, alertService)
	go monitorService.Start()

	sensorHandler := handlers.NewSensorHandler(cfg, clickhouseDB)
	relicHandler := handlers.NewRelicHandler(cfg, clickhouseDB)
	alertHandler := handlers.NewAlertHandler(cfg, clickhouseDB, wsHub)
	algorithmHandler := handlers.NewAlgorithmHandler(cfg, clickhouseDB)
	cleaningHandler := handlers.NewCleaningHandler(cfg, clickhouseDB)

	r := router.SetupRouter(cfg, sensorHandler, relicHandler, alertHandler, algorithmHandler, cleaningHandler, wsHub)

	zap.L().Info("Server starting", zap.Int("port", cfg.Server.Port))
	if err := r.Run(fmt.Sprintf(":%d", cfg.Server.Port)); err != nil {
		zap.L().Fatal("Failed to start server", zap.Error(err))
	}
}
