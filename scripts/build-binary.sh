#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-auto}"

case "$TARGET" in
  linux)
    bash "$SCRIPT_DIR/build-linux-binary.sh"
    ;;
  macos|darwin)
    bash "$SCRIPT_DIR/build-macos-binary.sh"
    ;;
  auto)
    OS="$(uname -s)"
    case "$OS" in
      Linux)
        echo "Detected OS: Linux. Running Linux binary build..."
        bash "$SCRIPT_DIR/build-linux-binary.sh"
        ;;
      Darwin)
        echo "Detected OS: macOS (Darwin). Running macOS binary build..."
        bash "$SCRIPT_DIR/build-macos-binary.sh"
        ;;
      *)
        echo "Unsupported OS for automated standalone build: $OS"
        echo "Please run either scripts/build-linux-binary.sh or scripts/build-macos-binary.sh directly."
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Usage: $0 [auto|linux|macos]"
    exit 1
    ;;
esac
