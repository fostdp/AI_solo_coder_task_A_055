# 城市供水管网漏损监测系统

实时监测城市供水管网运行状态，自动识别爆管、漏损等异常，辅助运维人员快速定位和处置。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          前端 (浏览器)                               │
│                                                                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ EventBus │  │WebSocket  │  │ DataStore│  │ AlarmManager     │   │
│  │ 事件总线  │  │  Client   │  │ 数据存储  │  │ LeakManager      │   │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │              │                  │             │
│  ┌────┴──────────────┴──────────────┴──────────────────┴──────────┐  │
│  │                    MapRenderer (Canvas 2D)                      │  │
│  │         管网拓扑 │ 视口裁剪 │ 分级渲染 │ requestAnimationFrame    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ WebSocket / REST API
┌──────────────────────────────┴──────────────────────────────────────┐
│                       后端 (Node.js + Express)                       │
│                                                                      │
│  ┌─────────────────── EventBus 事件总线 ─────────────────────┐      │
│  │                                                            │      │
│  │  SENSOR_DATA_STORED ──┬── NightFlowAnalyzer (夜间分析)     │      │
│  │                       ├── LeakAnalysisEngine  (漏损引擎)   │      │
│  │                       ├── AlarmDispatcher    (告警检测)     │      │
│  │                       └── AlertNotifier      (消息推送)     │      │
│  │                                                            │      │
│  │  ALARM_DETECTED  ─────→ AlertNotifier ──→ WebSocket        │      │
│  │  LEAK_SUSPECT    ─────→ AlertNotifier ──→ WebSocket        │      │
│  │  NIGHT_ANALYSIS  ─────→ AlertNotifier ──→ WebSocket        │      │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌───────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ WaterDataCollector │  │ NetworkTopology  │  │ DataSimulator    │  │
│  │ 数据接收/存储/缓存  │  │ 拓扑配置动态加载  │  │ 可配置传感器模拟  │  │
│  └────────┬──────────┘  └──────────────────┘  └──────────────────┘  │
│           │                                                          │
└───────────┼──────────────────────────────────────────────────────────┘
            │
┌───────────┴──────────────────────────────────────────────────────────┐
│                  TimescaleDB (PostgreSQL 时序扩展)                     │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────────────┐ │
│  │ sensor_data│  │  alarms    │  │ 连续聚合视图                    │ │
│  │ 超表       │  │  告警表    │  │ sensor_data_hourly_avg         │ │
│  │ 1天分块    │  │            │  │ sensor_data_daily_stats        │ │
│  │ 7天压缩   │  │ 30天压缩   │  │ 自动刷新策略                   │ │
│  │ 90天保留   │  │ 180天保留  │  │                                │ │
│  └────────────┘  └────────────┘  └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Docker 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Compose                         │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   app        │  │  postgres    │  │  pgadmin     │  │
│  │  :3000       │──│  :5432       │  │  :5050       │  │
│  │  Node.js     │  │  TimescaleDB │  │  (可选)       │  │
│  │  非root用户   │  │  PG15        │  │  debug profile│  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                 │                              │
│  ┌──────┴───────┐  ┌──────┴───────┐                     │
│  │ /app/data:ro │  │ pgdata 卷     │                     │
│  │ /app/config:ro│ │ 持久化存储     │                     │
│  └──────────────┘  └──────────────┘                     │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ water-monitor-net  172.28.0.0/16                    │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 方式一：Docker Compose 部署（推荐）

```bash
# 1. 克隆项目
git clone <repo-url> && cd water-leak-monitoring

# 2. 复制环境变量
cp .env.example .env

# 3. 编辑 .env 修改数据库密码等配置
# vim .env

# 4. 构建并启动所有服务
docker-compose up -d

# 5. 查看日志
docker-compose logs -f app

# 6. 访问系统
# http://localhost:3000
```

### 方式二：Docker Compose + 调试工具

```bash
# 启动应用和数据库，同时启用 pgAdmin 调试界面
docker-compose --profile debug up -d

# 访问 pgAdmin
# http://localhost:5050
# 邮箱: admin@water-monitor.local
# 密码: admin
```

### 方式三：本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动（内存模式，无需数据库）
$env:USE_DB="false"; npm start

# 3. 启动（连接本地 PostgreSQL）
npm start
```

### 方式四：仅 Docker 构建

```bash
# 构建镜像
docker build -t water-monitor .

