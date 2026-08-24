#!/usr/bin/env bash
#
# infra/provision.sh — provisions the Azure resources and GitHub OIDC wiring
# for the Church Games shared leaderboard API.
#
# Usage:
#   ./infra/provision.sh              # run for real
#   ./infra/provision.sh --dry-run    # print the mutating commands instead of running them
#
# Every setting below can be overridden via environment variables, e.g.:
#   STORAGE=mychurchgamesfunc ./infra/provision.sh
#
# Prerequisites:
#   - az CLI, logged in (`az login`) to the target subscription
#   - gh CLI, logged in (`gh auth login`) with access to GH_REPO
#   - openssl (used to generate the initial MODERATION_KEY — the teacher passphrase)
#
# Idempotent: safe to re-run. Every resource is checked before it is created,
# and every "set" command (app settings, CORS, role assignment, federated
# credential, repo variables) is either naturally idempotent or explicitly
# guarded so a re-run does not duplicate or clobber existing state. The one
# exception by design is MODERATION_KEY (the teacher passphrase).
#
# The passphrase lives in Azure Key Vault as the secret "moderation-key"
# (vault "church-games-kv" by default; override with KEYVAULT/KV_SECRET_NAME).
# The Function App's MODERATION_KEY app setting holds ONLY a versionless
# @Microsoft.KeyVault(SecretUri=...) reference, which the app resolves at
# runtime through its system-assigned managed identity — so the passphrase
# itself is never in an app setting, in this repo, or within reach of the
# GitHub OIDC deploy principal (Contributor grants no Key Vault data-plane
# rights on an RBAC-authorized vault). A re-run leaves an existing secret
# alone (so redeploying never invalidates the passphrase teachers already
# have) unless you rotate it explicitly:
#
#   MODERATION_KEY='moses-parts-the-sea' ./provision.sh
#
# which writes a NEW secret version and restarts the app so the versionless
# reference re-resolves. The first-run generated value is a random hex
# placeholder, meant to be rotated to a memorable phrase (§9 of
# docs/teacher-passphrase-handoff.md) before handing it to volunteers.
#
# See docs/shared-leaderboard.md for the full runbook this script supports.

set -euo pipefail

# Git Bash on Windows rewrites arguments that look like POSIX paths (e.g. the
# role scope "/subscriptions/...") into Windows paths. Disable that here.
export MSYS_NO_PATHCONV=1

# ---------------------------------------------------------------------------
# Configuration (override any of these via environment)
# ---------------------------------------------------------------------------
RG="${RG:-ChurchGames}"
LOCATION="${LOCATION:-westus2}"
STORAGE="${STORAGE:-churchgamesfunc}"
FUNC_APP="${FUNC_APP:-church-games-api}"
TABLE="${TABLE:-leaderboard}"
TIMEZONE="${TIMEZONE:-America/Los_Angeles}"
GH_REPO="${GH_REPO:-kruppenb/church-games}"
APP_REG="${APP_REG:-github-deploy-church-games}"
KEYVAULT="${KEYVAULT:-church-games-kv}"
KV_SECRET_NAME="${KV_SECRET_NAME:-moderation-key}"
# Must mirror DEFAULT_ALLOWED_ORIGINS in api/src/lib/cors.ts (space-separated).
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://kruppenb.github.io http://localhost:5173 http://localhost:4174 http://127.0.0.1:5173 http://127.0.0.1:4174}"
# Optional: supply an explicit MODERATION_KEY (the teacher passphrase) to
# set/rotate it. The value lands in the Key Vault secret $KV_SECRET_NAME (a
# NEW secret version each time it is passed — that is the rotation), never
# directly in an app setting: the app setting only ever holds a Key Vault
# reference. Otherwise a random-hex placeholder is generated ONLY the first
# time (see the moderation-key section) — rotate it to a memorable phrase
# before sharing it with teachers.
MODERATION_KEY="${MODERATION_KEY:-}"
# Monitoring (see the "Monitoring" section). Set ALERT_EMAIL="" to skip it.
ALERT_EMAIL="${ALERT_EMAIL:-nicholaskrupper@outlook.com}"
APP_INSIGHTS="${APP_INSIGHTS:-$FUNC_APP}"          # created by `az functionapp create`
ACTION_GROUP="${ACTION_GROUP:-site-down-alerts}"   # same name as the CoachingAppV2 one
WEBTEST="${WEBTEST:-api-weeks-alive}"
ALERT_NAME="${ALERT_NAME:-api-down-alert}"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    -h | --help)
      grep '^#' "$0" | sed 's/^#//; s/^ //'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--dry-run]" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { printf '\n== %s ==\n' "$*"; }

