package router

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"stone-relic-monitor/internal/alert"
	"stone-relic-monitor/internal/config"
	"stone-relic-monitor/internal/handlers"
	"time"
)

func SetupRouter(
	cfg *config.Config,
	sensorHandler *handlers.SensorHandler,
	relicHandler *handlers.RelicHandler,
	alertHandler *handlers.AlertHandler,
	algorithmHandler *handlers.AlgorithmHandler,
	cleaningHandler *handlers.CleaningHandler,
	wsHub *alert.Hub,
) *gin.Engine {
	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "stone-relic-monitor",
		})
	})

	r.GET("/ws", func(c *gin.Context) {
		alert.ServeWS(wsHub, c.Writer, c.Request)
	})

	api := r.Group("/api/v1")
	{
		relics := api.Group("/relics")
		{
			relics.GET("", relicHandler.List)
			relics.GET("/:id", relicHandler.Get)
			relics.GET("/:id/daily-stats", relicHandler.GetDailyStats)
		}

		sensors := api.Group("/sensors")
		{
			sensors.GET("/relic/:relic_id/latest", sensorHandler.GetLatestByRelic)
			sensors.GET("/:sensor_id/history", sensorHandler.GetHistory)
			sensors.POST("/upload", sensorHandler.UploadBatch)
		}

		alerts := api.Group("/alerts")
		{
			alerts.GET("", alertHandler.List)
			alerts.GET("/stats", alertHandler.GetStats)
			alerts.GET("/relic/:relic_id", alertHandler.GetByRelic)
		}

		alg := api.Group("/algorithms")
		{
			alg.POST("/predict-scale-growth", algorithmHandler.PredictScaleGrowth)
			alg.POST("/predict-laser-cleaning", algorithmHandler.PredictLaserCleaning)
		}

		cleaning := api.Group("/cleaning")
		{
			cleaning.POST("/records", cleaningHandler.CreateRecord)
			cleaning.GET("/records", cleaningHandler.List)
			cleaning.GET("/opt-log", cleaningHandler.GetOptLog)
		}
	}

	return r
}
