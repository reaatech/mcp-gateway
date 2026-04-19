variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "mcp-gateway"
}

variable "image" {
  description = "Container image URL"
  type        = string
}

variable "min_instances" {
  description = "Minimum instances (0 for scale-to-zero)"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum instances"
  type        = number
  default     = 20
}

variable "memory" {
  description = "Memory per instance"
  type        = string
  default     = "1Gi"
}

variable "cpu" {
  description = "CPU per instance"
  type        = string
  default     = "1"
}

variable "redis_host" {
  description = "Redis host"
  type        = string
}

variable "redis_password_secret" {
  description = "Secret Manager secret name for Redis password"
  type        = string
}

variable "vpc_connector" {
  description = "VPC connector name (optional)"
  type        = string
  default     = null
}

variable "env_vars" {
  description = "Additional environment variables"
  type        = map(string)
  default     = {}
}

resource "google_cloud_run_service" "gateway" {
  name     = var.service_name
  location = var.region
  project  = var.project_id

  template {
    metadata {
      annotations = merge(
        {
          "autoscaling.knative.dev/minScale" = tostring(var.min_instances)
          "autoscaling.knative.dev/maxScale" = tostring(var.max_instances)
        },
        var.vpc_connector != null ? {
          "run.googleapis.com/vpc-access-connector" = var.vpc_connector
          "run.googleapis.com/vpc-access-egress"    = "private-ranges-only"
        } : {},
      )
    }

    spec {
      containers {
        image = var.image

        ports {
          name           = "http"
          container_port = 8080
        }

        env {
          name  = "PORT"
          value = "8080"
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "REDIS_HOST"
          value = var.redis_host
        }

        env {
          name  = "REDIS_PORT"
          value = "6379"
        }

        env {
          name = "REDIS_PASSWORD"
          value_from {
            secret_key_ref {
              name = var.redis_password_secret
              key  = "latest"
            }
          }
        }

        dynamic "env" {
          for_each = var.env_vars
          content {
            name  = env.key
            value = env.value
          }
        }

        resources {
          limits = {
            memory = var.memory
            cpu    = var.cpu
          }
        }

        startup_probe {
          http_get {
            path = "/health"
          }
          initial_delay_seconds = 5
          period_seconds        = 5
          failure_threshold     = 10
        }

        liveness_probe {
          http_get {
            path = "/health"
          }
          initial_delay_seconds = 30
          period_seconds        = 30
          failure_threshold     = 3
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true
}

output "service_url" {
  value = google_cloud_run_service.gateway.status[0].url
}

output "service_name" {
  value = google_cloud_run_service.gateway.name
}