# run CMD...  — executes CMD for real, or prints it under --dry-run.
#
# Use this for every command that CREATES, UPDATES, or DELETES state (Azure
# resources, role assignments, repo variables, ...). Read-only `show`/`list`
# checks used to decide whether a step is even needed are NOT run through
# this wrapper — they always execute for real, even under --dry-run, so the
# dry run reflects the true current state of the world instead of assuming
# a blank slate.
run() {
  if $DRY_RUN; then
    printf '[dry-run] '
    printf '%q ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# set_secret VALUE — writes VALUE as a new version of the Key Vault secret
# $KV_SECRET_NAME (the teacher passphrase).
#
# Same run/dry-run contract as run(), but purpose-built instead of wrapped:
# run() echoes its arguments verbatim under --dry-run, which would print the
# passphrase to the terminal — the exact thing moving it into a vault is meant
# to prevent. The dry-run line shows the command with the value redacted.
set_secret() {
  if $DRY_RUN; then
    printf '[dry-run] az keyvault secret set --vault-name %q --name %q --value %q --output none\n' \
      "$KEYVAULT" "$KV_SECRET_NAME" '<redacted>'
  else
    az keyvault secret set \
      --vault-name "$KEYVAULT" \
      --name "$KV_SECRET_NAME" \
      --value "$1" \
      --output none
  fi
}

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
log "Checking prerequisites"
command -v az >/dev/null 2>&1 || {
  echo "ERROR: az CLI not found. Install: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
}
command -v gh >/dev/null 2>&1 || {
  echo "ERROR: gh CLI not found. Install: https://cli.github.com/" >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "ERROR: openssl not found (needed to generate MODERATION_KEY)." >&2
  exit 1
}

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "  subscription: $SUBSCRIPTION_ID"
echo "  tenant:       $TENANT_ID"

# ---------------------------------------------------------------------------
# Resource group
# ---------------------------------------------------------------------------
log "Resource group: $RG"
if az group show --name "$RG" >/dev/null 2>&1; then
  echo "  exists"
else
  run az group create \
    --name "$RG" \
    --location "$LOCATION" \
    --tags project=church-games
fi

# ---------------------------------------------------------------------------
# Storage account
# ---------------------------------------------------------------------------
log "Storage account: $STORAGE"
if az storage account show --name "$STORAGE" --resource-group "$RG" >/dev/null 2>&1; then
  echo "  exists"
else
  NAME_AVAILABLE="$(az storage account check-name --name "$STORAGE" --query nameAvailable -o tsv)"
  if [ "$NAME_AVAILABLE" != "true" ]; then
    REASON="$(az storage account check-name --name "$STORAGE" --query message -o tsv)"
    echo "ERROR: storage account name '$STORAGE' is not available: $REASON" >&2
    echo "       Storage account names are globally unique across all of Azure — pick a new STORAGE value." >&2
    exit 1
  fi
  run az storage account create \
    --name "$STORAGE" \
    --resource-group "$RG" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    --https-only true \
    --tags project=church-games
fi

# ---------------------------------------------------------------------------
# Table
# ---------------------------------------------------------------------------
log "Table: $TABLE"
if az storage account show --name "$STORAGE" --resource-group "$RG" >/dev/null 2>&1; then
  CONN_STRING="$(az storage account show-connection-string --name "$STORAGE" --resource-group "$RG" -o tsv)"
  run az storage table create \
    --name "$TABLE" \
    --account-name "$STORAGE" \
    --connection-string "$CONN_STRING"
else
  # Only reachable under --dry-run when the storage account has not been
  # created yet in a prior run.
  echo "[dry-run] (storage account not created yet — would fetch its connection string and run:"
  echo "[dry-run]  az storage table create --name $TABLE --account-name $STORAGE --connection-string <...>)"
fi

# ---------------------------------------------------------------------------
# Function app
# ---------------------------------------------------------------------------
log "Function app: $FUNC_APP"
if az functionapp show --name "$FUNC_APP" --resource-group "$RG" >/dev/null 2>&1; then
  echo "  exists"
else
  run az functionapp create \
    --name "$FUNC_APP" \
    --resource-group "$RG" \
    --storage-account "$STORAGE" \
    --consumption-plan-location "$LOCATION" \
    --os-type Linux \
    --runtime node \
    --runtime-version 22 \
    --functions-version 4 \
    --tags project=church-games
fi

log "Function app hardening (httpsOnly, min TLS 1.2)"
run az functionapp update \
  --name "$FUNC_APP" \
  --resource-group "$RG" \
  --set httpsOnly=true
run az functionapp config set \
  --name "$FUNC_APP" \
  --resource-group "$RG" \
  --min-tls-version 1.2

# ---------------------------------------------------------------------------
# Key Vault — holds the teacher passphrase as the secret $KV_SECRET_NAME. The
# vault uses RBAC authorization (not access policies), so two role assignments
# are needed: the operator running this script writes the secret (Key Vault
# Secrets Officer), and the Function App's system-assigned managed identity
# reads it at runtime (Key Vault Secrets User) to resolve the app setting's
# @Microsoft.KeyVault(...) reference. Notably absent: the GitHub OIDC deploy
# principal, whose Contributor role on the RG grants no data-plane access.
#
# Guarded on the function app existing, like the CORS section below, so a
# first --dry-run against a blank slate degrades gracefully.
# ---------------------------------------------------------------------------
log "Key Vault: $KEYVAULT"
KV_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.KeyVault/vaults/${KEYVAULT}"
if ! az functionapp show --name "$FUNC_APP" --resource-group "$RG" >/dev/null 2>&1; then
  echo "  (function app not created yet — re-run to create the vault and grant access)"
else
  # First vault on a subscription: the Microsoft.KeyVault resource provider
  # may never have been registered (hit for real on 2026-08-24 — a fresh
  # Visual Studio subscription ships with it unregistered and `az keyvault
  # create` fails with MissingSubscriptionRegistration).
  KV_RP_STATE="$(az provider show -n Microsoft.KeyVault --query registrationState -o tsv 2>/dev/null || true)"
  if [ "$KV_RP_STATE" != "Registered" ]; then
    echo "  registering resource provider Microsoft.KeyVault (state: ${KV_RP_STATE:-unknown})..."
    run az provider register --namespace Microsoft.KeyVault --wait
  fi

  if az keyvault show --name "$KEYVAULT" --resource-group "$RG" >/dev/null 2>&1; then
    echo "  exists"
  else
    # Vault names are globally unique AND soft-delete keeps a deleted vault's
    # name reserved until it is recovered or purged, so `create` on such a
    # name fails with a confusing "already exists" from a vault you can't see.
    SOFT_DELETED="$(az keyvault list-deleted --query "[?name=='$KEYVAULT']" -o tsv 2>/dev/null || true)"
    if [ -n "$SOFT_DELETED" ]; then
      echo "ERROR: a soft-deleted Key Vault named '$KEYVAULT' already exists." >&2
      echo "       Key Vault names stay reserved while soft-deleted. Either recover it:" >&2
      echo "         az keyvault recover --name $KEYVAULT" >&2
      echo "       or pick a different name: KEYVAULT=<other-name> ./provision.sh" >&2
      exit 1
    fi
    run az keyvault create \
      --name "$KEYVAULT" \
      --resource-group "$RG" \
      --location "$LOCATION" \
      --enable-rbac-authorization true \
      --tags project=church-games \
      --output none
  fi

  # -- Role assignment: the operator running this script writes the secret. --
  SIGNED_IN_USER_ID="$(az ad signed-in-user show --query id -o tsv 2>/dev/null || true)"
  if [ -z "$SIGNED_IN_USER_ID" ] || [ "$SIGNED_IN_USER_ID" = "null" ]; then
    echo "  WARNING: could not resolve the signed-in user (service principal login?)."
    echo "           Grant 'Key Vault Secrets Officer' on $KEYVAULT by hand."
  else
    OFFICER_EXISTS="$(az role assignment list \
      --assignee "$SIGNED_IN_USER_ID" \
      --role "Key Vault Secrets Officer" \
      --scope "$KV_SCOPE" \
      --query "length(@)" -o tsv 2>/dev/null || echo 0)"
    if [ "${OFFICER_EXISTS:-0}" = "0" ]; then
      run az role assignment create \
        --assignee-object-id "$SIGNED_IN_USER_ID" \
        --assignee-principal-type User \
        --role "Key Vault Secrets Officer" \
        --scope "$KV_SCOPE"
    else
      echo "  Key Vault Secrets Officer already assigned to the signed-in user"
    fi
  fi

  # -- Role assignment: the Function App's identity reads the secret. --
  PRINCIPAL_ID="$(az functionapp identity show \
    --name "$FUNC_APP" \
    --resource-group "$RG" \
    --query principalId -o tsv 2>/dev/null || true)"
  if [ -z "$PRINCIPAL_ID" ] || [ "$PRINCIPAL_ID" = "null" ]; then
    run az functionapp identity assign \
      --name "$FUNC_APP" \
      --resource-group "$RG" \
      --output none
    if $DRY_RUN; then
      PRINCIPAL_ID="<principal-id-pending-dry-run>"
    else
      PRINCIPAL_ID="$(az functionapp identity show \
        --name "$FUNC_APP" \
        --resource-group "$RG" \
        --query principalId -o tsv)"
    fi
  fi
  echo "  function app identity: $PRINCIPAL_ID"

  READER_EXISTS=0
  if [ "$PRINCIPAL_ID" != "<principal-id-pending-dry-run>" ]; then
    READER_EXISTS="$(az role assignment list \
      --assignee "$PRINCIPAL_ID" \
      --role "Key Vault Secrets User" \
      --scope "$KV_SCOPE" \
      --query "length(@)" -o tsv 2>/dev/null || echo 0)"
  fi
  if [ "${READER_EXISTS:-0}" = "0" ]; then
    # Assign by object id + principal type, same reason as the Contributor
    # assignment below: no Graph lookup for an identity created seconds ago.
    run az role assignment create \
      --assignee-object-id "$PRINCIPAL_ID" \
      --assignee-principal-type ServicePrincipal \
      --role "Key Vault Secrets User" \
      --scope "$KV_SCOPE"
  else
    echo "  Key Vault Secrets User already assigned to the function app identity"
  fi
fi

# ---------------------------------------------------------------------------
# App settings
# ---------------------------------------------------------------------------
log "App setting: LEADERBOARD_TIMEZONE=$TIMEZONE"
run az functionapp config appsettings set \
  --name "$FUNC_APP" \
  --resource-group "$RG" \
  --output none \
  --settings "LEADERBOARD_TIMEZONE=$TIMEZONE"

# The passphrase itself goes into Key Vault; the app setting only ever holds
# a versionless reference to it. Versionless means rotation needs no app
# setting change at all — just a new secret version plus a restart.
log "Teacher passphrase: Key Vault secret $KV_SECRET_NAME -> app setting MODERATION_KEY"
KV_REF="@Microsoft.KeyVault(SecretUri=https://${KEYVAULT}.vault.azure.net/secrets/${KV_SECRET_NAME}/)"

FUNC_APP_EXISTS=false
EXISTING_KEY=""
if az functionapp show --name "$FUNC_APP" --resource-group "$RG" >/dev/null 2>&1; then
  FUNC_APP_EXISTS=true
  EXISTING_KEY="$(az functionapp config appsettings list \
    --name "$FUNC_APP" \
    --resource-group "$RG" \
    --query "[?name=='MODERATION_KEY'].value | [0]" \
    -o tsv)"
fi
EXISTING_IS_REF=false
case "$EXISTING_KEY" in
  '@Microsoft.KeyVault'*) EXISTING_IS_REF=true ;;
