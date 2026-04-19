terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
  backend "gcs" {
    bucket = "mcp-gateway-tfstate-prod"
    prefix = "terraform/state"
  }
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "domain" {
  description = "Public hostname served by the load balancer (used for managed SSL)."
  type        = string
}

variable "redis_password" {
  description = "Redis AUTH password. Leave null to auto-generate and store only in Secret Manager."
  type        = string
  default     = null
  sensitive   = true
}

variable "alert_notification_channels" {
  description = "Monitoring notification channel IDs for alert routing."
  type        = list(string)
  default     = []
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Redis instance for prod (HA)
resource "google_redis_instance" "cache" {
  name           = "mcp-gateway-redis-prod"
  tier           = "STANDARD_HA"
  memory_size_gb = 4
  region         = var.region

  redis_version = "REDIS_7_0"

  authorized_network = "default"
  auth_enabled       = true

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 2
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }
}

# Generated Redis password (only used when var.redis_password is null)
resource "random_password" "redis" {
  length           = 48
  special          = true
  override_special = "-_"
}

# Secret for Redis password
resource "google_secret_manager_secret" "redis_password" {
  secret_id = "mcp-gateway-redis-password-prod"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "redis_password" {
  secret      = google_secret_manager_secret.redis_password.id
  secret_data = coalesce(var.redis_password, random_password.redis.result)
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_secret_manager_secret_iam_member" "redis_password_access" {
  secret_id = google_secret_manager_secret.redis_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

# IAM bindings for Cloud Run (public prod; gate with LB if needed)
resource "google_project_iam_member" "run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "allUsers"
}

module "cloud_run" {
  source = "../../modules/cloud-run"

  project_id            = var.project_id
  region                = var.region
  service_name          = "mcp-gateway-prod"
  image                 = "gcr.io/${var.project_id}/mcp-gateway:latest"
  min_instances         = 2
  max_instances         = 20
  memory                = "1Gi"
  cpu                   = "1"
  redis_host            = google_redis_instance.cache.host
  redis_password_secret = google_secret_manager_secret.redis_password.secret_id
}

# Cloud Load Balancer (global, HTTPS with managed cert + HTTP->HTTPS redirect)
resource "google_compute_region_network_endpoint_group" "neg" {
  name                  = "mcp-gateway-neg-prod"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = module.cloud_run.service_name
  }
}

resource "google_compute_backend_service" "backend" {
  name                  = "mcp-gateway-backend-prod"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  timeout_sec           = 30

  backend {
    group = google_compute_region_network_endpoint_group.neg.id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

resource "google_compute_url_map" "default" {
  name            = "mcp-gateway-urlmap-prod"
  default_service = google_compute_backend_service.backend.id
}

# Redirect all HTTP traffic to HTTPS
resource "google_compute_url_map" "redirect" {
  name = "mcp-gateway-urlmap-redirect-prod"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_managed_ssl_certificate" "default" {
  name = "mcp-gateway-cert-prod"

  managed {
    domains = [var.domain]
  }
}

resource "google_compute_target_https_proxy" "default" {
  name             = "mcp-gateway-https-proxy-prod"
  url_map          = google_compute_url_map.default.id
  ssl_certificates = [google_compute_managed_ssl_certificate.default.id]
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "mcp-gateway-http-proxy-prod"
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_address" "default" {
  name = "mcp-gateway-ip-prod"
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "mcp-gateway-fwd-https-prod"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  ip_protocol           = "TCP"
  ip_address            = google_compute_global_address.default.address
  target                = google_compute_target_https_proxy.default.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "mcp-gateway-fwd-http-prod"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "80"
  ip_protocol           = "TCP"
  ip_address            = google_compute_global_address.default.address
  target                = google_compute_target_http_proxy.redirect.id
}

# Cloud Armor WAF (baseline managed rules)
resource "google_compute_security_policy" "default" {
  name = "mcp-gateway-armor-prod"

  rule {
    action   = "allow"
    priority = 2147483647
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "default allow"
  }

  rule {
    action   = "deny(403)"
    priority = 1000
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
    description = "Block XSS attempts"
  }

  rule {
    action   = "deny(403)"
    priority = 1001
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
    description = "Block SQLi attempts"
  }
}

# Monitoring: alert policies
resource "google_monitoring_alert_policy" "error_rate" {
  display_name = "mcp-gateway-prod / 5xx error rate"
  combiner     = "OR"

  conditions {
    display_name = "5xx responses > 10/min"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"mcp-gateway-prod\" metric.label.\"response_code_class\"=\"5xx\""
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = var.alert_notification_channels
  alert_strategy {
    auto_close = "3600s"
  }
}

resource "google_monitoring_alert_policy" "p99_latency" {
  display_name = "mcp-gateway-prod / p99 latency"
  combiner     = "OR"

  conditions {
    display_name = "p99 latency > 2s"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"mcp-gateway-prod\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }

  notification_channels = var.alert_notification_channels
  alert_strategy {
    auto_close = "3600s"
  }
}

resource "google_monitoring_alert_policy" "instance_saturation" {
  display_name = "mcp-gateway-prod / instance saturation"
  combiner     = "OR"

  conditions {
    display_name = "Active instances > 80% of max"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/container/instance_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"mcp-gateway-prod\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 16
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  notification_channels = var.alert_notification_channels
}

resource "google_monitoring_alert_policy" "redis_memory" {
  display_name = "mcp-gateway-prod / Redis memory usage"
  combiner     = "OR"

  conditions {
    display_name = "Redis memory > 85%"
    condition_threshold {
      filter          = "metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\" resource.type=\"redis_instance\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = var.alert_notification_channels
}

# Monitoring dashboard
resource "google_monitoring_dashboard" "gateway" {
  dashboard_json = jsonencode({
    displayName = "mcp-gateway (prod)"
    gridLayout = {
      columns = 2
      widgets = [
        {
          title = "Request rate by response class"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter             = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"mcp-gateway-prod\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_RATE"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["metric.label.response_code_class"]
                  }
                }
              }
            }]
          }
        },
        {
          title = "Request latency (p50/p95/p99)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"mcp-gateway-prod\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_PERCENTILE_99"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Instance count"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"run.googleapis.com/container/instance_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"mcp-gateway-prod\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_MAX"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Redis memory usage ratio"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\" resource.type=\"redis_instance\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        },
      ]
    }
  })
}

output "gateway_url" {
  value = module.cloud_run.service_url
}

output "load_balancer_ip" {
  value = google_compute_global_address.default.address
}

output "redis_host" {
  value = google_redis_instance.cache.host
}

output "redis_password_secret" {
  value     = google_secret_manager_secret.redis_password.secret_id
  sensitive = true
}