# 运行（内存模式）
docker run -d -p 3000:3000 -e USE_DB=false water-monitor

# 运行（连接外部数据库）
docker run -d -p 3000:3000 \
  -e DB_HOST=your-db-host \
  -e DB_PASSWORD=your-password \
  water-monitor
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `USE_DB` | `true` | 是否使用 PostgreSQL，`false` 则用内存模式 |
| `DB_HOST` | `localhost` | PostgreSQL 主机地址 |
| `DB_PORT` | `5432` | PostgreSQL 端口 |
| `DB_NAME` | `water_monitor` | 数据库名 |
| `DB_USER` | `postgres` | 数据库用户 |
| `DB_PASSWORD` | `postgres` | 数据库密码 |
| `DB_POOL_MAX` | `20` | 连接池最大连接数 |
| `HTTP_PORT` | `3000` | HTTP 服务端口 |
| `SIMULATE_DATA` | `true` | 是否启动传感器模拟器 |
| `SIMULATOR_CONFIG` | `simulator-config.json` | 模拟器配置文件名 |
| `PGADMIN_EMAIL` | `admin@water-monitor.local` | pgAdmin 登录邮箱 |
| `PGADMIN_PASSWORD` | `admin` | pgAdmin 登录密码 |
| `PGADMIN_PORT` | `5050` | pgAdmin 端口 |

## 项目结构

```
water-leak-monitoring/
├── config/
│   ├── system.js                 # 系统阈值配置
│   ├── database.js               # 数据库连接配置
│   └── simulator-config.json     # 传感器模拟器配置
├── data/
│   ├── nodes-demo.json           # 管网节点定义（demo规模）
│   ├── pipes-demo.json           # 管线定义（demo规模）
│   ├── network-topology.json     # 综合拓扑配置
│   └── generate-topology.js      # 拓扑生成脚本
├── database/
│   ├── init.sql                  # 数据库表结构
│   └── init-timescale.sql        # TimescaleDB 时序扩展
├── server/
│   ├── index.js                  # 服务入口 & API 路由
│   ├── database.js               # 数据库抽象层（PG/内存双模式）
│   ├── data-simulator.js         # 可配置传感器模拟器
│   ├── core/
│   │   └── EventBus.js           # 事件总线
│   ├── collectors/
│   │   └── WaterDataCollector.js  # 数据接收与分发
│   ├── analyzers/
│   │   ├── NightFlowAnalyzer.js   # 夜间流量分析
│   │   └── LeakAnalysisEngine.js  # 漏损概率分析
│   ├── alarms/
│   │   └── AlarmDispatcher.js     # 告警检测引擎
│   ├── notifiers/
│   │   └── AlertNotifier.js       # 告警推送通知
│   └── config/
│       └── NetworkTopology.js     # 管网拓扑配置管理
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── core/EventBus.js       # 前端事件总线
│       ├── services/WebSocketClient.js
│       ├── stores/DataStore.js
│       ├── managers/AlarmManager.js
│       ├── managers/LeakManager.js
│       ├── network.js             # Canvas 管网渲染器
│       └── app.js                 # 前端入口
├── Dockerfile                     # 多阶段构建，非root用户
├── docker-compose.yml             # TimescaleDB + App + pgAdmin
├── .env.example                   # 环境变量模板
├── .dockerignore
└── package.json
```

## 管网配置格式

### 节点配置 (data/nodes-*.json)

```json
[
  {
    "node_id": "N0001",
    "name": "水厂1",
    "x": 100,
    "y": 500,
    "type": "plant",
    "pressure_sensor": true,
    "flow_sensor": true
  }
]
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `node_id` | string | 是 | 节点唯一标识 |
| `name` | string | 否 | 节点名称 |
| `x` | number | 是 | Canvas 坐标 X |
| `y` | number | 是 | Canvas 坐标 Y |
| `type` | string | 是 | 节点类型：`plant`/`pump`/`pressure_station`/`junction`/`valve`/`hydrant` |
| `pressure_sensor` | boolean | 否 | 是否安装压力传感器 |
| `flow_sensor` | boolean | 否 | 是否安装流量计 |

### 管线配置 (data/pipes-*.json)

```json
[
  {
    "pipe_id": "P0001",
    "start_node_id": "N0001",
    "end_node_id": "N0003",
    "diameter": 800,
    "length": 2500,
    "material": "ductile_iron"
  }
]
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pipe_id` | string | 是 | 管线唯一标识 |
| `start_node_id` | string | 是 | 起始节点 ID |
| `end_node_id` | string | 是 | 终止节点 ID |
| `diameter` | number | 是 | 管径 (mm)，≥600 主干管 / ≥300 次干管 / <300 支管 |
| `length` | number | 是 | 管长 (m) |
| `material` | string | 否 | 材质：`ductile_iron`/`steel`/`pe`/`pvc` |

### 配置加载优先级

```
NetworkTopology.loadFromConfig('demo')
  → 读取 data/nodes-demo.json + data/pipes-demo.json