esac

VAULT_EXISTS=false
if az keyvault show --name "$KEYVAULT" --resource-group "$RG" >/dev/null 2>&1; then
  VAULT_EXISTS=true
fi

# Key Vault RBAC is eventually consistent: the data plane can reject the
# operator for a few seconds after the role assignment above lands, so the
# very first `secret set` on a fresh vault would fail with a 403. Poll a
# harmless read-only list until it stops erroring (up to ~60s). Not run
# through run() — it is a read-only probe, so it executes under --dry-run too.
if $VAULT_EXISTS; then
  RBAC_ATTEMPT=1
  RBAC_WAITED=false
  until az keyvault secret list --vault-name "$KEYVAULT" -o none >/dev/null 2>&1; do
    if [ "$RBAC_ATTEMPT" -ge 6 ]; then
      echo "  WARNING: still cannot list secrets in $KEYVAULT after ~60s — continuing anyway."
      echo "           If the next step 403s, wait a minute and re-run."
      break
    fi
    if ! $RBAC_WAITED; then
      echo "  waiting for Key Vault RBAC to propagate..."
      RBAC_WAITED=true
    fi
    sleep 10
    RBAC_ATTEMPT=$((RBAC_ATTEMPT + 1))
  done
else
  echo "  (Key Vault $KEYVAULT not created yet — skipping the RBAC propagation wait)"
