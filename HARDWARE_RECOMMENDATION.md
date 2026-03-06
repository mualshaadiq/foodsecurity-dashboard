<div style="
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 90vh;
  text-align: center;
  font-family: 'Segoe UI', system-ui, sans-serif;
  page-break-after: always;
">
  <div style="margin-bottom: 32px;">
    <div style="
      width: 72px; height: 6px;
      background: linear-gradient(90deg, #1B3A5C, #2E7D32);
      margin: 0 auto 28px;
      border-radius: 3px;
    "></div>
    <div style="font-size: 13px; font-weight: 700; letter-spacing: 3px; color: #2E7D32; text-transform: uppercase; margin-bottom: 18px;">
      Hardware Recommendation
    </div>
    <div style="font-size: 46px; font-weight: 800; color: #1B3A5C; line-height: 1.15; margin-bottom: 14px;">
      Food Security<br>Dashboard
    </div>
    <div style="width: 72px; height: 6px; background: linear-gradient(90deg, #2E7D32, #1B3A5C); margin: 0 auto 32px; border-radius: 3px;"></div>
  </div>

  <div style="font-size: 13px; color: #4A5568; line-height: 2;">
    <div><strong>Prepared:</strong> March 6, 2026</div>
    <div><strong>Stack:</strong> FastAPI · PostgreSQL/PostGIS · Tegola · MapLibre GL · Nginx · Docker</div>
    <div><strong>Scope:</strong> VPS &amp; On-Premise (HPE) — Tier 1 through Tier 3</div>
  </div>
</div>

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Server Node Infrastructure](#-server-node-infrastructure)
   - [1. Master Node](#1-master-node-master)
   - [2. Workload Node](#2-workload-node-workload-n)
   - [3. Storage Node](#3-storage-node-storage)
   - [Cluster Communication Map](#cluster-communication-map)
   - [Per-Node Container Compose](#per-node-container-compose)
   - [Cluster Scaling by Tier](#cluster-scaling-by-tier)
   - [Node Scaling Rules](#node-scaling-rules)
   - [Failover & HA Topology](#failover--ha-topology)
3. [VPS Version](#-vps-version)
   - [Tier 1 — Development / Pilot](#tier-1--development--pilot-50-concurrent-users)
   - [Tier 2 — Production](#tier-2--production-50500-concurrent-users)
   - [Tier 3 — Enterprise VPS](#tier-3--enterprise-vps-5005000-concurrent-users)
4. [On-Premise Version (HPE)](#-on-premise-version-hpe)
   - [Tier 1 — Small Organization](#tier-1--small-organization-100-users)
   - [Tier 2 — Mid-Scale (500TB Build)](#tier-2--mid-scale-organization-5001000-users--500tb-hpe-storage)
   - [Tier 3 — Enterprise On-Premise](#tier-3--enterprise-on-premise-1000-users-ha)
5. [HPE 500TB Storage Architecture](#-hpe-500tb-storage-architecture)
6. [PostgreSQL/PostGIS Tuning](#-postgresqlpostgis-tuning)
7. [Docker Resource Limits](#-docker-resource-limits)
8. [Decision Matrix](#-decision-matrix)
9. [Recommendation](#-recommendation)

---

## Architecture Overview

```
                    ┌─────────────────────────────────────┐
                    │           Load Balancer              │
                    │         (Nginx / HAProxy)            │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
      ┌───────▼──────┐   ┌────────▼──────┐   ┌────────▼──────┐
      │  Web/Frontend│   │   API Backend  │   │  Tile Server   │
      │    (Nginx)   │   │   (FastAPI)    │   │   (Tegola)     │
      └──────────────┘   └───────────────┘   └───────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
      ┌───────▼──────┐   ┌────────▼──────┐   ┌────────▼──────┐
      │  PostgreSQL  │   │  Object Store  │   │  Redis Cache   │
      │  + PostGIS   │   │ (Raster/GeoTIF)│   │  (Sessions)    │
      └──────────────┘   └───────────────┘   └───────────────┘
```

---

## 🖧 Server Node Infrastructure

The cluster is organized into **3 logical node roles**. Each tier scales the number of physical/virtual machines assigned to each role, but the role boundaries remain consistent.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        3-NODE CLUSTER MODEL                          │
│                                                                      │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐  │
│   │   MASTER NODE   │   │  WORKLOAD NODE  │   │  STORAGE NODE   │  │
│   │                 │   │                 │   │                 │  │
│   │ • Orchestration │   │ • FastAPI       │   │ • PostgreSQL    │  │
│   │ • Load Balancer │   │ • Tegola Tiles  │   │   + PostGIS     │  │
│   │ • Monitoring    │   │ • ML Inference  │   │ • Redis Cache   │  │
│   │ • etcd / Patroni│   │ • Celery Jobs   │   │ • MinIO Rasters │  │
│   │ • Nginx Edge    │   │ • GPU workloads │   │ • PgBouncer     │  │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘  │
│            │                     │                      │           │
│            └─────────────────────┴──────────────────────┘           │
│                          Internal 25GbE fabric                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

### Node Roles & Responsibilities

#### 1. Master Node (`MASTER`)

The control plane of the cluster. Responsible for routing, orchestration, and observability. **Only one active master** (with a standby for HA tiers). Does not serve application workloads directly.

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| Nginx | `nginx:1.25-alpine` | `:80`, `:443` | Reverse proxy, SSL termination, static assets |
| Certbot | `certbot/certbot` | — | Auto-renew Let's Encrypt SSL |
| Prometheus | `prom/prometheus` | `:9090` | Metrics collection from all nodes |
| Grafana | `grafana/grafana` | `:3000` | Dashboards (infra + app metrics) |
| Loki | `grafana/loki` | `:3100` | Log aggregation |
| AlertManager | `prom/alertmanager` | `:9093` | Alert routing (email / Slack) |
| etcd | `bitnami/etcd` | `:2379` | Distributed consensus for Patroni DB HA |
| Patroni | (sidecar on Storage Node) | — | Coordinates DB primary election via etcd |

---

#### 2. Workload Node (`WORKLOAD-n`)

Stateless compute layer. Handles all API requests, tile generation, ML inference, and background jobs. **Horizontally scalable** — add more Workload Nodes without touching Master or Storage.

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| FastAPI Backend | `opengridindo/backend` | `:8000` | REST API (auth, analysis, export routes) |
| Tegola | `gospatial/tegola` | `:9090` | Vector tile generation from PostGIS |
| Celery Worker | `opengridindo/backend` | — | Async jobs (shapefile import, NDVI processing) |
| Celery Beat | `opengridindo/backend` | — | Scheduled tasks (runs on WORKLOAD-1 only) |
| Node Exporter | `prom/node-exporter` | `:9100` | System metrics → Master Prometheus |
| NVIDIA Container Toolkit | — | — | GPU passthrough for ML inference (T2/T3) |

---

#### 3. Storage Node (`STORAGE`)

Persistent data layer. Stateful — **never auto-scaled horizontally**, only vertically or with planned expansion. All data lives here.

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| PostgreSQL + PostGIS | `postgis/postgis:15-3.4` | `:5432` | Primary geospatial database |
| PgBouncer | `pgbouncer/pgbouncer` | `:6432` | Connection pooler (transaction mode) |
| PostgreSQL Replica | `postgis/postgis:15-3.4` | `:5433` | Streaming read replica (Tegola + analytics) |
| Redis | `redis:7-alpine` | `:6379` | Tile cache, session store, Celery broker |
| MinIO | `minio/minio` | `:9000`, `:9001` | Object storage (GeoTIFF, NDVI, NDWI, exports) |
| Node Exporter | `prom/node-exporter` | `:9100` | System metrics → Master Prometheus |

---

### Cluster Communication Map

```
                 Internet / WAN
                       │
               ┌───────▼────────┐
               │  MASTER NODE   │  ← Keepalived VIP (active/standby)
               │                │
               │  Nginx :443    │  ← All user HTTPS traffic enters here
               │  Prometheus    │
               │  Grafana       │
               │  etcd          │
               └───┬───────┬───┘
                   │       │
     HTTP :8000    │       │  HTTP :9090
    ┌──────────────┘       └──────────────┐
    │                                     │
┌───▼───────────────────────────────────┐ │
│         WORKLOAD NODE(s)              │ │
│                                       │ │
│  FastAPI :8000   Tegola :9090         │ │
│  Celery Worker   Celery Beat          │ │
│  ML Inference (GPU)                   │ │
└───┬──────────────────────┬────────────┘ │
    │                      │              │
    │ TCP :6432            │ TCP :6379    │ TCP :5433
    │ (PgBouncer)          │ (Redis)      │ (read replica)
    │                      │              │
┌───▼──────────────────────▼──────────────▼────────────┐
│                  STORAGE NODE                         │
│                                                       │
│  PostgreSQL Primary :5432  ──replication──►  :5433   │
│  PgBouncer         :6432                             │
│  Redis             :6379                             │
│  MinIO             :9000 / :9001                     │
└───────────────────────────────────────────────────────┘

All nodes ──── :9100 node-exporter metrics ────► MASTER Prometheus
```

---

### Per-Node Container Compose

#### MASTER NODE

```yaml
services:
  nginx:
    image: nginx:1.25-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/nginx.prod.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    restart: always

  certbot:
    image: certbot/certbot
    volumes:
      - ./nginx/ssl:/etc/letsencrypt

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    ports: ["9090:9090"]

  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "false"

  loki:
    image: grafana/loki:latest
    ports: ["3100:3100"]

  alertmanager:
    image: prom/alertmanager:latest
    ports: ["9093:9093"]

  etcd:
    image: bitnami/etcd:latest
    ports: ["2379:2379", "2380:2380"]
    environment:
      ALLOW_NONE_AUTHENTICATION: "yes"
      ETCD_ADVERTISE_CLIENT_URLS: http://MASTER:2379
```

#### WORKLOAD NODE (replicated × 2–8)

```yaml
services:
  backend:
    image: opengridindo/backend:latest
    environment:
      - DATABASE_URL=postgresql://STORAGE:6432/foodsec   # via PgBouncer
      - REDIS_URL=redis://STORAGE:6379/0
      - STORAGE_ENDPOINT=http://STORAGE:9000
    command: uvicorn app.main:app --workers 4 --host 0.0.0.0 --port 8000
    deploy:
      resources:
        limits: { cpus: '4', memory: 8G }

  tegola:
    image: gospatial/tegola:latest
    volumes:
      - ./tegola/config.toml:/opt/tegola_config/config.toml
    ports: ["9090:9090"]
    environment:
      - TEGOLA_SQL_HOST=STORAGE          # connects to read replica :5433
      - TEGOLA_CACHE_BACKEND=redis
      - TEGOLA_CACHE_REDIS_HOST=STORAGE:6379

  celery-worker:
    image: opengridindo/backend:latest
    command: celery -A app.tasks worker --loglevel=info --concurrency=4
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia                 # L40S GPU — T2/T3 only
              count: 1
              capabilities: [gpu]

  celery-beat:                               # WORKLOAD-1 only
    image: opengridindo/backend:latest
    command: celery -A app.tasks beat --loglevel=info

  node-exporter:
    image: prom/node-exporter:latest
    ports: ["9100:9100"]
```

#### STORAGE NODE

```yaml
services:
  postgres-primary:
    image: postgis/postgis:15-3.4
    environment:
      POSTGRES_DB: foodsec
      POSTGRES_USER: appuser
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init_db.sql:/docker-entrypoint-initdb.d/01_init.sql
    command: >
      postgres
        -c shared_buffers=32GB
        -c work_mem=256MB
        -c max_parallel_workers=16
        -c wal_level=replica
        -c max_wal_senders=3
    ports: ["5432:5432"]

  postgres-replica:
    image: postgis/postgis:15-3.4
    environment:
      POSTGRES_REPLICATION_USER: replicator
      PRIMARY_HOST: localhost
    command: >
      postgres
        -c hot_standby=on
        -c max_standby_streaming_delay=30s
    ports: ["5433:5432"]

  pgbouncer:
    image: pgbouncer/pgbouncer:latest
    ports: ["6432:6432"]
    environment:
      DATABASES_HOST: localhost
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 200
      DEFAULT_POOL_SIZE: 40

  redis:
    image: redis:7-alpine
    command: >
      redis-server
        --maxmemory 8gb
        --maxmemory-policy allkeys-lru
        --save 900 1
        --appendonly yes
    ports: ["6379:6379"]
    volumes:
      - redisdata:/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    volumes:
      - /mnt/nimble/rasters:/data          # HPE Nimble NFS mount
    ports: ["9000:9000", "9001:9001"]

  node-exporter:
    image: prom/node-exporter:latest
    ports: ["9100:9100"]
```

---

### Cluster Scaling by Tier

| Tier | Master Nodes | Workload Nodes | Storage Nodes |
|------|-------------|----------------|---------------|
| **VPS T1** | 1 (all-in-one) | — (merged into master) | — (merged into master) |
| **VPS T2** | 1 + 1 standby | 2–4 | 1 primary + 1 replica |
| **VPS T3** | 3 (K8s control plane) | 4–8 (HPA) | 3 (Patroni cluster) |
| **On-Prem T1** | 1 (baremetal) | — (merged into master) | — (merged into master) |
| **On-Prem T2** | 1+1 HPE DL380 (Keepalived) | 2× HPE DL380 + 1× HPE DL360 ML | 1 HPE DL380 + 2× HPE Nimble AF40 |
| **On-Prem T3** | 2× HPE DL380 (HA pair, 56-core/128 GB) | 4–6 compute DL380 (36-core) + 2–4 GPU DL380 (64-core/4×L40S) | 3× HPE DL380 Patroni (36-core/1TB) + 8× MinIO nodes (~1 PB) |

---

### Node Scaling Rules

| Node | Scale Trigger | Action | Max |
|------|--------------|--------|-----|
| **WORKLOAD** | CPU > 70% sustained 3 min | +1 Workload Node replica | 8 |
| **WORKLOAD** | GPU utilization > 85% | +1 GPU Workload Node | 4 |
| **STORAGE (Redis)** | Memory > 80% | Vertical — add RAM | N/A |
| **STORAGE (DB)** | Read query latency > 500ms | Add read replica on new Storage Node | 3 |
| **STORAGE (MinIO)** | Disk > 80% full | Expand MinIO pool / add NFS volume | Unlimited |
| **MASTER** | Connections > 10k | Promote standby to active + ECMP | 2 |

---

### Failover & HA Topology

```
MASTER (active) ──── Keepalived VIP ────► MASTER (standby)
       │                                         │
       │  etcd consensus (quorum = 3 for T3)     │
       ▼                                         │
WORKLOAD pool (round-robin, health-checked by Nginx upstream)
       │
       ▼
STORAGE NODE
  PostgreSQL Primary ──streaming replication──► Replica
       │
       │  Patroni watches via etcd
       ▼  Auto-promotes replica if primary fails (<30 sec)

Component      │ Strategy           │ RTO       │ RPO
───────────────┼────────────────────┼───────────┼──────────
Master Node    │ Keepalived VIP     │ < 5 sec   │ 0
Workload Nodes │ Rolling deploy     │ 0         │ 0
PostgreSQL     │ Patroni + etcd     │ < 30 sec  │ < 1 sec
Redis          │ Sentinel + AOF     │ < 10 sec  │ < 1 sec
MinIO          │ Erasure coding     │ < 60 sec  │ 0
```

---

## ☁️ VPS Version

### Tier 1 — Development / Pilot (≤50 concurrent users)

> Single VPS, all services containerized via Docker Compose

| Component | Spec | Provider Example |
|-----------|------|-----------------|
| **VPS** | 8 vCPU / 16 GB RAM / 200 GB NVMe SSD | Hetzner CX41, DigitalOcean 8GB, Vultr |
| **OS** | Ubuntu 22.04 LTS | — |
| **Network** | 1 Gbps uplink, unmetered | — |
| **Backup** | Weekly snapshot (provider-managed) | — |

**Per-node slice allocation (all 3 nodes co-located):**

| Node | vCPU | RAM | Services |
|------|------|-----|----------|
| **Master** | 0.5 | 512 MB | Nginx, Prometheus, Grafana, Loki |
| **Workload** | 3 | 6 GB | FastAPI ×2, Tegola, Celery Worker |
| **Storage** | 3 | 8 GB | PostgreSQL + PostGIS, Redis |
| OS overhead | 1.5 | 1.5 GB | — |
| **Total** | **8 vCPU** | **16 GB** | — |

---

### Tier 2 — Production (50–500 concurrent users)

> Multi-node setup, horizontally scalable

| Node | Count | Spec | Services |
|------|-------|------|----------|
| **Master Node** | 1 active + 1 standby (Keepalived VIP) | 2 vCPU / 2 GB / 40 GB SSD | Nginx, Certbot, Prometheus, Grafana, Loki, AlertManager |
| **Workload Node** | 2–4 (auto-scale; CPU > 70% → +1) | 4 vCPU / 8 GB / 80 GB NVMe per node | FastAPI ×4 workers, Tegola, Celery |
| **Storage Node — Primary** | 1 | 8 vCPU / 32 GB / 500 GB NVMe | PostgreSQL + PostGIS, PgBouncer |
| **Storage Node — Replica** | 1 | 8 vCPU / 16 GB / 500 GB NVMe | Read replica (Tegola + analytics); lag < 500 ms |
| **Cache** | (co-located on storage) | 2 vCPU / 4 GB | Redis — tile cache + Celery broker |
| **Object Storage** | — | 2 TB managed bucket | S3 / Spaces — rasters, GeoTIFF exports |

**Provider Recommendations:**
- Budget: Hetzner Cloud (CPX series)
- Balanced: DigitalOcean (Droplets + Spaces + Managed DB)
- Enterprise: AWS (EC2 + RDS Aurora + S3 + ElastiCache)
- Regional (ID): IDCloudHost, Biznet GIO, Alibaba Cloud Indonesia

**Estimated Cost:** ~$300–600/month

---

### Tier 3 — Enterprise VPS (500–5000 concurrent users)

> Kubernetes-managed, CDN-fronted

| Node | Count | Spec | Services |
|------|-------|------|----------|
| **Master Node (K8s Control Plane)** | 3 nodes — HA quorum | 4 vCPU / 8 GB / 100 GB SSD per node | kube-apiserver, etcd, controller-manager, scheduler, Nginx Ingress, Cert-Manager, Prometheus Operator, Grafana, Loki |
| **Workload Node (K8s Worker)** | 4–8 nodes (HPA auto-scale; CPU > 70% → +1 Pod) | 8 vCPU / 16 GB / 100 GB NVMe per node | FastAPI Deployment, Tegola Deployment, Celery Workers; CDN: Cloudflare Pro / AWS CloudFront |
| **Storage Node — DB (Patroni)** | 3 nodes (1 primary + 2 replicas) | 16 vCPU / 64 GB / 2 TB NVMe per node | PostgreSQL + PostGIS, PgBouncer; Patroni auto-promote RTO < 30 sec, RPO < 1 sec |
| **Storage Node — Cache** | Redis Cluster — 3 nodes | 4 vCPU / 8 GB each | Redis Cluster (shared-nothing) |
| **Object Storage** | — | 10+ TB S3-compatible | AWS S3 / MinIO; Velero backup, 30-day retention |

**Estimated Cost:** ~$1,500–4,000/month

---

## 🖥️ On-Premise Version (HPE)

### Tier 1 — Small Organization (≤100 users)

> All-in-one baremetal server

| Component | Specification |
|-----------|--------------|
| **Server** | 2U Rack — HPE ProLiant DL380 Gen10 Plus |
| **CPU** | 2× Intel Xeon Silver 4314 (16-core/32-thread) = 32 cores |
| **RAM** | 128 GB DDR4 ECC (expandable to 256 GB) |
| **Storage OS** | 2× 480 GB SSD RAID-1 (shared across all nodes) |
| **Storage Data** | 4× 2 TB NVMe SSD RAID-10 ≈ 4 TB usable |
| **Storage Archive** | 4× 8 TB HDD RAID-6 ≈ 16 TB usable |
| **NIC** | 2× 10GbE (bonded, shared) |
| **GPU** | 1× NVIDIA L40S 48 GB *(optional — low-volume ML inference)* |
| **UPS** | APC Smart-UPS 3000VA |
| **OS** | Ubuntu Server 22.04 LTS |
| **Mgmt** | HPE iLO 5 (remote KVM) |

**Per-Node Resource Allocation (all 3 nodes co-located on single server):**

| Node | CPU Cores | RAM | Services |
|------|-----------|-----|----------|
| **Master** | 4 cores | 16 GB | Nginx, Prometheus, Grafana, Loki, etcd |
| **Workload** | 16 cores | 64 GB | FastAPI ×4, Tegola, Celery Worker/Beat; GPU (optional) |
| **Storage** | 12 cores | 48 GB | PostgreSQL + PostGIS, PgBouncer, Redis |

**Estimated Hardware Cost:** ~$8,000–15,000 USD (one-time)

---

### Tier 2 — Mid-Scale Organization (500–1000 users) + 500TB HPE Storage

#### HPE Bill of Materials

| Component | Model | Qty | Capacity / Notes |
|-----------|-------|-----|-----------------|
| **Master / LB Server** | HPE ProLiant DL380 Gen10 Plus | 1 (+1 standby) | 2× Xeon Silver 4310 (12-core) = 24 cores, 64 GB DDR4 ECC, 2× 480 GB SSD RAID-1; Nginx, Prometheus, Grafana, Loki, etcd |
| Application Server | HPE ProLiant DL380 Gen10 Plus | 2 | 2× Xeon Gold 6330 (28-core) = 56 cores, 256 GB DDR4 ECC |
| ML / Analytics Server | HPE ProLiant DL360 Gen10 Plus | 1 | 2× Xeon Gold 6338 (32-core) = 64 cores, 512 GB DDR4 ECC, **2× NVIDIA L40S 48 GB** (yield prediction, NDVI/NDWI batch inference) |
| Database Server | HPE ProLiant DL380 Gen10 Plus | 1 | 2× Xeon Silver 4314 (16-core) = 32 cores, 384 GB DDR4 ECC |
| Primary Storage Array | HPE Nimble Storage AF40 | 2 | 200 TB usable each — all-flash |
| Backup / Archive | HPE StoreOnce 5260 | 1 | 100 TB usable — dedup + compression |
| Core Switch | HPE Aruba 6300M 48G | 2 | Stacked, redundant |
| Storage Fabric Switch | HPE SN2010M (25/100GbE) | 2 | iSCSI / NFS fabric |
| Management Switch | HPE Aruba 1930 24G | 1 | Out-of-band management |
| Rack | HPE 42U G2 Kitted Rack | 2 | Standard deployment |
| UPS | HPE R8000/10KVA | 2 | Redundant power |
| PDU | HPE G2 Metered 3Ph 22kVA | 4 | 2 per rack |

**Total Usable Storage: ~500 TB**

#### Storage Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                HPE ProLiant DL380 x2 (App + API)             │
│                HPE ProLiant DL360 x1 (ML / Yield Prediction) │
└──────────────────────────┬───────────────────────────────────┘
                           │ 25GbE iSCSI / NFS
┌──────────────────────────▼───────────────────────────────────┐
│                  HPE Nimble AF40 (x2) — 400TB Usable         │
│                                                              │
│  Volume 1: 150TB — Production Data                           │
│    Crop yields, climate data, survey results                 │
│                                                              │
│  Volume 2: 150TB — Analytics / ML                            │
│    Historical datasets, prediction models, geospatial data   │
│                                                              │
│  Volume 3: 100TB — Database Volumes                          │
│    PostgreSQL/PostGIS, TimescaleDB, Redis persistence        │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│              HPE StoreOnce 5260 — 100TB Backup               │
│                                                              │
│  Daily incremental  → 30-day retention                       │
│  Weekly full backup → 12-week retention                      │
│  Monthly full       → 12-month retention                     │
│  Expected dedup ratio: 20:1 (repetitive agricultural data)   │
└──────────────────────────────────────────────────────────────┘
```

#### Storage Allocation by Module

| Module / Data Type | Allocation |
|--------------------|-----------|
| Crop Yield Data (raw + history) | 80 TB |
| Climate & Weather Data | 60 TB |
| Geospatial / GIS Rasters (NDVI, NDWI, LBS, LSD) | 70 TB |
| Survey & Field Reports | 40 TB |
| ML Model Training Datasets | 60 TB |
| Prediction Model Artifacts | 30 TB |
| Database Volumes (PostGIS / TimescaleDB) | 50 TB |
| Media / Documents / Reports | 20 TB |
| Backup (StoreOnce 5260) | 100 TB |
| **TOTAL** | **~500 TB** |

#### Network Topology

```
Internet / WAN
      │
   [Firewall]
      │
┌─────┴─────────────────────────────────────────────────────┐
│             HPE Aruba 6300M Core Switch (x2, stacked)     │
│   VLAN 10: DMZ / Public                                   │
│   VLAN 20: Application Tier                               │
│   VLAN 30: Database Tier                                  │
│   VLAN 40: Storage Replication                            │
└────┬──────────────────────────┬────────────────────────────┘
     │                          │
┌────▼─────────┐        ┌───────▼────────────────┐
│  App Servers │        │  HPE SN2010M            │
│  DL380 / 360 │        │  Storage Fabric Switch  │
└────┬─────────┘        └───────┬────────────────┘
     │                          │
     └──────────┬───────────────┘
                │
┌───────────────▼──────────────────────────────────────────┐
│      HPE Nimble AF40 (x2)  +  HPE StoreOnce 5260         │
└──────────────────────────────────────────────────────────┘
```

#### HPE Management Stack

| Tool | Purpose |
|------|---------|
| **HPE InfoSight** | Predictive analytics, AI-driven storage health monitoring |
| **HPE iLO 5** | Server remote management (all ProLiant nodes) |
| **HPE OneView** | Unified infrastructure management across full stack |
| **HPE RMC** | Recovery Manager Central — Nimble + StoreOnce backup orchestration |
| **HPE Aruba Central** | Network monitoring for all Aruba switches |

---

### Tier 3 — Enterprise On-Premise (1000+ users, HA)

#### Master Node — HA Pair

| Spec | Value |
|------|-------|
| **Count** | 2 nodes (active / standby) |
| **Server** | HPE ProLiant DL380 Gen10 Plus |
| **CPU** | 2× Intel Xeon Gold 6330 (28-core) = 56 cores |
| **RAM** | 128 GB DDR4 ECC |
| **Storage** | 4× 480 GB NVMe SSD RAID-10 (OS + etcd WAL) |
| **Services** | HAProxy, Keepalived, etcd, Prometheus Operator, Grafana, Loki |
| **NIC** | 2× 25GbE (LACP) + 1× 1GbE IPMI/BMC |
| **Mgmt** | HPE iLO 5 · HPE OneView · Aruba Central |

> Dual PDU (A+B feed), NEBS L3 ready. RTO < 5 sec via Keepalived VIP.

#### Workload Node — Compute + GPU Cluster

| Sub-role | Count | Server | CPU | RAM | GPU |
|----------|-------|--------|-----|-----|-----|
| **Compute** | 4–6 nodes | HPE ProLiant DL380 Gen10 Plus | 2× Xeon Gold 6354 (18-core) = 36 cores | 128 GB DDR4 ECC | — |
| **GPU Inference** | 2–4 nodes | HPE ProLiant DL380 Gen10 Plus (GPU-configured) | 2× Xeon Gold 6338 (32-core) = 64 cores | 256 GB DDR4 ECC | **4× NVIDIA L40S 48 GB** per node |

All nodes: 2× 25GbE NIC, 1 TB NVMe SSD ephemeral local storage.

#### Storage Node — Patroni HA Cluster

| Component | Count | Spec |
|-----------|-------|------|
| **DB (Patroni)** | 3 nodes (1 primary + 2 replicas) | HPE DL380 Gen10 Plus · 2× Xeon Gold 6354 (18-core) = 36 cores · 1 TB DDR4 ECC · 8× 4 TB NVMe RAID-10 ≈ 16 TB per node |
| **Redis Sentinel** | 3 nodes | 16-core / 64 GB / 500 GB NVMe each |
| **MinIO distributed** | 8 nodes | 16-core / 64 GB / 8× 32 TB HDD each |
| **Backup** | — | Bacula / Velero + HPE StoreOnce 100 TB backup target |

> MinIO erasure coding (EC:4) → survives 4 node failures. Total raw ~2,048 TB → **~1 PB usable**.
> Patroni failover: RTO < 30 sec, RPO < 1 sec. etcd quorum on Master nodes.

**Additional Infrastructure:**
- Power: Dual PDU per rack (A+B feed), N+1 UPS (APC Symmetra), generator backup
- Networking: Dual ToR switches (LACP bonding), separate IPMI/BMC management network
- Security: Hardware firewall (Fortinet / pfSense), IDS/IPS, dedicated bastion host

**Estimated Hardware Cost:** ~$200,000–400,000 USD (one-time)

---

## 🗄️ PostgreSQL/PostGIS Tuning

Tuning for heavy geospatial workloads (NDVI rasters, LSD/LBS shapefiles, yield analysis):

```ini
# postgresql.conf — for 128 GB RAM server

# Memory
shared_buffers          = 32GB     # 25% of RAM
effective_cache_size    = 96GB     # 75% of RAM
work_mem                = 256MB    # per sort/hash operation
maintenance_work_mem    = 4GB      # VACUUM, CREATE INDEX

# Parallelism (PostGIS raster processing)
max_parallel_workers_per_gather = 8
max_parallel_workers            = 16

# WAL (write-heavy import operations)
wal_buffers                  = 64MB
checkpoint_completion_target = 0.9
max_wal_size                 = 8GB

# Connections (use PgBouncer in front)
max_connections = 200
```

---

## 🐳 Docker Resource Limits

```yaml
# docker-compose.prod.yml

services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
      replicas: 2

  tegola:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
      replicas: 2

  postgres:
    deploy:
      resources:
        limits:
          cpus: '8'
          memory: 32G

  redis:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G
```

---

## 📊 Decision Matrix

| Factor | VPS T1 | VPS T2 | VPS T3 | On-Prem T1 | On-Prem T2 | On-Prem T3 |
|--------|--------|--------|--------|-----------|-----------|-----------|
| **Max Users** | 50 | 500 | 5,000 | 100 | 1,000 | 1,000+ |
| **Upfront Cost** | Low | Medium | High | Medium | High | Very High |
| **Monthly OpEx** | $40–80 | $300–600 | $1.5K–4K | ~$500 | ~$2K | ~$10K+ |
| **Setup Time** | Hours | Days | Weeks | Weeks | Months | Months |
| **Scalability** | ★★★ | ★★★★ | ★★★★★ | ★★ | ★★★ | ★★★★ |
| **Data Sovereignty** | ✗ | Partial | Partial | ✅ | ✅ | ✅ |
| **HA / Redundancy** | ✗ | ★★★ | ★★★★★ | ★★ | ★★★★ | ★★★★★ |
| **Best For** | MVP / Pilot | Gov. pilot | National | Sensitive data | Provincial agency | National agency |

---

## ✅ Recommendation

> **For a government food security application in Indonesia:**

1. **Start with** VPS Tier 2 on **IDCloudHost** or **Biznet GIO** (data residency compliance) — ~$400/month
2. **Migrate to** On-Premise Tier 2 (HPE) when budget allows and data sovereignty is required (BPS, BPBD, Kementan integration) — 500TB HPE Nimble AF40 build
3. **Long-term** Hybrid — hot data on-prem, cold raster archive on S3-compatible object store (MinIO)

---

*Generated for: Food Security Dashboard · mualshaadiq/foodsecurity-dashboard*