NetworkTopology.loadFromConfig('full')
  → 读取 data/network-topology.json

NetworkTopology.loadFromDatabase()
  → 查询 SELECT * FROM nodes / pipes
```

## 传感器模拟器配置

模拟器配置文件位于 `config/simulator-config.json`，支持以下层级覆盖：

```
globalDefaults → typeDefaults → nodeOverrides
```

### 配置示例

```json
{
  "reportIntervalMs": 3000,
  "anomalyInjectionInterval": 10,
  "anomalyInjectionChance": 0.3,
  "globalDefaults": {
    "basePressure": 0.35,
    "pressureNoise": 0.01,
    "pressureDrift": 0.002,
    "baseFlow": 15,
    "flowNoise": 1.0,
    "flowDrift": 0.5
  },
  "typeDefaults": {
    "plant": { "basePressure": 0.40, "baseFlow": 120 },
    "pump":  { "basePressure": 0.38, "baseFlow": 65 }
  },
  "nodeOverrides": {
    "N0001": { "basePressure": 0.42, "baseFlow": 130 }
  },
  "anomalyProfiles": {
    "burst": {
      "pressureDropRate": { "min": 0.03, "max": 0.05 },
      "flowIncreaseRate": { "min": 5, "max": 10 },
      "duration": { "min": 6, "max": 12 }
    },
    "leak": {
      "flowOffsetRatio": { "min": 0.2, "max": 0.5 },
      "duration": { "min": 20, "max": 40 }
    }
  },
  "dailyPattern": {
    "enabled": true,
    "curve": [
      { "hour": 0,  "factor": 0.40 },
      { "hour": 4,  "factor": 0.25 },
      { "hour": 8,  "factor": 1.00 },
      { "hour": 12, "factor": 0.75 },
      { "hour": 18, "factor": 1.00 },
      { "hour": 22, "factor": 0.55 },
      { "hour": 24, "factor": 0.40 }
    ],
    "weekendFactor": 0.75,
    "pressureFollowsFlow": true,
    "pressureFactorScale": 0.3
  }
}
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `reportIntervalMs` | 传感器上报间隔（毫秒） |
| `anomalyInjectionInterval` | 每隔多少次上报注入一次异常 |
| `anomalyInjectionChance` | 注入爆管的概率（0-1，其余为漏损） |
| `basePressure` | 基准压力 (MPa) |
| `pressureNoise` | 压力随机波动幅度 |
| `pressureDrift` | 压力缓慢漂移幅度 |
| `baseFlow` | 基准流量 (L/s) |
| `flowNoise` | 流量随机波动幅度 |
| `flowDrift` | 流量缓慢漂移幅度 |
| `dailyPattern.enabled` | 是否启用日间流量曲线 |
| `dailyPattern.curve` | 24小时流量系数曲线，线性插值 |
| `dailyPattern.weekendFactor` | 周末流量衰减系数 |
| `dailyPattern.pressureFollowsFlow` | 压力是否跟随流量波动 |
| `dailyPattern.pressureFactorScale` | 压力跟随流量的缩放比例 |

### 日间流量曲线

模拟器支持按24小时曲线模拟用水高峰和低谷：

- **凌晨 2:00-4:00** — factor 0.25-0.30，夜间最小流量时段
- **早高峰 7:00-9:00** — factor 0.90-1.00，用水高峰
- **午间 12:00** — factor 0.75，回落
- **晚高峰 18:00-19:00** — factor 0.95-1.00，第二高峰
- **深夜 22:00+** — factor 0.55 以下，逐步下降