fi

KV_HAS_SECRET=""
if $VAULT_EXISTS; then
  KV_HAS_SECRET="$(az keyvault secret show \
    --vault-name "$KEYVAULT" \
    --name "$KV_SECRET_NAME" \
    --query id -o tsv 2>/dev/null || true)"
fi

SECRET_WRITTEN=false
if [ -n "$MODERATION_KEY" ]; then
  # Explicit rotation requested via env var — writes a new secret version.
  set_secret "$MODERATION_KEY"
  SECRET_WRITTEN=true
  echo "  secret $KV_SECRET_NAME set from the MODERATION_KEY environment variable (value not printed)."
elif [ -n "$KV_HAS_SECRET" ]; then
  echo "  the teacher passphrase is already in Key Vault ($KEYVAULT/$KV_SECRET_NAME) — leaving it in place."
  echo "  (Not printed. Re-run with MODERATION_KEY=<value> to rotate it deliberately.)"
elif [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "None" ] && ! $EXISTING_IS_REF; then
  # A pre-Key-Vault deployment: the plaintext passphrase is sitting in the app
  # setting. Move it into the vault as-is so teachers keep the phrase they have.
  set_secret "$EXISTING_KEY"
  SECRET_WRITTEN=true
  echo "  migrated the existing plaintext app setting into Key Vault (value unchanged, not printed)."
