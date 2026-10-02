// @ts-check

import {
  SCHEMA_VERSION,
  cloneResume,
  createDefaultResume,
} from "./schema.js";
import { migrateResumeData } from "./migrations.js";

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
 * @typedef {object} ResumeCollection
 * @property {string} activeResumeId
 * @property {string[]} resumeOrder
 * @property {Resume[]} resumes
 */

/**
 * 初始化存储并修复根索引，已有有效简历不会被覆盖。
 *
 * @param {StorageArea} [storageArea]
 * @returns {Promise<ResumeCollection>}
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
  const sourceVersion =
    typeof storedSchemaVersion === "number" ? storedSchemaVersion : 0;
  const resumes = await getValidResumes(
    candidateIds,
    sourceVersion,
    storageArea,
  );

  if (resumes.length === 0) {
    const resume = createDefaultResume();

    await storageArea.set({
      [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
      [ACTIVE_RESUME_ID_KEY]: resume.id,
      [RESUME_ORDER_KEY]: [resume.id],
      [getResumeStorageKey(resume.id)]: resume,
    });

    return {
      activeResumeId: resume.id,
      resumeOrder: [resume.id],
      resumes: [resume],
    };
  }

  const resumeOrder = resumes.map((resume) => resume.id);
  const storedActiveId = rootData[ACTIVE_RESUME_ID_KEY];
  const activeResumeId = resumes.some((resume) => resume.id === storedActiveId)
    ? /** @type {string} */ (storedActiveId)
    : resumes[0].id;
  /** @type {Record<string, unknown>} */
  const rootUpdates = {};

  if (storedSchemaVersion !== SCHEMA_VERSION) {
    rootUpdates[SCHEMA_VERSION_KEY] = SCHEMA_VERSION;

    for (const resume of resumes) {
      rootUpdates[getResumeStorageKey(resume.id)] = resume;
    }
  }

  if (storedActiveId !== activeResumeId) {
    rootUpdates[ACTIVE_RESUME_ID_KEY] = activeResumeId;
  }

  if (!areStringArraysEqual(rootData[RESUME_ORDER_KEY], resumeOrder)) {
    rootUpdates[RESUME_ORDER_KEY] = resumeOrder;
  }

  if (Object.keys(rootUpdates).length > 0) {
    await storageArea.set(rootUpdates);
  }

  return { activeResumeId, resumeOrder, resumes };
}

/**
 * 读取全部简历和当前启用状态。
 *
 * @param {StorageArea} [storageArea]
 * @returns {Promise<ResumeCollection>}
 */
export async function getResumeCollection(storageArea = chrome.storage.local) {
  return initializeStorage(storageArea);
}

/**
 * 读取当前启用的简历。
 *
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume>}
 */
export async function getActiveResume(storageArea = chrome.storage.local) {
  const collection = await initializeStorage(storageArea);
  const activeResume = collection.resumes.find(
    (resume) => resume.id === collection.activeResumeId,
  );

  if (activeResume === undefined) {
    throw new Error("找不到当前使用的简历。");
  }

  return activeResume;
}

/**
 * 按标识读取一份简历。
 *
 * @param {string} resumeId
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume | null>}
 */
export async function getResume(resumeId, storageArea = chrome.storage.local) {
  const storageKey = getResumeStorageKey(resumeId);
  const storedData = await storageArea.get([SCHEMA_VERSION_KEY, storageKey]);
  const storedResume = storedData[storageKey];

  if (storedResume === undefined) {
    return null;
  }

  try {
    return migrateResumeData(
      storedResume,
      typeof storedData[SCHEMA_VERSION_KEY] === "number"
        ? /** @type {number} */ (storedData[SCHEMA_VERSION_KEY])
        : 0,
    );
  } catch {
    return null;
  }
}

/**
 * 保存完整简历，不改变当前启用的简历。
 *
 * @param {Resume} resume
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume>}
 */
