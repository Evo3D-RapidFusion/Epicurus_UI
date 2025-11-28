const https = require('https');
const fs = require('fs');
const path = require('path');

// Roboto font weights and styles we need
const fontWeights = [
  { weight: 100, name: 'Thin' },
  { weight: 300, name: 'Light' },
  { weight: 400, name: 'Regular' },
  { weight: 500, name: 'Medium' },
  { weight: 700, name: 'Bold' },
  { weight: 900, name: 'Black' }
];

// Google Fonts API URLs for Roboto
const baseUrl = 'https://fonts.gstatic.com/s/roboto/v30/';

// Font file mappings - these are the actual file names from Google Fonts
const fontFiles = {
  'Thin': {
    woff2: 'KFOkCnqEu92Fr1MmgVxIIzI.woff2',
    woff: 'KFOkCnqEu92Fr1MmgVxIIzI.woff'
  },
  'Light': {
    woff2: 'KFOlCnqEu92Fr1MmSU5fBBc4.woff2',
    woff: 'KFOlCnqEu92Fr1MmSU5fBBc4.woff'
  },
  'Regular': {
    woff2: 'KFOmCnqEu92Fr1Mu4mxK.woff2',
    woff: 'KFOmCnqEu92Fr1Mu4mxK.woff'
  },
  'Medium': {
    woff2: 'KFOlCnqEu92Fr1MmEU9fBBc4.woff2',
    woff: 'KFOlCnqEu92Fr1MmEU9fBBc4.woff'
  },
  'Bold': {
    woff2: 'KFOlCnqEu92Fr1MmWUlfBBc4.woff2',
    woff: 'KFOlCnqEu92Fr1MmWUlfBBc4.woff'
  },
  'Black': {
    woff2: 'KFOlCnqEu92Fr1MmYUtfBBc4.woff2',
    woff: 'KFOlCnqEu92Fr1MmYUtfBBc4.woff'
  }
};

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        file.close();
        fs.unlinkSync(filepath);
        downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlinkSync(filepath);
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

async function downloadFonts() {
  const fontsDir = __dirname;
  let downloaded = 0;
  let failed = 0;

  console.log('Downloading Roboto fonts...\n');

  for (const font of fontWeights) {
    const fontName = font.name;
    const files = fontFiles[fontName];
    
    if (!files) {
      console.log(`⚠️  No file mapping for ${fontName}, skipping...`);
      continue;
    }

    // Download woff2
    const woff2Url = baseUrl + files.woff2;
    const woff2Path = path.join(fontsDir, `Roboto-${fontName}.woff2`);
    
    try {
      console.log(`Downloading Roboto-${fontName}.woff2...`);
      await downloadFile(woff2Url, woff2Path);
      console.log(`✓ Downloaded Roboto-${fontName}.woff2`);
      downloaded++;
    } catch (err) {
      console.error(`✗ Failed to download Roboto-${fontName}.woff2: ${err.message}`);
      failed++;
    }

    // Download woff
    const woffUrl = baseUrl + files.woff;
    const woffPath = path.join(fontsDir, `Roboto-${fontName}.woff`);
    
    try {
      console.log(`Downloading Roboto-${fontName}.woff...`);
      await downloadFile(woffUrl, woffPath);
      console.log(`✓ Downloaded Roboto-${fontName}.woff`);
      downloaded++;
    } catch (err) {
      console.error(`✗ Failed to download Roboto-${fontName}.woff: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Download complete!`);
  console.log(`   Downloaded: ${downloaded} files`);
  if (failed > 0) {
    console.log(`   Failed: ${failed} files`);
  }
}

// Run the download
downloadFonts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

