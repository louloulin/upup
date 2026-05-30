#!/bin/bash
# Appscript Test Script - Test app integration

echo "========================================="
echo "Appscript Integration Test"
echo "========================================="

# Test 1: Check if upup binary exists
echo ""
echo "[Test 1] Checking upup binary..."
if [ -f "dist/upup" ]; then
    echo "✅ dist/upup exists"
    ls -la dist/upup
else
    echo "❌ dist/upup not found"
fi

# Test 2: Check version
echo ""
echo "[Test 2] Testing upup version..."
./dist/upup --version 2>&1 || echo "Version check failed"

# Test 3: Check help
echo ""
echo "[Test 3] Testing upup help..."
./dist/upup --help 2>&1 | head -30

# Test 4: Check config commands
echo ""
echo "[Test 4] Testing config commands..."
./dist/upup config list 2>&1 | head -20

echo ""
echo "========================================="
echo "Appscript test complete"
echo "========================================="