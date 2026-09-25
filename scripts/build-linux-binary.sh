#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="v22.23.3"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
RELEASE_DIR="$ROOT_DIR/release"
CACHE_DIR="$ROOT_DIR/.cache/node-binaries"

echo "=== Building Linux Standalone Executables for RefuteFlow (rf) ==="
echo "Node Base: $NODE_VERSION"
echo "Project Root: $ROOT_DIR"

mkdir -p "$DIST_DIR" "$RELEASE_DIR" "$CACHE_DIR"

# Ensure local Node.js binaries can be downloaded and used even if not globally installed
download_node() {
  local arch="$1"
  local target_dir="$CACHE_DIR/node-$NODE_VERSION-linux-$arch"
  if [ ! -x "$target_dir/bin/node" ]; then
    echo "==> Downloading Node.js $NODE_VERSION for linux-$arch..."
    mkdir -p "$target_dir"
    local tarball_url="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$arch.tar.gz"
    curl -fsSL "$tarball_url" | tar -xz -C "$target_dir" --strip-components=1
  fi
}

echo "==> [1/6] Fetching base Node.js runtimes for Linux..."
download_node "x64"
download_node "arm64"

NODE_X64="$CACHE_DIR/node-$NODE_VERSION-linux-x64/bin/node"
NODE_ARM64="$CACHE_DIR/node-$NODE_VERSION-linux-arm64/bin/node"

# Ensure node and npm are available in PATH for build tools
export PATH="$(dirname "$NODE_X64"):$PATH"

# 1. Typecheck and compile typescript
echo "==> [2/6] Running TypeScript compilation..."
"$ROOT_DIR/node_modules/.bin/tsc"

# 2. Bundle with esbuild into a standalone CommonJS bundle
echo "==> [3/6] Bundling with esbuild..."
"$ROOT_DIR/node_modules/.bin/esbuild" "$ROOT_DIR/src/bin.ts" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --banner:js="const import_meta_url = require('url').pathToFileURL(__filename).href;" \
  --define:import.meta.url=import_meta_url \
  --outfile="$DIST_DIR/bundle.cjs"

# 3. Generate SEA blobs and inject
echo "==> [4/6] Creating Single Executable Applications (SEA)..."

cat << EOF > "$DIST_DIR/sea-config.json"
{
  "main": "$DIST_DIR/bundle.cjs",
  "output": "$DIST_DIR/sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
EOF

"$NODE_X64" --experimental-sea-config "$DIST_DIR/sea-config.json"

# Build linux-x64
echo "    -> Building rf-linux-x64..."
cp "$NODE_X64" "$RELEASE_DIR/rf-linux-x64"
chmod 755 "$RELEASE_DIR/rf-linux-x64"
"$ROOT_DIR/node_modules/.bin/postject" "$RELEASE_DIR/rf-linux-x64" \
  NODE_SEA_BLOB "$DIST_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Build linux-arm64
echo "    -> Building rf-linux-arm64..."
cp "$NODE_ARM64" "$RELEASE_DIR/rf-linux-arm64"
chmod 755 "$RELEASE_DIR/rf-linux-arm64"
"$ROOT_DIR/node_modules/.bin/postject" "$RELEASE_DIR/rf-linux-arm64" \
  NODE_SEA_BLOB "$DIST_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Default executable link based on host architecture
HOST_ARCH="$(uname -m)"
if [ "$HOST_ARCH" = "x86_64" ]; then
  cp -f "$RELEASE_DIR/rf-linux-x64" "$RELEASE_DIR/rf"
elif [ "$HOST_ARCH" = "aarch64" ] || [ "$HOST_ARCH" = "arm64" ]; then
  cp -f "$RELEASE_DIR/rf-linux-arm64" "$RELEASE_DIR/rf"
fi

# 4. Verify binaries
echo "==> [5/6] Verifying built executables..."
file "$RELEASE_DIR/rf-linux-x64"
file "$RELEASE_DIR/rf-linux-arm64"

if [ "$HOST_ARCH" = "x86_64" ]; then
  echo "    -> Testing rf-linux-x64 binary execution..."
  "$RELEASE_DIR/rf-linux-x64" /help | head -n 5
elif [ "$HOST_ARCH" = "aarch64" ] || [ "$HOST_ARCH" = "arm64" ]; then
  echo "    -> Testing rf-linux-arm64 binary execution..."
  "$RELEASE_DIR/rf-linux-arm64" /help | head -n 5
fi

# 5. Package tarballs and checksums
echo "==> [6/6] Packaging tarballs and generating SHA256 checksums..."
rm -f "$RELEASE_DIR"/rf-linux-*.tar.gz

package_tarball() {
  local target_name="$1"
  local src_bin="$2"
  local tmp_pack="/tmp/pack_$target_name"
  rm -rf "$tmp_pack"
  mkdir -p "$tmp_pack"
  cp "$src_bin" "$tmp_pack/rf"
  chmod 755 "$tmp_pack/rf"
  tar -czf "$RELEASE_DIR/$target_name.tar.gz" -C "$tmp_pack" rf
  rm -rf "$tmp_pack"
}

package_tarball "rf-linux-x64" "$RELEASE_DIR/rf-linux-x64"
package_tarball "rf-linux-arm64" "$RELEASE_DIR/rf-linux-arm64"

# Generate checksums for linux binaries
cd "$RELEASE_DIR"
sha256sum rf-linux-* > SHA256SUMS-linux.txt

# Merge with macOS checksums if available
if [ -f "SHA256SUMS-darwin.txt" ]; then
  cat SHA256SUMS-darwin.txt SHA256SUMS-linux.txt | sort -k2 > SHA256SUMS.txt
elif curl -fsSL -o /tmp/SHA256SUMS-upstream.txt https://github.com/mas2194/RefuteFlow/releases/download/v0.2.0/SHA256SUMS.txt 2>/dev/null; then
  # Filter out any existing linux entries and merge
  grep -v "rf-linux-" /tmp/SHA256SUMS-upstream.txt > SHA256SUMS-darwin.txt || true
  cat SHA256SUMS-darwin.txt SHA256SUMS-linux.txt | sort -k2 > SHA256SUMS.txt
else
  cp SHA256SUMS-linux.txt SHA256SUMS.txt
fi

echo "=== Linux Build Complete! ==="
ls -lh "$RELEASE_DIR"
cat "$RELEASE_DIR/SHA256SUMS.txt"
