#!/bin/bash
set -e

WEBHOOK_URL="${WEBHOOK_URL:-https://cache.wishee.workers.dev/webhook/deployment}"
DEPLOY_DIR="${1:-.}"
TEAM_ID="${VERCEL_TEAM_ID:-}"

PROJECT_JSON="$DEPLOY_DIR/.vercel/project.json"
if [ -f "$PROJECT_JSON" ]; then
  PROJECT_ID=$(grep -o '"projectId"[[:space:]]*:[[:space:]]*"[^"]*"' "$PROJECT_JSON" | sed 's/.*"projectId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
else
  PROJECT_ID="${VERCEL_PROJECT_ID:-default_project}"
fi

DEPLOY_OUTPUT=$(mktemp)
vercel --prod --cwd "$DEPLOY_DIR" 2>&1 | tee "$DEPLOY_OUTPUT"

DEPLOYMENT_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+-vaishnavmks-projects\.vercel\.app' "$DEPLOY_OUTPUT" | tail -1)
rm "$DEPLOY_OUTPUT"
[ -z "$DEPLOYMENT_URL" ] && exit 0

DEPLOYMENT_ID=$(echo "$DEPLOYMENT_URL" | sed -E 's|https://([^.]+)\.vercel\.app.*|\1|')

PAYLOAD=$(cat <<EOF
{
  "type": "deployment.created",
  "payload": {
    "team": $([ -n "$TEAM_ID" ] && echo "{\"id\": \"$TEAM_ID\"}" || echo "null"),
    "user": {"id": "local-user"},
    "alias": ["$DEPLOYMENT_URL"],
    "deployment": {
      "id": "$DEPLOYMENT_ID",
      "meta": {},
      "url": "$DEPLOYMENT_URL",
      "name": "$(basename "$DEPLOY_DIR")"
    },
    "links": {
      "deployment": "$DEPLOYMENT_URL",
      "project": "https://vercel.com/$PROJECT_ID"
    },
    "target": "production",
    "project": {"id": "$PROJECT_ID"},
    "plan": "hobby",
    "regions": ["iad1"]
  }
}
EOF
)

curl -s -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -d "$PAYLOAD"
echo ""
