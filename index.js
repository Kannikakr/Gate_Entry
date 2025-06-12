
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const PORT = 4000;
const FILE_NAME = 'gate_register.xlsx';

app.use(bodyParser.json());
app.use(express.static(__dirname));

// Utility Functions
const getCurrentTime = () => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const getCurrentDate = () => new Date().toISOString().split('T')[0];

const generateDateColumns = () => {
  const start = new Date('2025-06-01');
  const end = new Date('2025-06-30');
  const dates = [];
  while (start <= end) {
    dates.push(start.toISOString().split('T')[0]);
    start.setDate(start.getDate() + 1);
  }
  return dates;
};

const initSheet = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Model', 'Serial Number', 'UniqueID', ...generateDateColumns()]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, FILE_NAME);
};

const loadSheet = () => {
  if (!fs.existsSync(FILE_NAME)) initSheet();
  const wb = XLSX.readFile(FILE_NAME);
  const ws = wb.Sheets['Sheet1'];
  return { wb, ws };
};

const saveSheet = (wb) => XLSX.writeFile(wb, FILE_NAME);

const getColIndex = (ws, header) => {
  const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
  return headers.indexOf(header);
};

const findRowByNameAndSerial = (ws, name, serial) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === name && rows[i][2] === serial) return { index: i + 1, id: rows[i][3] };
  }
  return null;
};

const getRowByUniqueID = (ws, uniqueId) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][3] === uniqueId) return i + 1;
  }
  return -1;
};

const createUniqueID = (name, serial, existingIds = []) => {
  let baseId = name.slice(0, 3).toUpperCase() + serial.slice(-3);
  let uniqueId = baseId;
  let counter = 1;
  while (existingIds.includes(uniqueId)) {
    uniqueId = `${baseId}${counter++}`;
  }
  return uniqueId;
};

// Submit Route
app.post('/submit', (req, res) => {
  const { name, model, serial, uniqueId, type } = req.body;
  const { wb, ws } = loadSheet();

  const date = getCurrentDate();
  const time = getCurrentTime();
  const dateColIndex = getColIndex(ws, date);
  if (dateColIndex === -1) return res.status(500).send('Date column missing');

  if (type === 'reregister_checkin') {
    const rowIndex = getRowByUniqueID(ws, uniqueId);
    if (rowIndex === -1) return res.status(404).send('Unique ID not found');

    const cellAddress = XLSX.utils.encode_cell({ c: dateColIndex, r: rowIndex - 1 });
    const cellValue = ws[cellAddress]?.v || '';
    const logs = cellValue.split('\n').map(line => line.trim()).filter(Boolean);
    const lastLine = logs[logs.length - 1];

    if (lastLine?.startsWith('Check-in')) {
      return res.status(400).send('Already checked in. Please check out first.');
    }

    const newLog = cellValue ? `${cellValue}\nCheck-in: ${time}` : `Check-in: ${time}`;
    ws[cellAddress] = { v: newLog };
    saveSheet(wb);
  return res.status(200).send(`Checked in at ${time}. Your ID is ${uniqueId}`);

  //   return res.status(200).json({ message: `Checked in at ${time}`, uniqueId });
  }

  if (type === 'reregister_checkout') {
    const rowIndex = getRowByUniqueID(ws, uniqueId);
    if (rowIndex === -1) return res.status(404).send('Unique ID not found');

    const cellAddress = XLSX.utils.encode_cell({ c: dateColIndex, r: rowIndex - 1 });
    const cellValue = ws[cellAddress]?.v || '';
    const logs = cellValue.split('\n').map(line => line.trim()).filter(Boolean);
    const lastLine = logs[logs.length - 1];

    if (!lastLine?.startsWith('Check-in')) {
      return res.status(400).send('No valid check-in found to check out.');
    }

    const newLog = `${cellValue}\nCheck-out: ${time}`;
    ws[cellAddress] = { v: newLog };
    saveSheet(wb);
    return res.status(200).send(`Checked out at ${time}. Your ID is ${uniqueId}`);
  //  return res.status(200).json({ message: `Checked out at ${time}`, uniqueId });
  }

  // New Registration or First Check-In
  let id = uniqueId;
  let rowIndex;

  if (!id) {
    const result = findRowByNameAndSerial(ws, name, serial);
    if (result) {
      id = result.id;
      rowIndex = result.index;
    } else {
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const existingIds = allRows.slice(1).map(r => r[3]);
      id = createUniqueID(name, serial, existingIds);
      rowIndex = allRows.length + 1;
      const userRow = [name, model, serial, id];
      XLSX.utils.sheet_add_aoa(ws, [userRow], { origin: `A${rowIndex}` });
    }
  } else {
    rowIndex = getRowByUniqueID(ws, id);
    if (rowIndex === -1) return res.status(400).send('Unique ID not found');
  }
const cellAddress = XLSX.utils.encode_cell({ c: dateColIndex, r: rowIndex - 1 });
let cellValue = ws[cellAddress]?.v || '';

if (type === 'checkin') {
  const logs = cellValue.split('\n').map(line => line.trim()).filter(Boolean);
  const lastLine = logs[logs.length - 1];

  if (lastLine?.startsWith('Check-in') && !logs.some(line => line.startsWith('Check-out'))) {
    return res.status(400).send('Already checked in. Please check out before checking in again.');
  }

  const newValue = cellValue ? `${cellValue}\nCheck-in: ${time}` : `Check-in: ${time}`;
  ws[cellAddress] = { v: newValue };
  saveSheet(wb);
  return res.status(200).send(`Checked in at ${time}. Your ID is ${id}`);
}

  // const cellAddress = XLSX.utils.encode_cell({ c: dateColIndex, r: rowIndex - 1 });
  // const cellValue = ws[cellAddress]?.v || '';

  // if (type === 'checkin') {
  //   if (cellValue.includes('Check-in') && !cellValue.includes('Check-out')) {
  //     return res.status(400).send('Already checked in. Please check out before checking in again.');
  //   }
  //   const newValue = cellValue ? `${cellValue}\nCheck-in: ${time}` : `Check-in: ${time}`;
  //   ws[cellAddress] = { v: newValue };
  //   saveSheet(wb);
  //   return res.status(200).send(`Checked in at ${time}. Your ID is ${id}`);
  //   // return res.status(200).json({ message: `Checked in at ${time}`, uniqueId: id });
  // }

  if (type === 'checkout') {
    if (!cellValue.includes('Check-in')) {
      return res.status(400).send('No check-in found for today.');
    }
    if (cellValue.includes('Check-out')) {
      return res.status(400).send('Already checked out.');
    }
    ws[cellAddress] = { v: `${cellValue}\nCheck-out: ${time}` };
    saveSheet(wb);
  return res.status(200).send(`Checked out at ${time}. Your ID is ${id}`);
  
  //   return res.status(200).json({ message: `Checked out at ${time}`, uniqueId: id });
  }

  return res.status(400).send('Invalid request type.');
});

// Search Route
app.get('/searchByNameAndSerial', (req, res) => {
  const { name, serial } = req.query;
  const { ws } = loadSheet();
  const result = findRowByNameAndSerial(ws, name, serial);
  if (!result) return res.status(404).json({ error: 'No matching records found.' });
  return res.json({ UniqueID: result.id });
});

// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
