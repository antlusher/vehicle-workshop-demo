const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'data');

function ensureDataFile(fileName, defaultValue) {
  const fullPath = path.join(baseDir, fileName);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, JSON.stringify(defaultValue, null, 2));
  }
  return fullPath;
}

function loadData(fileName, defaultValue = []) {
  const fullPath = ensureDataFile(fileName, defaultValue);
  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(raw || 'null') || defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

function saveData(fileName, data) {
  const fullPath = path.join(baseDir, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

module.exports = {
  loadData,
  saveData,
};
