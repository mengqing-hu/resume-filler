// @ts-check

import {
  SCHEMA_VERSION,
  createDefaultResume,
  isResume,
} from "./schema.js";

const ACTIVE_RESUME_ID_KEY = "activeResumeId";
const RESUME_ORDER_KEY = "resumeOrder";
const SCHEMA_VERSION_KEY = "schemaVersion";
const RESUME_KEY_PREFIX = "resume:";

/**
 * @typedef {object} StorageArea
 * @property {(keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>} get
 * @property {(items: Record<string, unknown>) => Promise<void>} set
 * @property {(keys: string | string[]) => Promise<void>} remove
 */

/** @typedef {import("./schema.js").Resume} Resume */

/**
 * 初始化存储并返回当前简历。已有有效数据时不会覆盖用户内容。
 *
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume>}
 */
export async function initializeStorage(storageArea = chrome.storage.local) {
  const rootData = await storageArea.get([
    SCHEMA_VERSION_KEY,
    ACTIVE_RESUME_ID_KEY,
    RESUME_ORDER_KEY,
  ]);

  const storedSchemaVersion = rootData[SCHEMA_VERSION_KEY];

  if (
    typeof storedSchemaVersion === "number" &&
    storedSchemaVersion > SCHEMA_VERSION
  ) {
    throw new Error("本地数据版本高于当前扩展支持的版本。");
  }

  const candidateIds = collectCandidateIds(rootData);

  for (const resumeId of candidateIds) {
    const resume = await getResumeById(resumeId, storageArea);

    if (resume !== null) {
      const normalizedOrder = [
        resume.id,
        ...candidateIds.filter((id) => id !== resume.id),
      ];
      /** @type {Record<string, unknown>} */
      const rootUpdates = {};

      if (storedSchemaVersion !== SCHEMA_VERSION) {
        rootUpdates[SCHEMA_VERSION_KEY] = SCHEMA_VERSION;
      }

      if (rootData[ACTIVE_RESUME_ID_KEY] !== resume.id) {
        rootUpdates[ACTIVE_RESUME_ID_KEY] = resume.id;
      }

      if (!areStringArraysEqual(rootData[RESUME_ORDER_KEY], normalizedOrder)) {
        rootUpdates[RESUME_ORDER_KEY] = normalizedOrder;
      }

      if (Object.keys(rootUpdates).length > 0) {
        await storageArea.set(rootUpdates);
      }

      return resume;
    }
  }

  const resume = createDefaultResume();

  await storageArea.set({
    [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
    [ACTIVE_RESUME_ID_KEY]: resume.id,
    [RESUME_ORDER_KEY]: [resume.id],
    [getResumeStorageKey(resume.id)]: resume,
  });

  return resume;
}

/**
 * 读取当前使用的简历；首次使用时自动创建默认简历。
 *
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume>}
 */
export async function getActiveResume(storageArea = chrome.storage.local) {
  return initializeStorage(storageArea);
}

/**
 * 保存完整简历并更新时间。
 *
 * @param {Resume} resume
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume>}
 */
export async function saveResume(resume, storageArea = chrome.storage.local) {
  if (!isResume(resume)) {
    throw new TypeError("无法保存格式不正确的简历数据。");
  }

  const savedResume = {
    ...resume,
    updatedAt: Date.now(),
  };

  await storageArea.set({
    [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
    [ACTIVE_RESUME_ID_KEY]: savedResume.id,
    [getResumeStorageKey(savedResume.id)]: savedResume,
  });

  return savedResume;
}

/**
 * 生成单份简历对应的存储键。
 *
 * @param {string} resumeId
 * @returns {string}
 */
export function getResumeStorageKey(resumeId) {
  return `${RESUME_KEY_PREFIX}${resumeId}`;
}

/**
 * @param {string} resumeId
 * @param {StorageArea} storageArea
 * @returns {Promise<Resume | null>}
 */
async function getResumeById(resumeId, storageArea) {
  const storageKey = getResumeStorageKey(resumeId);
  const storedResume = (await storageArea.get(storageKey))[storageKey];
  return isResume(storedResume) ? storedResume : null;
}

/**
 * @param {Record<string, unknown>} rootData
 * @returns {string[]}
 */
function collectCandidateIds(rootData) {
  const activeResumeId = rootData[ACTIVE_RESUME_ID_KEY];
  const resumeOrder = rootData[RESUME_ORDER_KEY];
  const candidateIds = [];

  if (typeof activeResumeId === "string") {
    candidateIds.push(activeResumeId);
  }

  if (Array.isArray(resumeOrder)) {
    for (const resumeId of resumeOrder) {
      if (
        typeof resumeId === "string" &&
        !candidateIds.includes(resumeId)
      ) {
        candidateIds.push(resumeId);
      }
    }
  }

  return candidateIds;
}

/**
 * @param {unknown} value
 * @param {string[]} expected
 * @returns {boolean}
 */
function areStringArraysEqual(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}