周末整体流量乘以 `weekendFactor`（默认 0.75）。

## 模拟器控制 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `POST /api/simulator/inject` | POST | 向指定节点注入异常 |
| `POST /api/simulator/batch-inject` | POST | 批量注入异常 |
| `POST /api/simulator/set-node` | POST | 设置节点压力/流量基准值 |
| `POST /api/simulator/scenario` | POST | 加载测试场景 |
| `GET /api/simulator/nodes` | GET | 获取所有节点模拟状态 |

### 注入异常

```bash
curl -X POST http://localhost:3000/api/simulator/inject \
  -H "Content-Type: application/json" \
  -d '{"nodeId": "N0010", "type": "burst"}'
```

### 批量注入

```bash
curl -X POST http://localhost:3000/api/simulator/batch-inject \
  -H "Content-Type: application/json" \
  -d '{"nodes": ["N0010", "N0011", "N0012"], "type": "leak"}'
```

### 设置节点基准值

```bash
curl -X POST http://localhost:3000/api/simulator/set-node \
  -H "Content-Type: application/json" \
  -d '{"nodeId": "N0010", "pressure": 0.15, "flow": 50}'
```

### 加载测试场景

```bash
curl -X POST http://localhost:3000/api/simulator/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "name": "区域爆管演练",
    "steps": [
      {"action": "inject_burst", "nodeId": "N0010", "delay": 0},
      {"action": "inject_leak",  "nodeId": "N0011", "delay": 5},
      {"action": "set_pressure", "nodeId": "N0012", "value": 0.10, "delay": 10}
    ]
  }'
```

## 数据库设计

### TimescaleDB 时序扩展

| 表 | 类型 | 分块间隔 | 压缩策略 | 保留策略 |
|----|------|----------|----------|----------|
| `sensor_data` | 超表 | 1天 | 7天后压缩，按 node_id 分段 | 90天 |
| `alarms` | 普通表 + 压缩 | — | 30天后压缩，按 alarm_type 分段 | 180天 |

### 连续聚合视图

| 视图 | 时间桶 | 刷新策略 | 字段 |
|------|--------|----------|------|
| `sensor_data_hourly_avg` | 1小时 | 每小时刷新，偏移3h-1h | avg/min/max pressure, flow_rate, sample_count |
| `sensor_data_daily_stats` | 1天 | 每天刷新，偏移3d-1d | avg/min/max/stddev pressure, flow_rate, sample_count |

## 告警规则

| 告警类型 | 触发条件 | 严重级别 |
|----------|----------|----------|
| 爆管预警 | 压力骤降 ≥ 0.2 MPa，5分钟观察期后未恢复至70% | critical |
| 漏损预警 | 夜间流量 > 工作日/周末基准值 × 1.5 | warning |
| 离线告警 | 传感器离线超过 15 分钟 | warning |

## API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/network-data` | GET | 获取管网拓扑（节点+管线） |
| `/api/nodes` | GET | 获取所有节点 |
| `/api/pipes` | GET | 获取所有管线 |
| `/api/sensor-data/:nodeId` | GET | 获取节点历史数据（`?hours=24`） |
| `/api/alarms` | GET | 获取告警列表（`?limit=50`） |
| `/api/leak-suspects` | GET | 获取漏损嫌疑区域 |
| `/api/stats` | GET | 获取各模块运行状态 |
| `/api/simulator/inject` | POST | 注入单节点异常 |
| `/api/simulator/batch-inject` | POST | 批量注入异常 |
| `/api/simulator/set-node` | POST | 设置节点基准值 |
| `/api/simulator/scenario` | POST | 加载测试场景 |
| `/api/simulator/nodes` | GET | 获取模拟器节点状态 |

## 技术栈

- **后端**: Node.js + Express + WebSocket (ws)
- **数据库**: PostgreSQL 15 + TimescaleDB（时序超表、连续聚合、自动压缩保留策略）
- **前端**: 原生 Canvas 2D + 事件驱动架构
- **容器化**: Docker 多阶段构建 + Docker Compose
- **数据库管理**: pgAdmin 4（可选，debug profile）

## 部署注意事项

### 生产环境建议

1. **数据库持久化**
   - 默认使用 Docker volume 存储数据，生产环境建议挂载到本地目录或使用云存储
   - 定期备份数据库：`docker exec water-monitor-db pg_dump -U postgres water_monitor > backup.sql`