else
  GENERATED_KEY="$(openssl rand -hex 24)"
  set_secret "$GENERATED_KEY"
  SECRET_WRITTEN=true
  if $DRY_RUN; then
    echo "  [dry-run] would generate a new teacher passphrase and store it in Key Vault (not shown under --dry-run)."
  else
    echo ""
    echo "############################################################################"
    echo "# MODERATION_KEY (generated just now — this is the ONLY time it is shown)  #"
    echo "# Store it in a password manager immediately.                              #"
    echo "#                                                                          #"
    echo "#   $GENERATED_KEY"
    echo "#                                                                          #"
    echo "# This is the teacher passphrase. Rotate it to a memorable phrase with:    #"
    echo "#   MODERATION_KEY='moses-parts-the-sea' ./provision.sh                    #"
    echo "############################################################################"
    echo ""
  fi
fi

REF_UPDATED=false
if $FUNC_APP_EXISTS; then
  if [ "$EXISTING_KEY" = "$KV_REF" ]; then
    echo "  app setting MODERATION_KEY already references Key Vault."
  else
    run az functionapp config appsettings set \
      --name "$FUNC_APP" \
      --resource-group "$RG" \
      --output none \
      --settings "MODERATION_KEY=$KV_REF"
    REF_UPDATED=true
    echo "  app setting MODERATION_KEY is now a Key Vault reference: $KV_REF"
  fi
