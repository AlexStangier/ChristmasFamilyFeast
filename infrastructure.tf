# Configure the Google Cloud Provider
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# -- Variables --

variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
  default     = "cw-academy-sandbox-alex"
}

variable "region" {
  description = "GCP Region (e.g., us-central1)"
  type        = string
  default     = "europe-west1"
}

variable "container_image" {
  description = "The URL of the container image to deploy (e.g., gcr.io/my-project/christmas-planner)"
  type        = string
  default     = "gcr.io/cw-academy-sandbox-alex/christmas-planner"
}

# -- 1. Firestore Database & GCS Bucket --

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "google_storage_bucket" "data_bucket" {
  name          = "${var.project_id}-christmas-data-${random_id.bucket_suffix.hex}"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true
}

resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "christmas-planner"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
}

# -- 2. Service Account for the App --

resource "google_service_account" "app_sa" {
  account_id   = "christmas-planner-sa"
  display_name = "Christmas Planner Service Account"
}

# Grant the Service Account permission to read/write objects in the bucket, AI Platform access, and Firestore
resource "google_project_iam_member" "app_sa_roles" {
  for_each = toset([
    "roles/storage.objectUser",
    "roles/aiplatform.user",
    "roles/datastore.user"
  ])
  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

# -- 3. Cloud Run Service --

resource "google_cloud_run_v2_service" "default" {
  name     = "christmas-planner"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app_sa.email

    containers {
      image = var.container_image

      env {
        name  = "BUCKET_NAME"
        value = google_storage_bucket.data_bucket.name
      }
      env {
        name  = "PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "REGION"
        value = var.region
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }
    }
  }
}

# -- 4. Public Access (Allow Unauthenticated) --

resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = google_cloud_run_v2_service.default.project
  location = google_cloud_run_v2_service.default.location
  name     = google_cloud_run_v2_service.default.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -- Outputs --

output "service_url" {
  value       = google_cloud_run_v2_service.default.uri
  description = "The URL of the deployed Christmas Planner"
}

output "bucket_name" {
  value       = google_storage_bucket.data_bucket.name
  description = "The GCS bucket storing the JSON data"
}
