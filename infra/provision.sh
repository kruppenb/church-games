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
#   - openssl (used to generate MODERATION_KEY)
#
# Idempotent: safe to re-run. Every resource is checked before it is created,
# and every "set" command (app settings, CORS, role assignment, federated
# credential, repo variables) is either naturally idempotent or explicitly
# guarded so a re-run does not duplicate or clobber existing state. The one
# exception by design is MODERATION_KEY: once set on the Function App, a
# re-run leaves it alone (so redeploying never invalidates the key teachers
# already have) unless you explicitly pass MODERATION_KEY=<value> to rotate it.
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
# Optional: supply an explicit MODERATION_KEY to set/rotate it. Otherwise a
# fresh one is generated ONLY the first time (see the moderation-key section).
MODERATION_KEY="${MODERATION_KEY:-}"

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
# App settings
# ---------------------------------------------------------------------------
log "App setting: LEADERBOARD_TIMEZONE=$TIMEZONE"
run az functionapp config appsettings set \
  --name "$FUNC_APP" \
  --resource-group "$RG" \
  --output none \
  --settings "LEADERBOARD_TIMEZONE=$TIMEZONE"

log "App setting: MODERATION_KEY"
EXISTING_KEY=""
if az functionapp show --name "$FUNC_APP" --resource-group "$RG" >/dev/null 2>&1; then
  EXISTING_KEY="$(az functionapp config appsettings list \
    --name "$FUNC_APP" \
    --resource-group "$RG" \
    --query "[?name=='MODERATION_KEY'].value | [0]" \
    -o tsv)"
fi

if [ -n "$MODERATION_KEY" ]; then
  # Explicit override/rotation requested via env var.
  run az functionapp config appsettings set \
    --name "$FUNC_APP" \
    --resource-group "$RG" \
    --output none \
    --settings "MODERATION_KEY=$MODERATION_KEY"
  echo "  MODERATION_KEY set from the MODERATION_KEY environment variable (value not printed)."
elif [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "None" ]; then
  echo "  MODERATION_KEY is already set on $FUNC_APP — leaving it in place."
  echo "  (Not printed. Re-run with MODERATION_KEY=<value> to rotate it deliberately.)"
else
  GENERATED_KEY="$(openssl rand -hex 24)"
  run az functionapp config appsettings set \
    --name "$FUNC_APP" \
    --resource-group "$RG" \
    --output none \
    --settings "MODERATION_KEY=$GENERATED_KEY"
  if $DRY_RUN; then
    echo "  [dry-run] would generate a new MODERATION_KEY and set it (not shown under --dry-run)."
  else
    echo ""
    echo "############################################################################"
    echo "# MODERATION_KEY (generated just now — this is the ONLY time it is shown)  #"
    echo "# Store it in a password manager immediately.                              #"
    echo "#                                                                          #"
    echo "#   $GENERATED_KEY"
    echo "#                                                                          #"
    echo "############################################################################"
    echo ""
  fi
fi

# ---------------------------------------------------------------------------
# CORS — cleared in the platform config; the API enforces CORS in code
# ---------------------------------------------------------------------------
log "Clearing platform CORS allow-list (the API enforces CORS in application code)"
if az functionapp show --name "$FUNC_APP" --resource-group "$RG" >/dev/null 2>&1; then
  CORS_ORIGINS="$(az functionapp cors show --name "$FUNC_APP" --resource-group "$RG" --query allowedOrigins -o tsv || true)"
  if [ -n "$CORS_ORIGINS" ]; then
    while IFS= read -r origin; do
      [ -n "$origin" ] || continue
      run az functionapp cors remove \
        --name "$FUNC_APP" \
        --resource-group "$RG" \
        --allowed-origins "$origin"
    done <<<"$CORS_ORIGINS"
  else
    echo "  no platform CORS origins configured"
  fi
else
  echo "  (function app not created yet — nothing to clear)"
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
GitHub OIDC app:       $APP_REG (appId $APP_ID)
GitHub repo variables: AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
                        VITE_LEADERBOARD_API set on $GH_REPO

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
