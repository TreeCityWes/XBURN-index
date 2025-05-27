#!/bin/bash
set -e

echo "Fixing TypeScript errors in the codebase..."

# Fix duplicate identifiers in provider.ts (already done in deploy.sh)
if grep -q "NodeJS.Timeout" src/provider.ts; then
  echo "Fixing src/provider.ts..."
  sed -i 's/private healthCheckInterval: NodeJS.Timeout | null = null;/private healthCheckInterval: ReturnType<typeof setInterval> | null = null;/g' src/provider.ts
  sed -i '/declare global {/,/}/d' src/provider.ts
fi

# Fix duplicate identifiers in health.ts
if grep -q "declare global" src/indexer/health.ts; then
  echo "Fixing src/indexer/health.ts..."
  sed -i '/declare global {/,/}/d' src/indexer/health.ts
  sed -i 's/NodeJS\.Timeout/ReturnType<typeof setInterval>/g' src/indexer/health.ts
fi

# Fix eventName property issues in chain-indexer.ts
if grep -q "eventName" src/indexer/chain-indexer.ts; then
  echo "Fixing src/indexer/chain-indexer.ts..."
  
  # Create a backup
  cp src/indexer/chain-indexer.ts src/indexer/chain-indexer.ts.bak
  
  # Fix line 273 - modify the function to handle Log[] instead of expecting BlockEvent[]
  sed -i 's/\(processEvents(events: \)Log\[\]/\1any[]/' src/indexer/chain-indexer.ts
  
  # Add eventName property to Log objects before using them
  # This is a more complex change that might need manual editing
  # We'll try a simple approach first
  sed -i '/const events = filterLogs(logs, contractAddresses);/a \\n      // Add eventName property to Log objects\n      for (const event of events) {\n        if (!event.eventName && event.topics && event.topics.length > 0) {\n          event.eventName = event.topics[0]; // Use first topic as eventName\n        }\n      }' src/indexer/chain-indexer.ts
fi

# Fix rows property issues in health.ts
if grep -q "\.rows" src/indexer/health.ts; then
  echo "Fixing rows property access in health.ts..."
  sed -i 's/result\.rows/result?.rows || []/' src/indexer/health.ts
fi

echo "TypeScript errors fixed. You may still need to manually check some files."
echo "Try building the project with: npm run build" 