2. **性能调优**
   - 传感器节点较多时，适当增加 `DB_POOL_MAX`
   - 数据量较大时，考虑缩短 TimescaleDB 保留策略
   - 调整 `reportIntervalMs` 平衡实时性和存储压力

3. **安全配置**
   - 修改默认数据库密码 `DB_PASSWORD`
   - 修改 pgAdmin 默认密码 `PGADMIN_PASSWORD`
   - 生产环境建议使用反向代理（Nginx）并配置 HTTPS
   - 限制 WebSocket 连接来源

4. **资源限制**
   - 根据实际节点数量调整容器内存限制
   - 建议最低配置：2C CPU / 4G 内存 / 50G 磁盘

### 常见问题

#### Q: 容器启动后数据库连接失败？
A: 检查 `DB_HOST` 是否为 `postgres`（Docker 内部服务名），确认数据库容器已完全启动并通过健康检查。

#### Q: 数据没有写入数据库？
A: 检查 `USE_DB` 是否为 `true`，查看日志中是否有数据库连接错误。可通过 `/api/stats` 查看 collector 运行状态。

#### Q: 端口被占用？
A: 修改 `.env` 中的 `HTTP_PORT`、`DB_PORT`、`PGADMIN_PORT`。

#### Q: 如何清空所有数据重新开始？
A:
```bash
docker-compose down -v
docker-compose up -d
```
**警告**: 这会删除所有持久化数据！

#### Q: 如何停止数据模拟器？
A: 设置环境变量 `SIMULATE_DATA=false`，或调用 API：
```bash
curl -X POST http://localhost:3000/api/simulator/stop
```

#### Q: 如何自定义管网拓扑？
A: 修改 `data/nodes-demo.json` 和 `data/pipes-demo.json`，然后重启服务。生产环境建议将拓扑数据存入数据库，使用 `NetworkTopology.loadFromDatabase()` 加载。

### Docker Compose 常用命令

```bash
# 启动所有服务
docker-compose up -d

# 启动服务并重建镜像
docker-compose up -d --build

# 查看日志
docker-compose logs -f app
docker-compose logs -f postgres

# 停止服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 停止并删除容器和数据卷（清空数据）
docker-compose down -v

# 查看服务状态
docker-compose ps

# 进入应用容器
docker exec -it water-monitor-app sh

# 进入数据库
docker exec -it water-monitor-db psql -U postgres -d water_monitor

# 导出数据库备份
docker exec water-monitor-db pg_dump -U postgres water_monitor > backup_$(date +%Y%m%d).sql

# 恢复数据库备份
docker exec -i water-monitor-db psql -U postgres -d water_monitor < backup.sql
```

### 监控与维护

1. **健康检查**
   - 应用健康检查：`GET /api/stats`
   - 容器健康状态：`docker-compose ps`

2. **日志监控**
   ```bash
   # 实时查看所有日志
   docker-compose logs -f

   # 只看错误日志
   docker-compose logs app | grep -i error
   ```

3. **数据库维护**
   ```sql
   -- 查看超表分块情况
   SELECT hypertable_name, chunk_name, range_start, range_end
   FROM timescaledb_information.chunks
   ORDER BY range_start DESC;

   -- 查看压缩策略
   SELECT * FROM timescaledb_information.jobs
   WHERE proc_name = 'policy_compression';

   -- 手动触发压缩
   SELECT compress_chunk(i, if_not_compressed => true)
   FROM show_chunks('sensor_data', older_than => interval '7 days') i;

   -- 查看连续聚合刷新状态
   SELECT * FROM timescaledb_information.job_stats
   WHERE hypertable_name = 'sensor_data_hourly_avg';
   ```

## 版本历史

### v2.0.0 - 模块化重构版本
- 事件驱动架构，解耦数据接收、分析、告警、推送模块
- 新增 WaterDataCollector、LeakAnalysisEngine、NightFlowAnalyzer、AlarmDispatcher、AlertNotifier、NetworkTopology
- 管网拓扑支持从配置文件和数据库动态加载
- 支持 PostgreSQL + TimescaleDB 时序数据库
- Docker 容器化部署，支持生产环境运行

### v1.0.0 - 初始版本
- 基础功能：数据采集、Canvas 渲染、告警检测
