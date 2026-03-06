/**
 * generate_node_tables.js
 * Generates 6 PNG images — one per tier — each containing hardware specs
 * for all 3 node types (Master · Workload · Storage) in that tier.
 *
 * Output: docs/node-tables/
 *   vps-tier1.png  vps-tier2.png  vps-tier3.png
 *   onprem-tier1.png  onprem-tier2.png  onprem-tier3.png
 *
 * Usage: node scripts/generate_node_tables.js
 */

const puppeteer = require('C:\\Users\\Lenovo\\AppData\\Roaming\\npm\\node_modules\\md-to-pdf\\node_modules\\puppeteer');
const path = require('path');
const fs   = require('fs');

const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'node-tables');

const C = {
  navy:        '#1B3A5C',
  navyDark:    '#132942',
  green:       '#1E6B3C',
  amber:       '#92600A',
  white:       '#FFFFFF',
  rowAlt:      '#F0F4F8',
  border:      '#CBD5E0',
  text:        '#1A202C',
  muted:       '#4A5568',
  masterHead:  '#1B3A5C',
  workHead:    '#1E6B3C',
  storeHead:   '#92600A',
  tagMaster:   '#1B3A5C',
  tagWork:     '#1E6B3C',
  tagStore:    '#B7791F',
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function specRow(label, value) {
  return `
    <tr>
      <td style="padding:8px 14px;font-size:12px;font-weight:600;color:${C.muted};
                 border-bottom:1px solid ${C.border};white-space:nowrap;width:38%">
        ${label}
      </td>
      <td style="padding:8px 14px;font-size:12px;color:${C.text};
                 border-bottom:1px solid ${C.border}">
        ${value}
      </td>
    </tr>`;
}

function nodeCard(tagLabel, tagColor, headerColor, title, subtitle, specRows, footerLines, count) {
  const countBadge = count
    ? `<span style="margin-left:8px;background:rgba(255,255,255,0.18);color:#fff;
                    font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">
         ${count}
       </span>`
    : '';

  const footer = footerLines && footerLines.length
    ? `<div style="padding:9px 14px 11px;background:#F7FAFC;border-top:1px solid ${C.border}">
         ${footerLines.map(l =>
           `<div style="font-size:10.5px;color:${C.muted};margin-bottom:2px">${l}</div>`
         ).join('')}
       </div>`
    : '';

  return `
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;
                background:#fff;border-radius:10px;overflow:hidden;
                box-shadow:0 2px 12px rgba(27,58,92,0.11)">
      <!-- header -->
      <div style="background:${headerColor};padding:14px 16px 11px">
        <div style="display:flex;align-items:center;margin-bottom:6px">
          <span style="background:rgba(255,255,255,0.20);color:#fff;font-size:10px;
                       font-weight:700;padding:2px 9px;border-radius:10px;letter-spacing:.4px">
            ${tagLabel}
          </span>
          ${countBadge}
        </div>
        <div style="color:#fff;font-size:14px;font-weight:700;margin-bottom:3px">${title}</div>
        <div style="color:rgba(255,255,255,.72);font-size:10.5px;line-height:1.4">${subtitle}</div>
      </div>
      <!-- spec table -->
      <table style="width:100%;border-collapse:collapse;flex:1">
        <tbody>${specRows}</tbody>
      </table>
      ${footer}
    </div>`;
}

function page(tierLabel, tierColor, vpsOrOnprem, masterCard, workCard, storeCard) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing:border-box; margin:0; padding:0 }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #EDF2F7;
    padding: 24px;
    width: fit-content;
  }
  .wrap { min-width: 920px; }
  .tier-header {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 16px;
  }
  .tier-badge {
    background: ${tierColor};
    color: #fff;
    font-size: 11px; font-weight: 700;
    padding: 3px 12px; border-radius: 12px; letter-spacing: .5px;
  }
  .tier-title {
    font-size: 18px; font-weight: 700; color: ${C.navyDark};
  }
  .tier-sub {
    font-size: 12px; color: ${C.muted}; margin-left: 4px;
  }
  .grid {
    display: flex; gap: 14px; align-items: stretch;
  }
  .branding {
    margin-top: 12px; font-size: 10px; color: #A0AEC0;
    text-align: right; letter-spacing: .3px;
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="tier-header">
    <span class="tier-badge">${vpsOrOnprem}</span>
    <span class="tier-title">${tierLabel}</span>
    <span class="tier-sub">— Hardware Specification per Node</span>
  </div>
  <div class="grid">
    ${masterCard}
    ${workCard}
    ${storeCard}
  </div>
  <div class="branding">Food Security Dashboard · Hardware Spec v1.0 · March 2026</div>
</div>
</body>
</html>`;
}

/* ── Tier definitions ──────────────────────────────────────────────────────── */

const TIERS = [

  /* ── VPS TIER 1 ─────────────────────────────────────────────────────────── */
  {
    filename: 'vps-tier1.png',
    tierLabel: 'VPS Tier 1 — Development / Pilot',
    tierColor:  C.navy,
    badge: 'VPS · ≤ 50 USERS',
    master: nodeCard(
      '① MASTER NODE', C.tagMaster, C.masterHead,
      'Master Node',
      'All services co-located on a single VPS. Master slice.',
      [
        specRow('Platform',  'Single VPS (all-in-one)'),
        specRow('Provider',  'Hetzner CX41 / DigitalOcean / Vultr'),
        specRow('vCPU',      '0.5 vCPU (reserved share)'),
        specRow('RAM',       '512 MB'),
        specRow('Storage',   'Shared — 200 GB NVMe SSD (total)'),
        specRow('Services',  'Nginx, Prometheus, Grafana, Loki'),
        specRow('OS',        'Ubuntu 22.04 LTS'),
        specRow('Network',   '1 Gbps uplink, unmetered'),
      ].join(''),
      ['⚠ All nodes are merged into one VPS at this tier.'],
    ),
    workload: nodeCard(
      '② WORKLOAD NODE', C.tagWork, C.workHead,
      'Workload Node',
      'API + tile compute — co-located on the same VPS.',
      [
        specRow('Platform',  'Single VPS (shared)'),
        specRow('vCPU',      '3 vCPU (FastAPI ×2 + Tegola)'),
        specRow('RAM',       '6 GB'),
        specRow('Storage',   'Shared NVMe (no dedicated volume)'),
        specRow('GPU',       'None (no ML inference at Tier 1)'),
        specRow('Services',  'FastAPI ×2, Tegola, Celery Worker'),
        specRow('Scale',     'Vertical only (resize VPS)'),
      ].join(''),
      ['No horizontal scaling at Tier 1 — upgrade VPS size to scale.'],
    ),
    storage: nodeCard(
      '③ STORAGE NODE', C.tagStore, C.storeHead,
      'Storage Node',
      'Database + cache — co-located on the same VPS.',
      [
        specRow('Platform',  'Single VPS (shared)'),
        specRow('vCPU',      '3 vCPU'),
        specRow('RAM',       '8 GB'),
        specRow('Storage',   '200 GB NVMe SSD (shared, OS + data)'),
        specRow('DB Backup', 'Weekly provider snapshot'),
        specRow('Services',  'PostgreSQL + PostGIS, Redis'),
        specRow('Replica',   'None at Tier 1'),
        specRow('Object St.',  'Local file system (no MinIO)'),
      ].join(''),
      ['Upgrade to Tier 2 when DB > 100 GB or query latency > 1 s.'],
    ),
  },

  /* ── VPS TIER 2 ─────────────────────────────────────────────────────────── */
  {
    filename: 'vps-tier2.png',
    tierLabel: 'VPS Tier 2 — Production',
    tierColor:  '#2A5298',
    badge: 'VPS · ≤ 500 USERS',
    master: nodeCard(
      '① MASTER NODE', C.tagMaster, C.masterHead,
      'Master Node',
      'Dedicated LB + monitoring node. 1 active + 1 standby.',
      [
        specRow('Count',     '1 active + 1 standby (Keepalived VIP)'),
        specRow('vCPU',      '2 vCPU'),
        specRow('RAM',       '2 GB'),
        specRow('Storage',   '40 GB SSD'),
        specRow('Services',  'Nginx, Certbot, Prometheus, Grafana, Loki, AlertManager'),
        specRow('OS',        'Ubuntu 22.04 LTS'),
        specRow('Network',   '1 Gbps uplink'),
      ].join(''),
      ['Failover via Keepalived floating IP (< 5 sec RTO).'],
    ),
    workload: nodeCard(
      '② WORKLOAD NODE', C.tagWork, C.workHead,
      'Workload Node',
      'Stateless API + tile compute. Horizontally scalable.',
      [
        specRow('Count',     '2–4 nodes (auto-scale)'),
        specRow('vCPU',      '4 vCPU per node'),
        specRow('RAM',       '8 GB per node'),
        specRow('Storage',   '80 GB NVMe SSD (OS + app)'),
        specRow('GPU',       'None (CPU inference only)'),
        specRow('Services',  'FastAPI ×4 workers, Tegola, Celery'),
        specRow('Scale rule','CPU > 70% sustained → +1 node (max 4)'),
      ].join(''),
      ['Round-robin via Nginx upstream with active health checks.'],
    ),
    storage: nodeCard(
      '③ STORAGE NODE', C.tagStore, C.storeHead,
      'Storage Node',
      'Primary DB + read replica + cache. Managed or self-hosted.',
      [
        specRow('Primary',   '8 vCPU / 32 GB RAM / 500 GB NVMe'),
        specRow('Replica',   '8 vCPU / 16 GB RAM / 500 GB NVMe (read-only)'),
        specRow('Cache',     '2 vCPU / 4 GB RAM (Redis)'),
        specRow('Object St.','2 TB managed bucket (S3 / Spaces)'),
        specRow('Services',  'PostgreSQL + PostGIS, PgBouncer, Redis, MinIO'),
        specRow('Replication','Streaming (async), lag < 500 ms'),
        specRow('Backup',    'Daily snapshot, 7-day retention'),
      ].join(''),
      ['Use managed DB (DigitalOcean / RDS) to simplify HA at this tier.'],
    ),
  },

  /* ── VPS TIER 3 ─────────────────────────────────────────────────────────── */
  {
    filename: 'vps-tier3.png',
    tierLabel: 'VPS Tier 3 — Enterprise (Kubernetes)',
    tierColor:  '#1A365D',
    badge: 'VPS · ≤ 5 000 USERS',
    master: nodeCard(
      '① MASTER NODE', C.tagMaster, C.masterHead,
      'Master Node (K8s Control Plane)',
      '3-node etcd quorum. Manages workload scheduling via Kubernetes.',
      [
        specRow('Count',     '3 nodes (HA quorum)'),
        specRow('vCPU',      '4 vCPU per node'),
        specRow('RAM',       '8 GB per node'),
        specRow('Storage',   '100 GB SSD per node'),
        specRow('Services',  'kube-apiserver, etcd, controller-manager, scheduler'),
        specRow('Monitoring','Prometheus Operator, Grafana, Loki stack'),
        specRow('Ingress',   'Nginx Ingress Controller + Cert-Manager'),
      ].join(''),
      ['Managed K8s (EKS / GKE / DOKS) recommended — offloads control plane ops.'],
    ),
    workload: nodeCard(
      '② WORKLOAD NODE', C.tagWork, C.workHead,
      'Workload Node (K8s Worker)',
      'HPA-managed Pods. Scales to demand automatically.',
      [
        specRow('Count',     '4–8 nodes (HPA auto-scale)'),
        specRow('vCPU',      '8 vCPU per node'),
        specRow('RAM',       '16 GB per node'),
        specRow('Storage',   '100 GB NVMe SSD (ephemeral)'),
        specRow('GPU',       'None (offload ML to dedicated GPU node if needed)'),
        specRow('Services',  'FastAPI Deployment, Tegola Deployment, Celery Workers'),
        specRow('CDN',       'Cloudflare Pro / AWS CloudFront (tile & static cache)'),
      ].join(''),
      ['HPA triggers: CPU > 70% or request queue > 500 → +1 Pod up to max replicas.'],
    ),
    storage: nodeCard(
      '③ STORAGE NODE', C.tagStore, C.storeHead,
      'Storage Node (Patroni Cluster)',
      '3-node PostgreSQL HA cluster + Redis Cluster + S3 object store.',
      [
        specRow('DB Count',  '3 nodes (1 primary + 2 replicas, Patroni)'),
        specRow('DB Spec',   '16 vCPU / 64 GB RAM / 2 TB NVMe per node'),
        specRow('Redis',     '3 nodes (Redis Cluster), 4 vCPU / 8 GB each'),
        specRow('Object St.','10+ TB S3-compatible (AWS S3 / MinIO)'),
        specRow('Services',  'PostgreSQL + PostGIS, PgBouncer, Redis Cluster, MinIO'),
        specRow('Failover',  'Patroni auto-promote (RTO < 30 sec, RPO < 1 sec)'),
        specRow('Backup',    'Velero (K8s-native), daily, 30-day retention'),
      ].join(''),
      ['Use Aurora PostgreSQL or Cloud SQL for fully managed HA at this scale.'],
    ),
  },

  /* ── ON-PREM TIER 1 ──────────────────────────────────────────────────────── */
  {
    filename: 'onprem-tier1.png',
    tierLabel: 'On-Premise Tier 1 — Small Organization',
    tierColor:  '#276749',
    badge: 'ON-PREM · ≤ 100 USERS',
    master: nodeCard(
      '① MASTER NODE', C.tagMaster, C.masterHead,
      'Master Node',
      'All-in-one baremetal. Master services share the single server.',
      [
        specRow('Server',    'HPE ProLiant DL380 Gen10 Plus (2U)'),
        specRow('CPU share', '4 cores / 8 threads (of 32 total)'),
        specRow('RAM share', '16 GB ECC DDR4 (of 128 GB total)'),
        specRow('Storage',   'OS: 2× 480 GB SSD RAID-1 (shared)'),
        specRow('Services',  'Nginx, Prometheus, Grafana, Loki, etcd'),
        specRow('Mgmt',      'HPE iLO 5 (remote KVM)'),
        specRow('OS',        'Ubuntu Server 22.04 LTS'),
        specRow('UPS',       'APC Smart-UPS 3000VA'),
      ].join(''),
      ['Single physical server — all 3 nodes co-located. No HA at Tier 1.'],
    ),
    workload: nodeCard(
      '② WORKLOAD NODE', C.tagWork, C.workHead,
      'Workload Node',
      'Co-located compute slice on the same baremetal server.',
      [
        specRow('Server',    'HPE ProLiant DL380 Gen10 Plus (shared)'),
        specRow('CPU',       '2× Intel Xeon Silver 4314 (16-core × 2 = 32 cores total)'),
        specRow('CPU share', '16 cores (FastAPI ×4, Tegola, Celery)'),
        specRow('RAM share', '64 GB ECC DDR4'),
        specRow('GPU',       '1× NVIDIA L40S 48 GB *(optional)*'),
        specRow('Services',  'FastAPI, Tegola, Celery Worker/Beat'),
        specRow('NIC',       '2× 10GbE bonded (shared)'),
        specRow('Scale',     'Vertical only (add RAM / GPU)'),
      ].join(''),
      ['GPU optional for low-volume yield prediction. Add L40S if needed.'],
    ),
    storage: nodeCard(
      '③ STORAGE NODE', C.tagStore, C.storeHead,
      'Storage Node',
      'Co-located data slice on the same baremetal server.',
      [
        specRow('Server',    'HPE ProLiant DL380 Gen10 Plus (shared)'),
        specRow('CPU share', '12 cores (PostgreSQL + Redis)'),
        specRow('RAM share', '48 GB ECC DDR4'),
        specRow('Data SSD',  '4× 2 TB NVMe RAID-10 ≈ 4 TB usable'),
        specRow('Archive HDD','4× 8 TB HDD RAID-6 ≈ 16 TB usable'),
        specRow('Services',  'PostgreSQL + PostGIS, PgBouncer, Redis'),
        specRow('Object St.','Local filesystem (no MinIO at T1)'),
        specRow('Backup',    'HPE StoreOnce — weekly full, daily incremental'),
      ].join(''),
      ['Upgrade to Tier 2 when data volume > 10 TB or users > 100.'],
    ),
  },

  /* ── ON-PREM TIER 2 ──────────────────────────────────────────────────────── */
  {
    filename: 'onprem-tier2.png',
    tierLabel: 'On-Premise Tier 2 — Mid-Scale (HPE 500 TB)',
    tierColor:  '#744210',
    badge: 'ON-PREM · ≤ 1 000 USERS',
    master: nodeCard(
      '① MASTER NODE', C.tagMaster, C.masterHead,
      'Master Node',
      'Dedicated HPE server for LB, monitoring and cluster orchestration.',
      [
        specRow('Server',    'HPE ProLiant DL380 Gen10 Plus (1U)'),
        specRow('CPU',       '2× Intel Xeon Silver 4310 (12-core) = 24 cores'),
        specRow('RAM',       '64 GB DDR4 ECC'),
        specRow('Storage',   '2× 480 GB SSD RAID-1 (OS + configs)'),
        specRow('Services',  'Nginx, Prometheus, Grafana, Loki, AlertManager, etcd'),
        specRow('NIC',       '2× 10GbE (bonded, LACP)'),
        specRow('Mgmt',      'HPE iLO 5 · HPE OneView'),
        specRow('HA',        '1 active + 1 standby via Keepalived VIP'),
      ].join(''),
      ['Failover: Keepalived floating IP, RTO < 5 sec.'],
    ),
    workload: nodeCard(
      '② WORKLOAD NODE', C.tagWork, C.workHead,
      'Workload Node',
      'HPE compute nodes for API, tile generation and ML inference.',
      [
        specRow('Count',     '2 app nodes + 1 dedicated ML node'),
        specRow('App Server','HPE ProLiant DL380 Gen10 Plus — ×2'),
        specRow('App CPU',   '2× Intel Xeon Gold 6330 (28-core) = 56 cores'),
        specRow('App RAM',   '256 GB DDR4 ECC per node'),
        specRow('ML Server', 'HPE ProLiant DL360 Gen10 Plus — ×1'),
        specRow('ML CPU',    '2× Intel Xeon Gold 6338 (32-core) = 64 cores'),
        specRow('ML RAM',    '512 GB DDR4 ECC'),
        specRow('GPU',       '2× NVIDIA L40S 48 GB on ML node'),
      ].join(''),
      ['L40S backordered — plan 4–12 week lead time.'],
    ),
    storage: nodeCard(
      '③ STORAGE NODE', C.tagStore, C.storeHead,
      'Storage Node',
      'HPE dedicated database server + HPE Nimble AF40 500 TB array.',
      [
        specRow('DB Server', 'HPE ProLiant DL380 Gen10 Plus'),
        specRow('DB CPU',    '2× Intel Xeon Silver 4314 (16-core) = 32 cores'),
        specRow('DB RAM',    '384 GB DDR4 ECC'),
        specRow('Primary Array','HPE Nimble AF40 × 2 — 200 TB usable each (all-flash)'),
        specRow('Backup',    'HPE StoreOnce 5260 — 100 TB (dedup 20:1)'),
        specRow('Protocol',  '25GbE iSCSI / NFS fabric (HPE SN2010M switch)'),
        specRow('Services',  'PostgreSQL + PostGIS, PgBouncer, Redis, MinIO'),
        specRow('Mgmt',      'HPE InfoSight · HPE RMC'),
      ].join(''),
      ['Total usable: ~500 TB (400 TB Nimble + 100 TB StoreOnce backup).'],
    ),
  },

  /* ── ON-PREM TIER 3 ──────────────────────────────────────────────────────── */
  {
    filename: 'onprem-tier3.png',
    tierLabel: 'On-Premise Tier 3 — Enterprise HA',
    tierColor:  '#63171B',
    badge: 'ON-PREM · 1 000+ USERS',
    master: nodeCard(
      '① MASTER NODE', C.tagMaster, C.masterHead,
      'Master Node (HA Pair)',
      '2-node active/standby pair. Manages full cluster via Kubernetes or Patroni.',
      [
        specRow('Count',     '2 nodes (active / standby)'),
        specRow('Server',    'HPE ProLiant DL380 Gen10 Plus'),
        specRow('CPU',       '2× Intel Xeon Gold 6330 (28-core) = 56 cores'),
        specRow('RAM',       '128 GB DDR4 ECC'),
        specRow('Storage',   '4× 480 GB NVMe SSD RAID-10 (OS + etcd WAL)'),
        specRow('Services',  'HAProxy, Keepalived, etcd, Prometheus Operator, Grafana, Loki'),
        specRow('NIC',       '2× 25GbE (LACP) + 1× 1GbE IPMI/BMC'),
        specRow('Mgmt',      'HPE iLO 5 · HPE OneView · Aruba Central'),
      ].join(''),
      ['Dual PDU (A+B feed), NEBS L3 ready. RTO < 5 sec via Keepalived VIP.'],
    ),
    workload: nodeCard(
      '② WORKLOAD NODE', C.tagWork, C.workHead,
      'Workload Node (Compute + GPU Cluster)',
      '4–6 general compute + 2–4 dedicated GPU inference nodes.',
      [
        specRow('Compute count',  '4–6 nodes'),
        specRow('Compute server', 'HPE ProLiant DL380 Gen10 Plus'),
        specRow('Compute CPU',    '2× Intel Xeon Gold 6354 (18-core) = 36 cores'),
        specRow('Compute RAM',    '128 GB DDR4 ECC per node'),
        specRow('GPU node count', '2–4 nodes'),
        specRow('GPU server',     'HPE ProLiant DL380 Gen10 Plus (GPU-configured)'),
        specRow('GPU CPU',        '2× Intel Xeon Gold 6338 (32-core) = 64 cores'),
        specRow('GPU RAM',        '256 GB DDR4 ECC · 4× NVIDIA L40S 48 GB per node'),
      ].join(''),
      [
        'GPU: 4× L40S 48 GB per GPU node × 2–4 GPU nodes.',
        'All nodes: 2× 25GbE NIC, 1 TB NVMe SSD ephemeral local storage.',
      ],
    ),
    storage: nodeCard(
      '③ STORAGE NODE', C.tagStore, C.storeHead,
      'Storage Node (Patroni HA Cluster)',
      '3-node PostgreSQL Patroni cluster + Redis Sentinel + MinIO distributed.',
      [
        specRow('DB count',   '3 nodes (1 primary + 2 replicas)'),
        specRow('DB server',  'HPE ProLiant DL380 Gen10 Plus'),
        specRow('DB CPU',     '2× Intel Xeon Gold 6354 (18-core) = 36 cores'),
        specRow('DB RAM',     '1 TB DDR4 ECC per node'),
        specRow('DB Storage', '8× 4 TB NVMe SSD RAID-10 ≈ 16 TB usable per node'),
        specRow('Redis',      '3× Redis Sentinel — 16-core / 64 GB / 500 GB NVMe each'),
        specRow('MinIO',      '8× distributed nodes — 16-core / 64 GB / 8× 32 TB HDD each'),
        specRow('Backup',     'Bacula / Velero + HPE StoreOnce (100 TB backup target)'),
      ].join(''),
      [
        'Patroni failover: RTO < 30 sec, RPO < 1 sec. etcd quorum on Master nodes.',
        'MinIO erasure coding (EC:4) → survives 4 node failures. Total raw ~2,048 TB → ~1 PB usable.',
      ],
    ),
  },
];

/* ── Render ────────────────────────────────────────────────────────────────── */

(async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const tier of TIERS) {
    const isVPS = tier.filename.startsWith('vps');
    const html = page(
      tier.tierLabel,
      tier.tierColor,
      tier.badge,
      tier.master,
      tier.workload,
      tier.storage,
    );

    const pg = await browser.newPage();
    await pg.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    await pg.setContent(html, { waitUntil: 'networkidle0' });

    const body = await pg.$('body');
    const outPath = path.join(OUTPUT_DIR, tier.filename);
    await body.screenshot({ path: outPath, omitBackground: false });
    await pg.close();

    console.log(`  ✓  ${tier.filename}`);
  }

  await browser.close();
  console.log(`\nAll 6 PNGs saved to: ${OUTPUT_DIR}`);
})();
