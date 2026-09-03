import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'data');
const JSON_BACKUP_PATH = path.join(DB_DIR, 'learning_knowledge.json');
const SQLITE_PATH = path.join(DB_DIR, 'learning_db.sqlite');

let db = null;
let isSqlite = false;

// InMemory store when SQLite is not available or fallback
let inMemory = {
  cases: [],
  user_knowledge: [],
};

function loadJsonBackup() {
  try {
    if (fs.existsSync(JSON_BACKUP_PATH)) {
      const data = JSON.parse(fs.readFileSync(JSON_BACKUP_PATH, 'utf8'));
      if (Array.isArray(data.cases)) inMemory.cases = data.cases;
      if (Array.isArray(data.user_knowledge)) inMemory.user_knowledge = data.user_knowledge;
    }
  } catch (e) {
    console.warn('Could not read JSON backup:', e.message);
  }
}

function saveJsonBackup() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(JSON_BACKUP_PATH, JSON.stringify(inMemory, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not write JSON backup:', e.message);
  }
}

export function initDatabase() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  loadJsonBackup();

  try {
    // Check for native node:sqlite
    const sqliteModule = awaitImportSqlite();
    if (sqliteModule) {
      db = new sqliteModule.DatabaseSync(SQLITE_PATH);
      isSqlite = true;

      db.exec(`
        CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY,
          symptom TEXT,
          system TEXT,
          findings_json TEXT,
          root_causes_json TEXT,
          user_confirmed INTEGER DEFAULT 0,
          user_feedback TEXT DEFAULT '',
          created_at TEXT,
          updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS user_knowledge (
          id TEXT PRIMARY KEY,
          title TEXT,
          symptom_trigger TEXT,
          root_cause TEXT,
          solution TEXT,
          part_code TEXT,
          created_at TEXT
        );
      `);

      // Sync initial data if sqlite is empty but json backup exists
      const countStmt = db.prepare('SELECT COUNT(*) as c FROM user_knowledge');
      const res = countStmt.get();
      if (res && res.c === 0 && inMemory.user_knowledge.length > 0) {
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO user_knowledge (id, title, symptom_trigger, root_cause, solution, part_code, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of inMemory.user_knowledge) {
          insertStmt.run(item.id, item.title, item.symptom_trigger, item.root_cause, item.solution, item.part_code || '', item.created_at);
        }
      }
      console.log('Database initialized: SQLite storage active at', SQLITE_PATH);
      return;
    }
  } catch (e) {
    console.warn('SQLite init fallback to structured JSON:', e.message);
  }

  console.log('Database initialized: JSON storage active at', JSON_BACKUP_PATH);
}

function awaitImportSqlite() {
  try {
    const { createRequire } = require('node:module');
    const req = createRequire(import.meta.url);
    return req('node:sqlite');
  } catch {
    return null;
  }
}

// ---------------------------------------------------- CASES
export function saveCase(caseData) {
  const now = new Date().toISOString();
  const item = {
    id: caseData.id || crypto.randomUUID(),
    symptom: caseData.symptom || '',
    system: caseData.system || '',
    findings_json: JSON.stringify(caseData.findings || []),
    root_causes_json: JSON.stringify(caseData.root_causes || []),
    user_confirmed: caseData.user_confirmed ? 1 : 0,
    user_feedback: caseData.user_feedback || '',
    created_at: caseData.created_at || now,
    updated_at: now,
  };

  if (isSqlite && db) {
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO cases (id, symptom, system, findings_json, root_causes_json, user_confirmed, user_feedback, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(item.id, item.symptom, item.system, item.findings_json, item.root_causes_json, item.user_confirmed, item.user_feedback, item.created_at, item.updated_at);
    } catch (e) {
      console.warn('SQLite saveCase error:', e.message);
    }
  }

  const idx = inMemory.cases.findIndex((c) => c.id === item.id);
  if (idx >= 0) inMemory.cases[idx] = item;
  else inMemory.cases.unshift(item);
  saveJsonBackup();

  return item;
}

