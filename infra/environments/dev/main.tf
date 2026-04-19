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
    bucket = "mcp-gateway-tfstate-dev"
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

variable "redis_password" {
  description = "Redis AUTH password. Leave null to auto-generate and store only in Secret Manager."
  type        = string
  default     = null
  sensitive   = true
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Redis instance for dev
resource "google_redis_instance" "cache" {
  name           = "mcp-gateway-redis-dev"
  tier           = "BASIC"
  memory_size_gb = 1
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
  length           = 32
  special          = true
  override_special = "-_"
}

# Secret for Redis password
resource "google_secret_manager_secret" "redis_password" {
  secret_id = "mcp-gateway-redis-password-dev"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "redis_password" {
  secret      = google_secret_manager_secret.redis_password.id
  secret_data = coalesce(var.redis_password, random_password.redis.result)
}

# Grant Cloud Run runtime SA access to the Redis secret
data "google_project" "current" {
  project_id = var.project_id
}

resource "google_secret_manager_secret_iam_member" "redis_password_access" {
  secret_id = google_secret_manager_secret.redis_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

# IAM bindings for Cloud Run (public in dev only)
resource "google_project_iam_member" "run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "allUsers"
}

module "cloud_run" {
  source = "../../modules/cloud-run"

  project_id            = var.project_id
  region                = var.region
  service_name          = "mcp-gateway-dev"
  image                 = "gcr.io/${var.project_id}/mcp-gateway:dev"
  min_instances         = 1
  max_instances         = 5
  memory                = "512Mi"
  cpu                   = "0.5"
  redis_host            = google_redis_instance.cache.host
  redis_password_secret = google_secret_manager_secret.redis_password.secret_id
}

# Basic alert policy: Cloud Run 5xx rate
resource "google_monitoring_alert_policy" "error_rate" {
  display_name = "mcp-gateway-dev / 5xx error rate"
  combiner     = "OR"

  conditions {
    display_name = "5xx responses > 5/min"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"mcp-gateway-dev\" metric.label.\"response_code_class\"=\"5xx\""
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

output "gateway_url" {
  value = module.cloud_run.service_url
}

output "redis_host" {
  value = google_redis_instance.cache.host
}

output "redis_password_secret" {
  value     = google_secret_manager_secret.redis_password.secret_id
  sensitive = true
}
