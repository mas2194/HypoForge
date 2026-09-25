#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
TAG="v0.2.0"
REPO="mas2194/RefuteFlow"

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

if [ -z "$TOKEN" ]; then
  echo "Error: GH_TOKEN or GITHUB_TOKEN environment variable is required."
  echo "Usage: GH_TOKEN=<token> $0"
  exit 1
fi

echo "=== Uploading Linux Assets to GitHub Release $TAG ==="

# Get Release ID
RELEASE_INFO=$(curl -fsSL -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/releases/tags/$TAG")

RELEASE_ID=$(echo "$RELEASE_INFO" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
echo "Release ID: $RELEASE_ID"

# 1. Update Release Title and Body
echo "==> Updating Release Title and Body..."
RELEASE_BODY=$(cat << 'EOF'
## RefuteFlow v0.2.0 - Standalone Executables (`rf`)

Project renamed to **RefuteFlow** with the canonical CLI command **`rf`**.
Now providing standalone standalone executables for both **macOS** and **Linux**!

### Features
- **Project Name & Binary**: Renamed to **RefuteFlow**, executable command is **`rf`**.
- **Zero Runtime Dependencies**: Packaged with Node.js v22 LTS runtime via Single Executable Applications (SEA). No external Node.js, pnpm, or npm installation required.
- **Cross-Platform Standalone Binaries**:
  - **macOS**: Universal binary supporting both Apple Silicon (`arm64`: M1–M4) and Intel (`x86_64`) Macs.
  - **Linux**: Native standalone binaries for `x86_64` (Intel/AMD) and `arm64` (aarch64).
- **Embedded Prompts**: Core architecture, falsifier, implementer, researcher, and clean-room audit prompts are embedded directly into the binary.

### Assets
- `rf-darwin-universal.tar.gz`: Universal macOS binary (arm64 + x86_64)
- `rf-darwin-arm64.tar.gz`: Apple Silicon Mac binary (arm64)
- `rf-darwin-x64.tar.gz`: Intel Mac binary (x86_64)
- `rf-linux-x64.tar.gz`: Linux x86_64 (64-bit Intel/AMD) binary
- `rf-linux-arm64.tar.gz`: Linux arm64 (aarch64) binary
- `SHA256SUMS.txt`: SHA-256 integrity checksums for all assets

### Installation & Quick Start

#### macOS (Apple Silicon & Intel)
```bash
curl -fsSL https://github.com/mas2194/RefuteFlow/releases/download/v0.2.0/rf-darwin-universal.tar.gz | tar -xz
chmod +x rf
sudo mv rf /usr/local/bin/

rf /help
```

#### Linux (x86_64 / arm64)
```bash
# For Linux x86_64:
curl -fsSL https://github.com/mas2194/RefuteFlow/releases/download/v0.2.0/rf-linux-x64.tar.gz | tar -xz

# For Linux arm64:
# curl -fsSL https://github.com/mas2194/RefuteFlow/releases/download/v0.2.0/rf-linux-arm64.tar.gz | tar -xz

chmod +x rf
sudo mv rf /usr/local/bin/

rf /help
```

#### Interactive Mode & Web UI
```bash
# Launch interactive CLI
rf

# Start Web UI server
rf --server
```
EOF
)

python3 -c "
import urllib.request, json, os

url = f'https://api.github.com/repos/$REPO/releases/$RELEASE_ID'
token = os.environ['TOKEN']
body = '''$RELEASE_BODY'''
data = json.dumps({
    'name': 'v0.2.0 - RefuteFlow (rf) Standalone Executables (macOS & Linux)',
    'body': body
}).encode('utf-8')

req = urllib.request.Request(url, data=data, method='PATCH')
req.add_header('Authorization', f'token {token}')
req.add_header('Accept', 'application/vnd.github+json')
req.add_header('Content-Type', 'application/json')
with urllib.request.urlopen(req) as resp:
    print('Release title/body updated successfully:', resp.status)
"

# 2. Upload asset helper
upload_asset() {
  local file_path="$1"
  local asset_name="$(basename "$file_path")"
  local content_type="$2"

  echo "==> Uploading $asset_name..."

  # Check if asset already exists and delete if so
  local existing_id=$(curl -fsSL -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/releases/$RELEASE_ID/assets" | \
    python3 -c "import sys, json
assets = json.load(sys.stdin)
for a in assets:
    if a['name'] == '$asset_name':
        print(a['id'])
        break
")

  if [ -n "$existing_id" ]; then
    echo "    -> Existing asset found (ID: $existing_id). Deleting before re-upload..."
    curl -fsSL -X DELETE -H "Authorization: token $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$REPO/releases/assets/$existing_id"
  fi

  # Upload asset
  local upload_url="https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$asset_name"
  curl -fsSL -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: $content_type" \
    --data-binary @"$file_path" \
    "$upload_url" > /dev/null

  echo "    -> Uploaded $asset_name successfully!"
}

# 3. Upload Linux tarballs and updated SHA256SUMS.txt
upload_asset "$RELEASE_DIR/rf-linux-x64.tar.gz" "application/gzip"
upload_asset "$RELEASE_DIR/rf-linux-arm64.tar.gz" "application/gzip"
upload_asset "$RELEASE_DIR/SHA256SUMS.txt" "text/plain"

echo "=== All Linux assets successfully uploaded to release $TAG! ==="
