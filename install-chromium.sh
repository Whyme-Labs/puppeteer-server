#!/bin/bash

echo "Installing Chromium and dependencies..."

# Update package index and install Chromium
apk update
apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Check where Chromium is installed
echo "Checking Chromium installation paths:"
which chromium
which chromium-browser
ls -la /usr/bin/chromium*

# Try to run Chromium to verify it works
echo "Checking Chromium version:"
chromium --version || echo "Failed to run chromium command"

# Find all Chromium binaries on the system
echo "Searching for all Chromium binaries:"
find / -name "chromium*" -type f 2>/dev/null | grep -v .xml | grep -v .png

# If Chromium is not found, try to create a symlink
if [ ! -f /usr/bin/chromium ]; then
  echo "Chromium not found at /usr/bin/chromium, creating symlinks if possible"
  
  # Try to find the binary and create a symlink
  CHROMIUM_PATH=$(find / -name "chromium-browser" -type f 2>/dev/null | head -1)
  if [ -n "$CHROMIUM_PATH" ]; then
    echo "Creating symlink from $CHROMIUM_PATH to /usr/bin/chromium"
    ln -sf "$CHROMIUM_PATH" /usr/bin/chromium
  else
    CHROMIUM_PATH=$(find / -name "chromium" -type f 2>/dev/null | grep -v /usr/bin/chromium | head -1)
    if [ -n "$CHROMIUM_PATH" ]; then
      echo "Creating symlink from $CHROMIUM_PATH to /usr/bin/chromium"
      ln -sf "$CHROMIUM_PATH" /usr/bin/chromium
    fi
  fi
fi

# Check if the symlink was created successfully
if [ -f /usr/bin/chromium ]; then
  echo "Chromium is available at /usr/bin/chromium"
  ls -la /usr/bin/chromium
else
  echo "ERROR: Could not find or create a valid Chromium executable"
fi

echo "Installation and verification complete" 