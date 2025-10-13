#!/usr/bin/env node

// Node.js script to update version numbers for cache busting
// Run this script after every commit to update version numbers

const fs = require('fs');
const { execSync } = require('child_process');

try {
  // Get current commit hash
  const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  
  console.log(`Updating version to commit: ${commitHash}`);

  // Update main.js
  let mainJsContent = fs.readFileSync('main.js', 'utf8');
  mainJsContent = mainJsContent.replace(
    /const STORAGE_VERSION = '[^']*';/,
    `const STORAGE_VERSION = '${commitHash}';`
  );
  mainJsContent = mainJsContent.replace(
    /\/\/ Current commit hash - update this on every commit/,
    '// Current commit hash - updated automatically'
  );
  fs.writeFileSync('main.js', mainJsContent);

  // Update index.html
  let indexContent = fs.readFileSync('index.html', 'utf8');
  indexContent = indexContent.replace(/\?v=[^"]*/g, `?v=${commitHash}`);
  fs.writeFileSync('index.html', indexContent);

  console.log(`Version updated successfully to: ${commitHash}`);
  console.log('Cache will be automatically cleared on next load.');

} catch (error) {
  console.error('Error updating version:', error.message);
  process.exit(1);
}
