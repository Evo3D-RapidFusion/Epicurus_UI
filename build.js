#!/usr/bin/env node

// Build script to automate cache busting
// Run this script to update cache-busting parameters

const fs = require('fs');
const path = require('path');

// Generate timestamp for cache busting
const timestamp = Date.now();
const version = `v3.2-${timestamp}`;

console.log(`Building with version: ${version}`);

try {
  // Update index.html with timestamp-based cache busting
  let indexContent = fs.readFileSync('index.html', 'utf8');
  
  // Replace all ?v=auto with ?v=timestamp
  indexContent = indexContent.replace(/\?v=auto/g, `?v=${timestamp}`);
  
  fs.writeFileSync('index.html', indexContent);
  
  console.log('✅ Cache-busting parameters updated');
  console.log('✅ Build complete');
  console.log(`📦 Version: ${version}`);
  console.log('🚀 Ready to deploy - cache will clear automatically');

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
