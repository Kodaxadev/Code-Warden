#!/bin/bash
set -euo pipefail

TARGET="${1:-agents}"

case "$TARGET" in
  agents)
    TARGET_DIR="$HOME/.agents/skills/code-warden"
    ;;
  codex)
    TARGET_DIR="$HOME/.codex/skills/code-warden"
    ;;
  claude)
    TARGET_DIR="$HOME/.claude/skills/code-warden"
    ;;
  *)
    echo "Usage: install.sh [agents|codex|claude]" >&2
    exit 1
    ;;
esac

echo "Installing CodeWarden skill for $TARGET..."
mkdir -p "$(dirname "$TARGET_DIR")"

if [ -d "$TARGET_DIR" ]; then
  rm -rf "$TARGET_DIR"
fi

cp -r . "$TARGET_DIR"
chmod +x "$TARGET_DIR/tools/"*.js 2>/dev/null || true

echo "CodeWarden installed successfully to $TARGET_DIR"
echo "Restart or refresh your agent session so the updated skill metadata is loaded."
