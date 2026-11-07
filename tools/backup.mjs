import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
const source = path.resolve(import.meta.dirname, '../backend/data/whiteboard.sqlite');
const destination = process.argv[2] && path.resolve(process.argv[2]);
if (!destination || !fs.existsSync(source) || fs.existsSync(destination)) {
  console.error('Usage: node tools/backup.mjs <new-backup-file>; source must exist and destination must be new.');
  process.exitCode = 1;
} else {
  const db = new DatabaseSync(source);
  try {
    db.prepare('VACUUM INTO ?').run(destination);
    console.log('Created a consistent SQLite backup.');
  } finally {
    db.close();
  }
}
