# Deploying volunteer-next to GCP Cloud Run

This guide is the companion to the root [cloudbuild.yaml](../cloudbuild.yaml) pipeline.

## Overview

The deployment flow is:

1. Build container image with Cloud Build
2. Push image to Artifact Registry
3. Deploy image to Cloud Run
4. Inject env vars and secrets
5. Optionally mount a Cloud Storage bucket at `/app/uploads` for persistent uploaded images

## Prerequisites

- A Google Cloud project with billing enabled
- `gcloud` CLI installed and authenticated
- A GitHub (or Cloud Source) repo connected to Cloud Build triggers
- A PostgreSQL database reachable from Cloud Run

## Important: Cloud Run and Postgres containers

Cloud Run is not a good place to run PostgreSQL as a sidecar/container with durable storage.

- Cloud Run is designed for stateless containers.
- PostgreSQL needs reliable, low-latency, POSIX-compliant persistent disk semantics.
- Cloud Storage mounts are not suitable as PostgreSQL data directories.

For production on GCP, use **Cloud SQL for PostgreSQL** and pass its connection string via `POSTGRES_URL`.

If you want a self-hosted containerized Postgres with persisted storage for non-Cloud-Run environments, use [docker-compose.yml](../docker-compose.yml), which now includes a `db` service backed by a persistent named volume `pgdata`.

Enable required APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com
```

## Required IAM

### Option A: deploy directly as Cloud Build service account

Grant these roles to your Cloud Build service account (`PROJECT_NUMBER@cloudbuild.gserviceaccount.com`):

- `roles/run.admin`
- `roles/iam.serviceAccountUser` (on the Cloud Run runtime service account)
- `roles/artifactregistry.writer`
- `roles/storage.admin` (only if using `_UPLOAD_BUCKET` mount)

### Option B (recommended): deploy via a dedicated deployer service account

This repo's [cloudbuild.yaml](../cloudbuild.yaml) supports optional deploy impersonation with `_DEPLOYER_SERVICE_ACCOUNT`.

Set these trigger substitutions:

- `_DEPLOYER_SERVICE_ACCOUNT=volunteer-next-deployer@wildfire-504616.iam.gserviceaccount.com`
- `_RUNTIME_SERVICE_ACCOUNT=volunteer-next-runner@wildfire-504616.iam.gserviceaccount.com`

Then configure IAM:

1. Create deployer service account:

```bash
gcloud iam service-accounts create volunteer-next-deployer \
  --project wildfire-504616 \
  --display-name "Volunteer Next Deployer"
```

2. Allow Cloud Build SA to impersonate deployer SA:

```bash
PROJECT_NUMBER="$(gcloud projects describe wildfire-504616 --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding \
  volunteer-next-deployer@wildfire-504616.iam.gserviceaccount.com \
  --project wildfire-504616 \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountTokenCreator"
```

3. Grant deploy rights to deployer SA:

```bash
gcloud projects add-iam-policy-binding wildfire-504616 \
  --member="serviceAccount:volunteer-next-deployer@wildfire-504616.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

4. Allow deployer SA to set runtime SA on Cloud Run:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  volunteer-next-runner@wildfire-504616.iam.gserviceaccount.com \
  --project wildfire-504616 \
  --member="serviceAccount:volunteer-next-deployer@wildfire-504616.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

5. If deploy updates Cloud Storage volume mounts, also grant deployer SA:

```bash
gcloud projects add-iam-policy-binding wildfire-504616 \
  --member="serviceAccount:volunteer-next-deployer@wildfire-504616.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

### Cloud Run runtime service account

Grant these roles to your runtime service account (default in this pipeline is `${_SERVICE_NAME}-runner@wildfire-504616.iam.gserviceaccount.com`):

- `roles/secretmanager.secretAccessor`
- `roles/storage.objectAdmin` (only if using `_UPLOAD_BUCKET` mount)
- `roles/cloudsql.client` (only if using Cloud SQL)

## Artifact Registry setup

Create a Docker repository that matches substitutions in [cloudbuild.yaml](../cloudbuild.yaml):

```bash
export wildfire-504616="your-project-id"
export REGION="us-central1"
export REPOSITORY="containers"

gcloud artifacts repositories create "$REPOSITORY" \
  --project "$wildfire-504616" \
  --location "$REGION" \
  --repository-format docker \
  --description "Container images for volunteer-next"
```

## Secret Manager setup

Store sensitive values in Secret Manager. Typical secrets for this app:

- `BETTER_AUTH_SECRET`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_CLIENT_ID`
- `POSTGRES_URL`
- `PRETIX_API_TOKEN`

