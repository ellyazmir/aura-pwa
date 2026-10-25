/**
 * ProgressStore — persists Progress_Records in IndexedDB via the `idb` wrapper.
 *
 * Design (see design.md §5):
 *  - Database: `aura-progress` v1
 *  - Object store: `records` — keyPath `id` (auto-increment), indexed on `topic`
 *  - Eviction: before each write, if `records.count() >= 10000` the record with
 *    the lowest `id` (oldest) is deleted (FIFO), keeping the store bounded.
 *  - Summary: aggregates per topic → totalAttempts, firstAttemptCorrect,
 *    accuracyPercent = round((firstAttemptCorrect / totalAttempts) * 1000) / 10.
 *
 * Storage availability (Requirement 7.5): when IndexedDB is unavailable (e.g.
 * private-mode restrictions, disabled storage), writes/reads degrade gracefully.
 * `isStorageAvailable()` exposes a non-blocking signal so the UI can show
 * "Progress cannot be saved on this device" and continue to allow tutoring and
 * practice without persistence.
 *
 * @module progress/progressStore
 */

import { openDB } from 'idb';

/** @typedef {import('../types.js').ExerciseResult} ExerciseResult */
/** @typedef {import('../types.js').TopicSummary} TopicSummary */
/** @typedef {import('../types.js').CurriculumLevel} CurriculumLevel */

export const DB_NAME = 'aura-progress';
export const DB_VERSION = 1;
export const STORE_NAME = 'records';
export const TOPIC_INDEX = 'topic';

/** Maximum number of Progress_Records retained before FIFO eviction (Req 7.6). */
export const MAX_RECORDS = 10000;

/**
 * Cached database connection promise. Resolves to an `IDBPDatabase`, or to
 * `null` when IndexedDB is unavailable on this device.
 * @type {Promise<import('idb').IDBPDatabase|null>|null}
 */
let dbPromise = null;

/**
 * Non-blocking flag describing whether persistent storage is usable. Starts
 * optimistic (`true`) and flips to `false` the first time an open attempt fails
 * or IndexedDB is found to be missing.
 * @type {boolean}
 */
let storageAvailable = true;

/**
 * @returns {boolean} true when Progress_Records can be persisted on this device.
 * When false, the UI should surface the non-blocking "Progress cannot be saved
 * on this device" message (Requirement 7.5) and continue without persistence.
 */
export function isStorageAvailable() {
  return storageAvailable;
}

/**
 * Open (or reuse) the `aura-progress` database. Resolves to `null` — never
 * throws — when IndexedDB is unavailable, so callers can degrade gracefully.
 * @returns {Promise<import('idb').IDBPDatabase|null>}
 */
function getDB() {
  if (dbPromise) return dbPromise;

  // Detect a usable IndexedDB implementation (absent under some jsdom/private
  // contexts). `indexedDB` may be undefined or throw on access.
  let idbFactory;
  try {
    idbFactory = typeof indexedDB !== 'undefined' ? indexedDB : undefined;
  } catch {
    idbFactory = undefined;
  }

  if (!idbFactory) {
    storageAvailable = false;
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex(TOPIC_INDEX, 'topic', { unique: false });
      }
    },
  }).then(
    (db) => {
      storageAvailable = true;
      return db;
    },
    () => {
      // Open failed — mark storage unavailable and resolve to null so writes
      // and reads become no-ops rather than rejecting.
      storageAvailable = false;
      return null;
    }
  );

  return dbPromise;
}

/**
 * Persist a single Exercise result (Requirement 7.1, 7.3).
 *
 * Before writing, enforces the FIFO cap (Requirement 7.6): if the store already
 * holds `MAX_RECORDS` or more records, the oldest (lowest `id`) records are
 * evicted so that the post-insertion count never exceeds `MAX_RECORDS`.
 *
 * When storage is unavailable this resolves without error (non-blocking), and
 * `isStorageAvailable()` will report `false`.
 *
 * @param {ExerciseResult} result - the result to record. `id` is assigned by the
 *   auto-increment store and should be omitted by callers.
 * @returns {Promise<void>}
 */
