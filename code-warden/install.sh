#!/bin/bash
set -e

echo "Installing CodeWarden skill..."
TARGET_DIR="$HOME/.claude/skills/code-warden"

mkdir -p "$HOME/.claude/skills"

# Remove existing to ensure clean install
if [ -d "$TARGET_DIR" ]; then
  rm -rf "$TARGET_DIR"
fi

cp -r . "$TARGET_DIR"
chmod +x "$TARGET_DIR/tools/"*.js 2>/dev/null || true

echo "CodeWarden installed successfully to $TARGET_DIR"
echo "You can now load it in your Claude Code or Cowork session."