else
  echo "  (function app not created yet — re-run to point MODERATION_KEY at the vault)"
fi

if $FUNC_APP_EXISTS && { $SECRET_WRITTEN || $REF_UPDATED; }; then
  # A versionless Key Vault reference is re-resolved when the app restarts;
  # left alone, the host can keep serving the previously resolved value for up
  # to ~a day. On the consumption plan a restart costs a few seconds of cold
  # start — acceptable, and rotations happen on Sunday-off hours anyway.
  run az functionapp restart --name "$FUNC_APP" --resource-group "$RG"
  echo "  restarted $FUNC_APP so it re-resolves the Key Vault reference."
fi

# ---------------------------------------------------------------------------
# CORS — in Azure the Functions host answers browser preflights (OPTIONS with
# an Origin header) from the PLATFORM allow-list before our code runs, so the
# platform list must mirror api/src/lib/cors.ts. Actual (non-preflight)
# responses get their CORS headers from the API code. Verified 2026-08-23:
# with an empty platform list the host returned 204 with no
# Access-Control-Allow-Origin and browsers blocked every request.
# ---------------------------------------------------------------------------
log "Platform CORS allow-list"
if az functionapp show --name "$FUNC_APP" --resource-group "$RG" >/dev/null 2>&1; then
  EXISTING_ORIGINS="$(az functionapp cors show --name "$FUNC_APP" --resource-group "$RG" --query allowedOrigins -o tsv || true)"
  MISSING_ORIGINS=()
  for origin in $ALLOWED_ORIGINS; do
    if ! grep -qxF "$origin" <<<"$EXISTING_ORIGINS"; then
      MISSING_ORIGINS+=("$origin")
    fi
  done
  if [ "${#MISSING_ORIGINS[@]}" -gt 0 ]; then
    run az functionapp cors add \
      --name "$FUNC_APP" \
      --resource-group "$RG" \
      --output none \
      --allowed-origins "${MISSING_ORIGINS[@]}"
    echo "  added: ${MISSING_ORIGINS[*]}"
  else
    echo "  already configured: $ALLOWED_ORIGINS"
  fi
else
  echo "  (function app not created yet — re-run to configure CORS)"
fi

# ---------------------------------------------------------------------------
# Monitoring — an Application Insights standard availability test that GETs
# /api/weeks every 5 minutes from three US regions (expects HTTP 200 and the
# text "currentWeekKey" in the body) plus a metric alert that emails
# ALERT_EMAIL when availability drops below 100% over a 15-minute window.
# Mirrors the CoachingAppV2 setup (homepage-alive / site-down-alerts /
# homepage-down-alert). Free tier: standard web tests and the first metric
# alert rules cost nothing at this scale. Each of the three resources is
# created only if missing; nothing is updated on re-run.
# ---------------------------------------------------------------------------
log "Monitoring: availability test + email alert"
if [ -z "$ALERT_EMAIL" ]; then
  echo "  ALERT_EMAIL is empty — skipping."
elif ! az functionapp show --name "$FUNC_APP" --resource-group "$RG" >/dev/null 2>&1; then
  echo "  (function app not created yet — re-run to configure monitoring)"