export async function saveResume(resume, storageArea = chrome.storage.local) {
  const normalizedResume = migrateResumeData(resume, SCHEMA_VERSION);
  const savedResume = {
    ...normalizedResume,
    updatedAt: Date.now(),
  };

  await storageArea.set({
    [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
    [getResumeStorageKey(savedResume.id)]: savedResume,
  });

  return savedResume;
}

/**
 * 将备份中的简历作为新版本加入，不覆盖已有简历。
 *
 * @param {Resume[]} sourceResumes
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume[]>}
 */
export async function importResumes(
  sourceResumes,
  storageArea = chrome.storage.local,
) {
  if (sourceResumes.length === 0) {
    throw new Error("没有可导入的简历。");
  }

  const collection = await initializeStorage(storageArea);
  const existingResumes = [...collection.resumes];
  const importedResumes = sourceResumes.map((sourceResume) => {
    const normalizedResume = migrateResumeData(sourceResume, SCHEMA_VERSION);
    const importedResume = cloneResume(normalizedResume, {
      name: createUniqueName(normalizedResume.name, existingResumes),
    });
    existingResumes.push(importedResume);
    return importedResume;
  });
  const resumeOrder = [
    ...collection.resumeOrder,
    ...importedResumes.map((resume) => resume.id),
  ];
  /** @type {Record<string, unknown>} */
  const updates = { [RESUME_ORDER_KEY]: resumeOrder };

  for (const resume of importedResumes) {
    updates[getResumeStorageKey(resume.id)] = resume;
  }

  await storageArea.set(updates);
  return importedResumes;
}

/**
 * 新建一份包含默认模块的空白简历。
 *
 * @param {string} [name]
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume>}
 */
export async function createResume(
  name = "新简历",
  storageArea = chrome.storage.local,
) {
  const collection = await initializeStorage(storageArea);
  const resume = createDefaultResume({ name: createUniqueName(name, collection.resumes) });
  const resumeOrder = [...collection.resumeOrder, resume.id];

  await storageArea.set({
    [RESUME_ORDER_KEY]: resumeOrder,
    [getResumeStorageKey(resume.id)]: resume,
  });

  return resume;
}

/**
 * 复制一份简历的模块、字段和内容。
 *
 * @param {string} resumeId
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume>}
 */
export async function duplicateResume(
  resumeId,
  storageArea = chrome.storage.local,
) {
  const collection = await initializeStorage(storageArea);
  const source = collection.resumes.find((resume) => resume.id === resumeId);

  if (source === undefined) {
    throw new Error("找不到要复制的简历。");
  }

  const copy = cloneResume(source, {
    name: createUniqueName(`${source.name} 副本`, collection.resumes),
  });
  const sourceIndex = collection.resumeOrder.indexOf(source.id);
  const resumeOrder = [...collection.resumeOrder];
  resumeOrder.splice(sourceIndex + 1, 0, copy.id);

  await storageArea.set({
    [RESUME_ORDER_KEY]: resumeOrder,
    [getResumeStorageKey(copy.id)]: copy,
  });

  return copy;
}

/**
 * 重命名一份简历。
 *
 * @param {string} resumeId
 * @param {string} name
 * @param {StorageArea} [storageArea]
 * @returns {Promise<Resume>}
 */
export async function renameResume(
  resumeId,
  name,
  storageArea = chrome.storage.local,
) {
  const normalizedName = name.trim();

  if (normalizedName === "") {
    throw new Error("简历名称不能为空。");
  }

  const resume = await getResume(resumeId, storageArea);

  if (resume === null) {
    throw new Error("找不到要重命名的简历。");
  }

  return saveResume({ ...resume, name: normalizedName }, storageArea);
}

/**
 * 设置侧边栏当前使用的简历。
 *
 * @param {string} resumeId
 * @param {StorageArea} [storageArea]
 * @returns {Promise<void>}
 */
export async function setActiveResume(
  resumeId,
  storageArea = chrome.storage.local,
) {
  const collection = await initializeStorage(storageArea);

  if (!collection.resumeOrder.includes(resumeId)) {
    throw new Error("找不到要启用的简历。");
  }

  if (collection.activeResumeId !== resumeId) {
    await storageArea.set({ [ACTIVE_RESUME_ID_KEY]: resumeId });
  }
}

/**
 * 删除一份简历，仓库中始终至少保留一份。
 *
 * @param {string} resumeId
 * @param {StorageArea} [storageArea]
 * @returns {Promise<ResumeCollection>}
 */
export async function deleteResume(
  resumeId,
  storageArea = chrome.storage.local,
) {
  const collection = await initializeStorage(storageArea);

  if (collection.resumes.length <= 1) {
    throw new Error("至少需要保留一份简历。");
  }

  if (!collection.resumeOrder.includes(resumeId)) {
    throw new Error("找不到要删除的简历。");
  }

  const resumeOrder = collection.resumeOrder.filter((id) => id !== resumeId);
  const activeResumeId =
    collection.activeResumeId === resumeId
      ? resumeOrder[0]
      : collection.activeResumeId;

  await storageArea.remove(getResumeStorageKey(resumeId));
  await storageArea.set({
    [RESUME_ORDER_KEY]: resumeOrder,
    [ACTIVE_RESUME_ID_KEY]: activeResumeId,
  });

  return initializeStorage(storageArea);
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
 * @param {string[]} resumeIds
 * @param {number} sourceVersion
 * @param {StorageArea} storageArea
 * @returns {Promise<Resume[]>}
 */
async function getValidResumes(resumeIds, sourceVersion, storageArea) {
  if (resumeIds.length === 0) {
    return [];
  }

  const storageKeys = resumeIds.map(getResumeStorageKey);
  const storedData = await storageArea.get(storageKeys);
  const resumes = [];

  for (const resumeId of resumeIds) {
    const storedResume = storedData[getResumeStorageKey(resumeId)];

    try {
      resumes.push(migrateResumeData(storedResume, sourceVersion));
    } catch {
      // 无效简历不会阻止其他有效版本加载。
    }
  }

  return resumes;
}

/**
 * @param {Record<string, unknown>} rootData
 * @returns {string[]}
 */
function collectCandidateIds(rootData) {
  const activeResumeId = rootData[ACTIVE_RESUME_ID_KEY];
  const resumeOrder = rootData[RESUME_ORDER_KEY];
  const candidateIds = [];

  if (Array.isArray(resumeOrder)) {
    for (const resumeId of resumeOrder) {
      if (typeof resumeId === "string" && !candidateIds.includes(resumeId)) {
        candidateIds.push(resumeId);
      }
    }
  }

  if (
    typeof activeResumeId === "string" &&
    !candidateIds.includes(activeResumeId)
  ) {
    candidateIds.unshift(activeResumeId);
  }

  return candidateIds;
}

/**
 * @param {string} preferredName
 * @param {Resume[]} resumes
 * @returns {string}
 */
function createUniqueName(preferredName, resumes) {
  const names = new Set(resumes.map((resume) => resume.name));

  if (!names.has(preferredName)) {
    return preferredName;
  }

  let suffix = 2;

  while (names.has(`${preferredName} ${suffix}`)) {
    suffix += 1;
  }

  return `${preferredName} ${suffix}`;
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