Create (or add a new version) and then grant runtime service account access:

```bash
# Create a secret (first time)
printf '%s' 'REPLACE_ME' | gcloud secrets create BETTER_AUTH_SECRET --data-file=-

# Add a new version (after rotation)
printf '%s' 'REPLACE_ME_NEW' | gcloud secrets versions add BETTER_AUTH_SECRET --data-file=-

# Grant runtime SA access
export RUNTIME_SA="volunteer-next-runner@${wildfire-504616}.iam.gserviceaccount.com"
gcloud secrets add-iam-policy-binding BETTER_AUTH_SECRET \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

Repeat for each secret.

## Uploaded images persistence (recommended)

This app writes uploaded images to `/app/uploads`. Cloud Run local filesystem is ephemeral, so use a Cloud Storage bucket mount in production.

Create a bucket:

```bash
export UPLOAD_BUCKET="${wildfire-504616}-volunteer-next-uploads"
gcloud storage buckets create "gs://${UPLOAD_BUCKET}" --location "$REGION"

gcloud storage buckets add-iam-policy-binding "gs://${UPLOAD_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectAdmin"
```

Then set Cloud Build substitution `_UPLOAD_BUCKET` to that bucket name (without `gs://`).

## Create a Cloud Build trigger

In Cloud Build Triggers:

1. Create trigger
2. Event: push to your production branch (for example `main`)
3. Config type: Cloud Build configuration file
4. Path: `cloudbuild.yaml`
5. Set substitutions (example below)

### Recommended trigger substitutions

```text
_SERVICE_NAME=volunteer-next
_REGION=us-central1
_REPOSITORY=containers
_RUNTIME_SERVICE_ACCOUNT=volunteer-next-runner@YOUR_wildfire-504616.iam.gserviceaccount.com
_CPU=1
_MEMORY=1Gi
_CONCURRENCY=80
_MIN_INSTANCES=0
_MAX_INSTANCES=10
_TIMEOUT=300
_ALLOW_UNAUTH=true
_RUN_TESTS=true
_UPLOAD_BUCKET=YOUR_UPLOAD_BUCKET_NAME
_ADDITIONAL_ENV_VARS=AUTH_MODE=oauth,APP_NAME=volunteer-next,REQUIRE_TEAM_LEAD=true,MAX_IMAGE_SIZE_BYTES=1MB,OAUTH_PROVIDER_NAME=Pretix,OAUTH_PROVIDER_ID=volunteer-next,OAUTH_DISCOVERY_URL=https://tickets.wildfireretreat.org/saf/.well-known/openid-configuration,PRETIX_REQUIRE_VALID_TICKET=true,PRETIX_API_BASE_URL=https://tickets.wildfireretreat.org
_SECRET_BINDINGS=BETTER_AUTH_SECRET=BETTER_AUTH_SECRET:latest,OAUTH_CLIENT_SECRET=OAUTH_CLIENT_SECRET:latest,OAUTH_CLIENT_ID=OAUTH_CLIENT_ID:latest,POSTGRES_URL=POSTGRES_URL:latest,PRETIX_API_TOKEN=PRETIX_API_TOKEN:latest
```

Notes:

- Keep `_ADDITIONAL_ENV_VARS` non-sensitive.
- Keep sensitive values in `_SECRET_BINDINGS` and Secret Manager.

## First deployment checklist

1. Trigger the build manually from Cloud Build
2. Confirm all steps pass (install, typecheck, tests, image push, deploy)
3. Open Cloud Run service URL and verify app health
4. Set `BETTER_AUTH_URL` to the final service URL or custom domain if needed
5. Verify sign-in flow, database reads/writes, and image upload

## Running DB migrations

Apply Liquibase migrations before first production use (and on schema changes).

This repo includes a helper script: [db/migrate-neon.sh](../db/migrate-neon.sh)

```bash
POSTGRES_URL='postgresql://...' ./db/migrate-neon.sh update
```

## Rollback

Cloud Run supports revision rollback.

- In Cloud Run UI, select service revision history
- Shift traffic back to a previous healthy revision

## Troubleshooting

- Build fails on tests: temporarily set `_RUN_TESTS=false` for emergency deploy, then restore to `true`.
- Secret access denied: verify runtime SA has `roles/secretmanager.secretAccessor` on each secret.
- Uploads disappear after new revisions: ensure `_UPLOAD_BUCKET` is set and mounted.
- DB connection errors: verify `POSTGRES_URL` secret value and network access from Cloud Run.
