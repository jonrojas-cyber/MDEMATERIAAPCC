const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readAll(name) {
  const raw = fs.readFileSync(filePath(name), "utf-8");
  return JSON.parse(raw);
}

function writeAll(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

function findById(name, id) {
  return readAll(name).find((item) => item.id === id) || null;
}

function update(name, id, patch) {
  const items = readAll(name);
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch };
  writeAll(name, items);
  return items[idx];
}

function insert(name, item) {
  const items = readAll(name);
  items.push(item);
  writeAll(name, items);
  return item;
}

function nextId(prefix, name) {
  const items = readAll(name);
  const n = items.length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`;
}

module.exports = { readAll, writeAll, findById, update, insert, nextId, DATA_DIR };