export function updateCaseFeedback(id, { user_confirmed, user_feedback, root_cause }) {
  const now = new Date().toISOString();
  const confirmed = user_confirmed ? 1 : 0;
  const feedback = user_feedback || '';

  if (isSqlite && db) {
    try {
      const stmt = db.prepare(`
        UPDATE cases
        SET user_confirmed = ?, user_feedback = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(confirmed, feedback, now, id);
    } catch (e) {
      console.warn('SQLite updateCaseFeedback error:', e.message);
    }
  }

  const c = inMemory.cases.find((item) => item.id === id);
  if (c) {
    c.user_confirmed = confirmed;
    c.user_feedback = feedback;
    c.updated_at = now;
    saveJsonBackup();
  }
}

export function getAllCases(limit = 30) {
  if (isSqlite && db) {
    try {
      const stmt = db.prepare('SELECT * FROM cases ORDER BY updated_at DESC LIMIT ?');
      return stmt.all(limit).map(formatCaseRow);
    } catch (e) {
      console.warn('SQLite getAllCases error:', e.message);
    }
  }
  return inMemory.cases.slice(0, limit).map(formatCaseRow);
}

function formatCaseRow(row) {
  return {
    ...row,
    findings: safeParse(row.findings_json, []),
    root_causes: safeParse(row.root_causes_json, []),
  };
}

function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ---------------------------------------------------- USER KNOWLEDGE
export function addUserKnowledge({ title, symptom_trigger, root_cause, solution, part_code }) {
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    title: (title || '').trim(),
    symptom_trigger: (symptom_trigger || '').trim(),
    root_cause: (root_cause || '').trim(),
    solution: (solution || '').trim(),
    part_code: (part_code || '').trim(),
    created_at: now,
  };

  if (isSqlite && db) {
    try {
      const stmt = db.prepare(`
        INSERT INTO user_knowledge (id, title, symptom_trigger, root_cause, solution, part_code, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(item.id, item.title, item.symptom_trigger, item.root_cause, item.solution, item.part_code, item.created_at);
    } catch (e) {
      console.warn('SQLite addUserKnowledge error:', e.message);
    }
  }

  inMemory.user_knowledge.unshift(item);
  saveJsonBackup();
  return item;
}

export function getUserKnowledgeList() {
  if (isSqlite && db) {
    try {
      const stmt = db.prepare('SELECT * FROM user_knowledge ORDER BY created_at DESC');
      return stmt.all();
    } catch (e) {
      console.warn('SQLite getUserKnowledgeList error:', e.message);
    }
  }
  return inMemory.user_knowledge;
}

export function deleteUserKnowledge(id) {
  if (isSqlite && db) {
    try {
      const stmt = db.prepare('DELETE FROM user_knowledge WHERE id = ?');
      stmt.run(id);
    } catch (e) {
      console.warn('SQLite deleteUserKnowledge error:', e.message);
    }
  }
  inMemory.user_knowledge = inMemory.user_knowledge.filter((k) => k.id !== id);
  saveJsonBackup();
  return true;
}

// ---------------------------------------------------- LEARNING RETRIEVAL (RAG)
export function findLearnedMemory(symptom, system, partCode) {
  const learned = [];
  const words = (symptom || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // 1. Check User Knowledge entries
  const allKnowledge = getUserKnowledgeList();
  for (const k of allKnowledge) {
    let score = 0;
    const hay = `${k.title} ${k.symptom_trigger} ${k.part_code} ${k.root_cause}`.toLowerCase();
    if (partCode && k.part_code && k.part_code.toLowerCase().includes(partCode.toLowerCase())) score += 5;
    for (const w of words) {
      if (hay.includes(w)) score += 2;
    }
    if (score > 0) {
      learned.push({
        type: 'تجربه کاربر (ثبت‌شده در دیتابیس)',
        title: k.title,
        symptom_match: k.symptom_trigger,
        learned_root_cause: k.root_cause,
        learned_solution: k.solution,
        part_code: k.part_code,
        score,
      });
    }
  }

  // 2. Check Confirmed Past Cases in DB
  const cases = getAllCases(100);
  for (const c of cases) {
    if (!c.user_confirmed && !c.user_feedback) continue;
    let score = 0;
    const hay = `${c.symptom} ${c.system} ${c.user_feedback}`.toLowerCase();
    for (const w of words) {
      if (hay.includes(w)) score += 2;
    }
    if (c.user_confirmed) score += 3;
    if (score >= 3) {
      const bestCause = c.root_causes?.[0]?.cause || c.user_feedback;
      learned.push({
        type: 'پرونده تاییدشده پیشین در دیتابیس',
        title: c.symptom,
        symptom_match: c.symptom,
        learned_root_cause: bestCause,
        learned_solution: c.user_feedback || 'تایید شده توسط تکنسین در پرونده‌های قبلی',
        score,
      });
    }
  }

  learned.sort((a, b) => b.score - a.score);
  return learned.slice(0, 5);
}

export function getDbStats() {
  return {
    total_cases: inMemory.cases.length,
    confirmed_cases: inMemory.cases.filter((c) => c.user_confirmed).length,
    user_knowledge_count: inMemory.user_knowledge.length,
  };
}
