#!/bin/bash
# Test script to verify skill command execution via upup

echo "========================================="
echo "Testing skill command execution"
echo "========================================="

# Test 1: Check if a-share-fund is registered
echo ""
echo "[Test 1] Check skill registry..."
echo 'console.log("Skills:", require("./src/skills/commands.js").initializeSkills().then(() => require("./src/skills/slash-command.js").getSkillCommandRegistry().getAllSkillCommands().map(c => c.name).filter(n => n.includes("share"))));' | bun run -

# Test 2: Run the skill execution test
echo ""
echo "[Test 2] Run skill execution test..."
bun run scripts/test-skill-execution.ts 2>&1 | head -50

echo ""
echo "========================================="
echo "Test complete"
echo "========================================="