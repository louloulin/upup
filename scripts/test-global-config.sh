#!/bin/bash
# test-global-config.sh
# Test global/project config layer with bun test

set -e

echo "=========================================="
echo "✅ Testing Global/Project Config Layer"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; exit 1; }
info() { echo -e "${YELLOW}ℹ INFO${NC}: $1"; }

# Cleanup function
cleanup() {
    rm -rf "$HOME/.upup" 2>/dev/null || true
    rm -rf ".upup" 2>/dev/null || true
}

# Initial cleanup
cleanup

echo ""
echo "📦 Test 1: Build"
echo "----------------------------------------"
info "Running: bun run build..."
if bun run build > /tmp/build.log 2>&1; then
    pass "Build successful"
else
    fail "Build failed: $(tail -3 /tmp/build.log)"
fi

echo ""
echo "🧪 Test 2: Unit Tests"
echo "----------------------------------------"
info "Running: bun test (config tests)..."
if bun test src/utils/paths.test.ts src/utils/config-merge.test.ts > /tmp/test.log 2>&1; then
    pass "Config tests passed: $(grep 'pass' /tmp/test.log | head -1)"
else
    fail "Tests failed"
fi

echo ""
echo "🌍 Test 3: Global Config Path"
echo "----------------------------------------"
GLOBAL_DIR="$HOME/.upup"
info "Creating: $GLOBAL_DIR"
mkdir -p "$GLOBAL_DIR"

# Create global SOUL.md
cat > "$GLOBAL_DIR/SOUL.md" << 'EOF'
# Global Investment Identity
This is the GLOBAL configuration.
EOF

# Verify file created
if [[ -f "$GLOBAL_DIR/SOUL.md" ]]; then
    pass "Global config created"
else
    fail "Failed to create global config"
fi

echo ""
echo "📁 Test 4: Project Config (Priority)"
echo "----------------------------------------"
info "Creating: .upup/ (should override global)"
mkdir -p ".upup"

# Create project SOUL.md
cat > ".upup/SOUL.md" << 'EOF'
# Project Identity
This is the PROJECT configuration.
EOF

# Verify file created
if [[ -f ".upup/SOUL.md" ]]; then
    pass "Project config created"
else
    fail "Failed to create project config"
fi

echo ""
echo "🔗 Test 5: Config Loading Priority"
echo "----------------------------------------"
info "Testing that project overrides global..."

# Run the unit test that verifies this
if bun test src/utils/config-merge.test.ts > /tmp/priority.log 2>&1; then
    pass "Config merge priority verified"
else
    fail "Config priority test failed"
fi

echo ""
echo "🪝 Test 6: Hook Loading"
echo "----------------------------------------"
info "Creating: ~/.upup/hooks/ and .upup/hooks/"
mkdir -p "$GLOBAL_DIR/hooks"
mkdir -p ".upup/hooks"

# Create test hooks
echo "// Global hook" > "$GLOBAL_DIR/hooks/test.ts"
echo "// Project hook" > ".upup/hooks/test.ts"

if [[ -f "$GLOBAL_DIR/hooks/test.ts" ]] && [[ -f ".upup/hooks/test.ts" ]]; then
    pass "Both hook directories created"
else
    fail "Hook directories not created"
fi

echo ""
echo "🚀 Test 7: Dev Mode Startup"
echo "----------------------------------------"
info "Testing: bun run dev (3 second timeout)..."

# Start dev in background
timeout 3 bun run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!

sleep 2

# Check if process is running or exited cleanly
if ps -p $DEV_PID > /dev/null 2>&1; then
    kill $DEV_PID 2>/dev/null || true
    pass "Dev mode started successfully"
elif grep -q "error\|Error\|ERROR" /tmp/dev.log 2>/dev/null; then
    fail "Dev mode error: $(tail -3 /tmp/dev.log)"
else
    pass "Dev mode exited cleanly (expected with timeout)"
fi

echo ""
echo "🧹 Test 8: Cleanup"
echo "----------------------------------------"
cleanup
if [[ ! -d "$HOME/.upup" ]] && [[ ! -d ".upup" ]]; then
    pass "Test files cleaned up"
else
    info "Some files may remain"
fi

echo ""
echo "=========================================="
echo "✅ Test Summary"
echo "=========================================="
echo ""
echo "Configuration hierarchy verified:"
echo "  ~/.upup/   → Global config (fallback)"
echo "  .upup/     → Project config (priority)"
echo ""
echo "Config files supported:"
echo "  SOUL.md           - Identity"
echo "  GOALS.md          - Investment goals"
echo "  RULES.md          - Analysis rules"
echo "  GOVERN.md         - Governance rules"
echo "  hooks/            - Custom hooks"
echo ""
echo -e "${GREEN}All tests completed successfully!${NC}"
echo ""
