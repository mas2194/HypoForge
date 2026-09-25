#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="v22.14.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
RELEASE_DIR="$ROOT_DIR/release"
CACHE_DIR="$ROOT_DIR/.cache/node-binaries"

echo "=== Building macOS Standalone Executables for RefuteFlow (rf) ==="
echo "Node Base: $NODE_VERSION"
echo "Project Root: $ROOT_DIR"

mkdir -p "$DIST_DIR" "$RELEASE_DIR" "$CACHE_DIR"

# 1. Typecheck and compile typescript
echo "==> [1/6] Running TypeScript compilation..."
"$ROOT_DIR/node_modules/.bin/tsc"

# 2. Bundle with esbuild into a standalone CommonJS bundle
echo "==> [2/6] Bundling with esbuild..."
"$ROOT_DIR/node_modules/.bin/esbuild" "$ROOT_DIR/src/bin.ts" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --banner:js="const import_meta_url = require('url').pathToFileURL(__filename).href;" \
  --define:import.meta.url=import_meta_url \
  --outfile="$DIST_DIR/bundle.cjs"

# 3. Ensure official Node.js base binaries are cached
download_node() {
  local arch="$1"
  local target_dir="$CACHE_DIR/node-$NODE_VERSION-darwin-$arch"
  if [ ! -x "$target_dir/bin/node" ]; then
    echo "==> Downloading Node.js $NODE_VERSION for darwin-$arch..."
    mkdir -p "$target_dir"
    local tarball_url="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-$arch.tar.gz"
    curl -fsSL "$tarball_url" | tar -xz -C "$target_dir" --strip-components=1
  fi
}

echo "==> [3/6] Fetching base Node.js runtimes..."
download_node "arm64"
download_node "x64"

NODE_ARM64="$CACHE_DIR/node-$NODE_VERSION-darwin-arm64/bin/node"
NODE_X64="$CACHE_DIR/node-$NODE_VERSION-darwin-x64/bin/node"

# 4. Generate SEA blobs and inject
echo "==> [4/6] Creating Single Executable Applications (SEA)..."

# Configuration for SEA blob
cat << EOF > "$DIST_DIR/sea-config.json"
{
  "main": "$DIST_DIR/bundle.cjs",
  "output": "$DIST_DIR/sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
EOF

# Build darwin-arm64
echo "    -> Building rf-darwin-arm64..."
"$NODE_ARM64" --experimental-sea-config "$DIST_DIR/sea-config.json"
cp "$NODE_ARM64" "$RELEASE_DIR/rf-darwin-arm64"
codesign --remove-signature "$RELEASE_DIR/rf-darwin-arm64" 2>/dev/null || true
chmod 755 "$RELEASE_DIR/rf-darwin-arm64"
"$ROOT_DIR/node_modules/.bin/postject" "$RELEASE_DIR/rf-darwin-arm64" \
  NODE_SEA_BLOB "$DIST_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA
codesign -f -s - "$RELEASE_DIR/rf-darwin-arm64"

# Build darwin-x64
echo "    -> Building rf-darwin-x64..."
arch -x86_64 "$NODE_X64" --experimental-sea-config "$DIST_DIR/sea-config.json"
cp "$NODE_X64" "$RELEASE_DIR/rf-darwin-x64"
codesign --remove-signature "$RELEASE_DIR/rf-darwin-x64" 2>/dev/null || true
chmod 755 "$RELEASE_DIR/rf-darwin-x64"
"$ROOT_DIR/node_modules/.bin/postject" "$RELEASE_DIR/rf-darwin-x64" \
  NODE_SEA_BLOB "$DIST_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA
codesign -f -s - "$RELEASE_DIR/rf-darwin-x64"

# Build universal binary using lipo
echo "    -> Creating universal binary (arm64 + x86_64)..."
lipo -create "$RELEASE_DIR/rf-darwin-arm64" "$RELEASE_DIR/rf-darwin-x64" \
  -output "$RELEASE_DIR/rf-darwin-universal"
codesign -f -s - "$RELEASE_DIR/rf-darwin-universal"

# Default executable link
cp -f "$RELEASE_DIR/rf-darwin-universal" "$RELEASE_DIR/rf"

# 5. Verify binaries
echo "==> [5/6] Verifying built executables..."
file "$RELEASE_DIR/rf-darwin-arm64"
file "$RELEASE_DIR/rf-darwin-x64"
file "$RELEASE_DIR/rf-darwin-universal"
file "$RELEASE_DIR/rf"

echo "    -> Testing arm64 binary execution..."
"$RELEASE_DIR/rf-darwin-arm64" /help | head -n 5

echo "    -> Testing x64 binary execution via Rosetta..."
arch -x86_64 "$RELEASE_DIR/rf-darwin-x64" /help | head -n 5

echo "    -> Testing universal binary execution..."
"$RELEASE_DIR/rf" /help | head -n 5

# 6. Package tarballs and checksums
echo "==> [6/6] Packaging tarballs and generating SHA256 checksums..."
rm -f "$RELEASE_DIR"/*.tar.gz "$RELEASE_DIR/SHA256SUMS.txt"

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

package_tarball "rf-darwin-arm64" "$RELEASE_DIR/rf-darwin-arm64"
package_tarball "rf-darwin-x64" "$RELEASE_DIR/rf-darwin-x64"
package_tarball "rf-darwin-universal" "$RELEASE_DIR/rf-darwin-universal"

cd "$RELEASE_DIR"
shasum -a 256 rf-darwin-* > SHA256SUMS.txt

echo "=== Build Complete! ==="
ls -lh "$RELEASE_DIR"
cat "$RELEASE_DIR/SHA256SUMS.txt"
