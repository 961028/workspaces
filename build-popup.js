// build-popup.js
// Simple build script to concatenate all popup/*.js files (except popup.js itself) into popup/popup.js
// Usage: node build-popup.js

const fs = require('fs');
const path = require('path');

const popupDir = path.join(__dirname, 'popup');
const outputFile = path.join(popupDir, 'popup.js');

// List files in the correct order for popup.js
const orderedFiles = [
  'constants.js',
  'dom.js',
  'import_export.js',
  'init.js',
  'state.js',
  'saved_ui.js',
  'unsaved_ui.js',
  'context_menu.js',
  'status.js',
  'theme.js',
  'drag.js',
  'drag_pointer.js',
  'popup_ui_helpers.js',
];

// Get all .js files in popup/, except popup.js itself
const allJsFiles = fs.readdirSync(popupDir)
  .filter(f => f.endsWith('.js') && f !== 'popup.js');

// Automatically include any new .js files in popup/ that are not in the list, at the end
const extraFiles = allJsFiles.filter(f => !orderedFiles.includes(f));
const files = [...orderedFiles.filter(f => allJsFiles.includes(f)), ...extraFiles];

if (files.length === 0) {
  console.error('No source files found in popup/ (checked order list).');
  process.exit(1);
}

let output = '';
for (const file of files) {
  const filePath = path.join(popupDir, file);
  output += `// ===== ${file} =====\n`;
  output += fs.readFileSync(filePath, 'utf8') + '\n\n';
}

fs.writeFileSync(outputFile, output);
console.log(`popup.js built from: ${files.join(', ')}`);