else
  AI_ID="$(az monitor app-insights component show --app "$APP_INSIGHTS" --resource-group "$RG" --query id -o tsv 2>/dev/null || true)"
  if [ -z "$AI_ID" ]; then
    echo "  App Insights component '$APP_INSIGHTS' not found in $RG — skipping."
    echo "  (az functionapp create normally creates it; set APP_INSIGHTS=<name> if yours differs)"
  else
    if az monitor action-group show --name "$ACTION_GROUP" --resource-group "$RG" >/dev/null 2>&1; then
      echo "  action group $ACTION_GROUP exists"
    else
      run az monitor action-group create \
        --name "$ACTION_GROUP" \
        --resource-group "$RG" \
        --short-name SiteDown \
        --action email admin "$ALERT_EMAIL" \
        --output none
      echo "  action group $ACTION_GROUP -> $ALERT_EMAIL"
    fi

    if az monitor app-insights web-test show --name "$WEBTEST" --resource-group "$RG" >/dev/null 2>&1; then
      echo "  web test $WEBTEST exists"
    else
      run az monitor app-insights web-test create \
        --name "$WEBTEST" \
        --resource-group "$RG" \
        --location "$LOCATION" \
        --defined-web-test-name "$WEBTEST" \
        --synthetic-monitor-id "$WEBTEST" \
        --description "Checks that GET /api/weeks returns 200 with currentWeekKey" \
        --web-test-kind standard \
        --kind ping \
        --enabled true \
        --frequency 300 \
        --timeout 30 \
        --retry-enabled true \
        --locations Id=us-va-ash-azr \
        --locations Id=us-ca-sjc-azr \
        --locations Id=us-il-ch1-azr \
        --http-verb GET \
        --request-url "https://${FUNC_APP}.azurewebsites.net/api/weeks" \
        --expected-status-code 200 \
        --content-validation content-match=currentWeekKey ignore-case=false pass-if-text-found=true \
        --ssl-check true \
        --ssl-lifetime-check 30 \
        --tags "hidden-link:${AI_ID}=Resource" \
        --output none
      echo "  web test $WEBTEST -> GET https://${FUNC_APP}.azurewebsites.net/api/weeks"
    fi

    if az monitor metrics alert show --name "$ALERT_NAME" --resource-group "$RG" >/dev/null 2>&1; then
      echo "  alert $ALERT_NAME exists"
    else
      # NOTE: the CLI's condition parser prints a spurious
      # "mismatched input '/' expecting WHITESPACE" line for the slash in the
      # availabilityResult/name dimension. It is harmless — the rule is
      # created with the dimension intact (verified 2026-08-23).
      run az monitor metrics alert create \
        --name "$ALERT_NAME" \
        --resource-group "$RG" \
        --scopes "$AI_ID" \
        --condition "avg availabilityResults/availabilityPercentage < 100 where availabilityResult/name includes $WEBTEST" \
        --window-size 15m \
        --evaluation-frequency 5m \
        --severity 1 \
        --description "Alert when GET /api/weeks on the leaderboard API is unreachable" \
        --action "$ACTION_GROUP" \
        --output none
      echo "  alert $ALERT_NAME -> action group $ACTION_GROUP"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# GitHub OIDC app registration
# ---------------------------------------------------------------------------
log "GitHub OIDC app registration: $APP_REG"
APP_ID="$(az ad app list --display-name "$APP_REG" --query "[0].appId" -o tsv)"
if [ -z "$APP_ID" ] || [ "$APP_ID" = "null" ]; then
  if $DRY_RUN; then
    printf '[dry-run] az ad app create --display-name %q\n' "$APP_REG"
    APP_ID="<app-id-pending-dry-run>"
  else
    az ad app create --display-name "$APP_REG" >/dev/null
    APP_ID="$(az ad app list --display-name "$APP_REG" --query "[0].appId" -o tsv)"
  fi
else
  echo "  exists"
fi
echo "  appId: $APP_ID"

log "Service principal for $APP_REG"
if [ "$APP_ID" != "<app-id-pending-dry-run>" ]; then
  SP_ID="$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)"
  if [ -z "$SP_ID" ] || [ "$SP_ID" = "null" ]; then
    if $DRY_RUN; then
      printf '[dry-run] az ad sp create --id %q\n' "$APP_ID"
      SP_ID="<sp-id-pending-dry-run>"
    else
      az ad sp create --id "$APP_ID" >/dev/null
      SP_ID="$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)"
    fi
  else
    echo "  exists"
  fi
