# Deployment Guide

## Docker Deployment

### Build the image

```bash
docker build -t mcp-gateway:latest .
```

### Run with Docker

```bash
docker run -d \
  -p 8080:8080 \
  -e REDIS_HOST=redis.example.com \
  -e REDIS_PASSWORD=secret \
  -v ./gateway.yaml:/app/gateway.yaml \
  -v ./tenants:/app/tenants \
  mcp-gateway:latest
```

### Docker Compose

```bash
docker compose up -d
```

This starts:
- mcp-gateway on port 8080
- Redis on port 6379
- Jaeger for tracing on port 16686

## GCP Cloud Run

### Prerequisites

1. GCP project with Cloud Run API enabled
2. Artifact Registry configured
3. Redis instance (Memorystore or Cloud Redis)

### Deploy

```bash
# Build and push
gcloud builds submit --tag gcr.io/PROJECT_ID/mcp-gateway:latest

# Deploy to Cloud Run
gcloud run deploy mcp-gateway \
  --image gcr.io/PROJECT_ID/mcp-gateway:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars REDIS_HOST=redis-host,REDIS_PORT=6379 \
  --set-secrets REDIS_PASSWORD=redis-secret:latest \
  --memory 1Gi \
  --cpu 1
```

## Kubernetes Deployment

### Create deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-gateway
  template:
    metadata:
      labels:
        app: mcp-gateway
    spec:
      containers:
      - name: gateway
        image: mcp-gateway:latest
        ports:
        - containerPort: 8080
        env:
        - name: REDIS_HOST
          value: "redis-service"
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: password
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 3
```

### Apply

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | no | `8080` | HTTP listen port |
| `NODE_ENV` | no | `production` | Environment |
| `REDIS_HOST` | yes | — | Redis host |
| `REDIS_PORT` | no | `6379` | Redis port |
| `REDIS_PASSWORD` | no | — | Redis password |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTel endpoint |
| `LOG_LEVEL` | no | `info` | Log level |
| `TENANT_CONFIG_DIR` | no | `./tenants` | Tenant config dir |
| `GATEWAY_CONFIG_PATH` | no | `./gateway.yaml` | Gateway config |

## Health Checks

| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness probe |
| `/health/deep` | Readiness probe with upstream health |

## TLS Configuration

For production, enable TLS:

```yaml
# gateway.yaml
server:
  tls:
    enabled: true
    cert_path: "/etc/ssl/certs/gateway.crt"
    key_path: "/etc/ssl/private/gateway.key"
```

Mount certificates as secrets in your deployment.

## References

- [docs/CONFIGURATION.md](CONFIGURATION.md) — Configuration reference
- [docs/SECURITY.md](SECURITY.md) — Security guide

## Kubernetes Helm Chart

For teams preferring Helm over raw manifests:

```yaml
# values.yaml
replicaCount: 3

image:
  repository: ghcr.io/anomalyco/mcp-gateway
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: mcp-gateway.example.com
      paths:
        - path: /
  tls:
    - secretName: mcp-gateway-tls
      hosts:
        - mcp-gateway.example.com

env:
  REDIS_HOST: "redis-master"
  REDIS_PORT: "6379"
  LOG_LEVEL: "info"

secrets:
  REDIS_PASSWORD:
    secretName: redis-credentials
    key: password

resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "1Gi"
    cpu: "500m"

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5

readinessProbe:
  httpGet:
    path: /health/deep
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 3

tenants:
  - tenantId: "example-tenant"
    displayName: "Example Tenant"
    rateLimits:
      requestsPerMinute: 1000
      requestsPerDay: 100000
    allowlist:
      mode: "allow"
      tools: ["*"]
    cache:
      enabled: true
      ttlSeconds: 300
    upstreams:
      - name: "primary"
        url: "https://mcp-server.example.com"
        weight: 1.0
```

```bash
# Install via Helm
helm install mcp-gateway ./charts/mcp-gateway -f values.yaml

# Upgrade
helm upgrade mcp-gateway ./charts/mcp-gateway -f values.yaml
```
