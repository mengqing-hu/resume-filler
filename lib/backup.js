// @ts-check

import { SCHEMA_VERSION } from "./schema.js";
import { migrateResumeData } from "./migrations.js";

/** @typedef {import("./schema.js").Resume} Resume */

/**
 * @typedef {object} BackupDocument
 * @property {"resume-filler-backup"} format
 * @property {number} schemaVersion
 * @property {string} exportedAt
 * @property {string} activeResumeId
 * @property {string[]} resumeOrder
 * @property {Resume[]} resumes
 */

/**
 * 创建可导出的备份对象。
 *
 * @param {Resume[]} resumes
 * @param {string} activeResumeId
 * @returns {BackupDocument}
 */
export function createBackupDocument(resumes, activeResumeId) {
  if (resumes.length === 0) {
    throw new Error("没有可导出的简历。");
  }

  const normalizedActiveId = resumes.some(
    (resume) => resume.id === activeResumeId,
  )
    ? activeResumeId
    : resumes[0].id;

  return {
    format: "resume-filler-backup",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    activeResumeId: normalizedActiveId,
    resumeOrder: resumes.map((resume) => resume.id),
    resumes: structuredClone(resumes),
  };
}

/**
 * 解析备份文本，并将其中简历迁移到当前数据版本。
 *
 * @param {string} text
 * @returns {BackupDocument}
 */
export function parseBackupDocument(text) {
  /** @type {unknown} */
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("备份文件不是有效的 JSON。");
  }

  if (!isRecord(parsed) || parsed.format !== "resume-filler-backup") {
    throw new Error("文件不是简历填写助手备份。");
  }

  const sourceVersion = parsed.schemaVersion;

  if (!Number.isInteger(sourceVersion) || typeof sourceVersion !== "number") {
    throw new Error("备份文件缺少有效的数据版本号。");
  }

  if (!Array.isArray(parsed.resumes) || parsed.resumes.length === 0) {
    throw new Error("备份文件中没有简历。");
  }

  const resumes = parsed.resumes.map((resume) =>
    migrateResumeData(resume, sourceVersion),
  );
  const activeResumeId =
    typeof parsed.activeResumeId === "string" &&
    resumes.some((resume) => resume.id === parsed.activeResumeId)
      ? parsed.activeResumeId
      : resumes[0].id;

  return {
    format: "resume-filler-backup",
    schemaVersion: SCHEMA_VERSION,
    exportedAt:
      typeof parsed.exportedAt === "string"
        ? parsed.exportedAt
        : new Date().toISOString(),
    activeResumeId,
    resumeOrder: resumes.map((resume) => resume.id),
    resumes,
  };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