else
  SP_ID="<sp-id-pending-dry-run>"
fi
echo "  servicePrincipalId: $SP_ID"

log "Federated credential (GitHub Actions OIDC, main branch)"
FIC_SUBJECT="repo:${GH_REPO}:ref:refs/heads/main"
FIC_EXISTS=0
if [ "$APP_ID" != "<app-id-pending-dry-run>" ]; then
  FIC_EXISTS="$(az ad app federated-credential list --id "$APP_ID" --query "length([?subject=='$FIC_SUBJECT'])" -o tsv)"
fi
if [ "${FIC_EXISTS:-0}" = "0" ]; then
  FIC_PARAMS="{\"name\":\"church-games-main\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"$FIC_SUBJECT\",\"audiences\":[\"api://AzureADTokenExchange\"]}"
  run az ad app federated-credential create \
    --id "$APP_ID" \
    --parameters "$FIC_PARAMS"
else
  echo "  federated credential for $FIC_SUBJECT already exists"
fi

log "Role assignment: Contributor on $RG for $APP_REG"
RG_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}"
ROLE_EXISTS=0
if [ "$APP_ID" != "<app-id-pending-dry-run>" ]; then
  ROLE_EXISTS="$(az role assignment list --assignee "$APP_ID" --role Contributor --scope "$RG_SCOPE" --query "length(@)" -o tsv)"
fi
if [ "${ROLE_EXISTS:-0}" = "0" ]; then
  # Assign by object id + principal type: avoids the Graph lookup that fails
  # with "principal not found" for a service principal created seconds ago.
  run az role assignment create \
    --assignee-object-id "$SP_ID" \
    --assignee-principal-type ServicePrincipal \
    --role Contributor \
    --scope "$RG_SCOPE"
else
  echo "  already assigned"
fi

# ---------------------------------------------------------------------------
# GitHub repo variables (Actions "variables", not secrets — OIDC needs no
# client secret; VITE_LEADERBOARD_API is baked into the public site bundle
# anyway, so a variable is correct for all four)
# ---------------------------------------------------------------------------
log "GitHub repo variables ($GH_REPO)"
run gh variable set AZURE_CLIENT_ID --body "$APP_ID" --repo "$GH_REPO"
run gh variable set AZURE_TENANT_ID --body "$TENANT_ID" --repo "$GH_REPO"
run gh variable set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID" --repo "$GH_REPO"
run gh variable set VITE_LEADERBOARD_API --body "https://${FUNC_APP}.azurewebsites.net/api" --repo "$GH_REPO"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log "Summary"
cat <<EOF
Function app URL:      https://${FUNC_APP}.azurewebsites.net
API base URL:          https://${FUNC_APP}.azurewebsites.net/api
Resource group:        $RG ($LOCATION)
Storage account:       $STORAGE
Table:                 $TABLE
Key Vault:             $KEYVAULT (secret $KV_SECRET_NAME -> app setting reference)
GitHub OIDC app:       $APP_REG (appId $APP_ID)
GitHub repo variables: AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
                        VITE_LEADERBOARD_API set on $GH_REPO
Monitoring:            web test $WEBTEST -> alert $ALERT_NAME -> $ACTION_GROUP (${ALERT_EMAIL:-disabled})

Next steps:
  1. Push to main (or run "gh workflow run deploy-api.yml --repo $GH_REPO") to
     deploy the API — .github/workflows/deploy-api.yml builds api/ and
     deploys it to $FUNC_APP via OIDC.
  2. Run "gh workflow run deploy.yml --repo $GH_REPO" (or push to main) to
     rebuild the site with VITE_LEADERBOARD_API baked into the Pages build.
  3. Smoke test once both have deployed:
       curl https://${FUNC_APP}.azurewebsites.net/api/weeks
  4. See docs/shared-leaderboard.md for the full runbook.
EOF

if $DRY_RUN; then
  echo ""
  echo "This was a --dry-run: no Azure or GitHub resources were created or modified."
fi