export async function recordExerciseResult(result) {
  const db = await getDB();
  if (!db) return; // storage unavailable — degrade gracefully

  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // FIFO eviction: keep room for the incoming record so the final count stays
  // at or below MAX_RECORDS. Evict from the lowest key upward.
  let count = await store.count();
  while (count >= MAX_RECORDS) {
    const oldestKey = await firstKey(store);
    if (oldestKey === undefined) break;
    await store.delete(oldestKey);
    count -= 1;
  }

  // Strip any caller-supplied `id` so auto-increment assigns a fresh, monotonic key.
  const { id: _ignored, ...record } = result ?? {};
  await store.add(record);

  await tx.done;
}

/**
 * Return the smallest (oldest) key currently in the store, or `undefined` when
 * the store is empty.
 * @param {import('idb').IDBPObjectStore} store
 * @returns {Promise<IDBValidKey|undefined>}
 */
async function firstKey(store) {
  const cursor = await store.openKeyCursor();
  return cursor ? cursor.key : undefined;
}

/**
 * Aggregate stored Progress_Records into per-topic summaries (Requirement 7.2).
 *
 * For each topic: `totalAttempts` counts every recorded result, and
 * `firstAttemptCorrect` counts results that were both `correct` and on the
 * student's `firstAttempt`. `accuracyPercent` is the first-attempt accuracy rate
 * `(firstAttemptCorrect / totalAttempts) × 100` rounded to one decimal place via
 * `Math.round((firstAttemptCorrect / totalAttempts) * 1000) / 10`.
 *
 * The `curriculumLevel` reported for a topic is taken from the most recently
 * recorded result for that topic.
 *
 * @returns {Promise<TopicSummary[]>} one summary per distinct topic; empty when
 *   there are no records or storage is unavailable.
 */
export async function getSummary() {
  const db = await getDB();
  if (!db) return [];

  const records = await db.getAll(STORE_NAME);

  /** @type {Map<string, { topic: string, curriculumLevel: CurriculumLevel, totalAttempts: number, firstAttemptCorrect: number }>} */
  const byTopic = new Map();

  for (const r of records) {
    let agg = byTopic.get(r.topic);
    if (!agg) {
      agg = {
        topic: r.topic,
        curriculumLevel: r.curriculumLevel,
        totalAttempts: 0,
        firstAttemptCorrect: 0,
      };
      byTopic.set(r.topic, agg);
    }
    agg.totalAttempts += 1;
    if (r.correct && r.firstAttempt) {
      agg.firstAttemptCorrect += 1;
    }
    // Keep the latest seen curriculum level for the topic (records are returned
    // in ascending key / insertion order).
    agg.curriculumLevel = r.curriculumLevel;
  }

  return Array.from(byTopic.values()).map((agg) => ({
    topic: agg.topic,
    curriculumLevel: agg.curriculumLevel,
    totalAttempts: agg.totalAttempts,
    firstAttemptCorrect: agg.firstAttemptCorrect,
    accuracyPercent: accuracyPercent(agg.firstAttemptCorrect, agg.totalAttempts),
  }));
}

/**
 * First-attempt accuracy as a percentage rounded to one decimal place.
 * Returns 0 when there are no attempts (avoids division by zero / NaN).
 * @param {number} firstAttemptCorrect
 * @param {number} totalAttempts
 * @returns {number}
 */
export function accuracyPercent(firstAttemptCorrect, totalAttempts) {
  if (!totalAttempts) return 0;
  return Math.round((firstAttemptCorrect / totalAttempts) * 1000) / 10;
}

/**
 * Delete all stored Progress_Records (Requirement 7.4). Resolves without error
 * when storage is unavailable.
 * @returns {Promise<void>}
 */
export async function clearAll() {
  const db = await getDB();
  if (!db) return;
  await db.clear(STORE_NAME);
}

/**
 * Reset the cached connection and availability flag. Intended for tests that
 * swap the global IndexedDB implementation (e.g. fake-indexeddb) between cases.
 * @returns {Promise<void>}
 */
export async function _resetForTests() {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      if (db) db.close();
    } catch {
      /* ignore */
    }
  }
  dbPromise = null;
  storageAvailable = true;
}
