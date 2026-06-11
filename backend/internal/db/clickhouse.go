package db

import (
	"context"
	"database/sql"
	"fmt"
	_ "github.com/ClickHouse/clickhouse-go/v2"
	"go.uber.org/zap"
	"stone-relic-monitor/internal/config"
	"time"
)

type ClickHouse struct {
	cfg *config.Config
	DB  *sql.DB
}

func NewClickHouse(cfg *config.Config) *ClickHouse {
	return &ClickHouse{cfg: cfg}
}

func (ch *ClickHouse) Connect() error {
	dsn := fmt.Sprintf(
		"clickhouse://%s:%s@%s:%d/%s?dial_timeout=10s&read_timeout=20s",
		ch.cfg.ClickHouse.Username,
		ch.cfg.ClickHouse.Password,
		ch.cfg.ClickHouse.Host,
		ch.cfg.ClickHouse.Port,
		ch.cfg.ClickHouse.Database,
	)

	db, err := sql.Open("clickhouse", dsn)
	if err != nil {
		return fmt.Errorf("open clickhouse failed: %w", err)
	}

	db.SetMaxOpenConns(ch.cfg.ClickHouse.MaxOpenConns)
	db.SetMaxIdleConns(ch.cfg.ClickHouse.MaxIdleConns)
	db.SetConnMaxLifetime(time.Duration(ch.cfg.ClickHouse.ConnMaxLifetime) * time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("ping clickhouse failed: %w", err)
	}

	ch.DB = db
	zap.L().Info("ClickHouse connected successfully")
	return nil
}

func (ch *ClickHouse) Close() error {
	if ch.DB != nil {
		return ch.DB.Close()
	}
	return nil
}

func (ch *ClickHouse) Exec(ctx context.Context, query string, args ...interface{}) error {
	_, err := ch.DB.ExecContext(ctx, query, args...)
	return err
}

func (ch *ClickHouse) Query(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	return ch.DB.QueryContext(ctx, query, args...)
}

func (ch *ClickHouse) QueryRow(ctx context.Context, query string, args ...interface{}) *sql.Row {
	return ch.DB.QueryRowContext(ctx, query, args...)
}
