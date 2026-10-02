// @ts-check

import { SCHEMA_VERSION } from "./schema.js";

/** @typedef {import("./schema.js").FieldType} FieldType */
/** @typedef {import("./schema.js").ModuleKind} ModuleKind */
/** @typedef {import("./schema.js").Resume} Resume */
/** @typedef {import("./schema.js").ResumeGroup} ResumeGroup */

/**
 * 将任意受支持版本的简历迁移并规范化为当前结构。
 *
 * @param {unknown} value
 * @param {number} sourceVersion
 * @returns {Resume}
 */
export function migrateResumeData(value, sourceVersion) {
  if (!Number.isInteger(sourceVersion) || sourceVersion < 0) {
    throw new Error("数据版本号无效。");
  }

  if (sourceVersion > SCHEMA_VERSION) {
    throw new Error("数据来自更高版本的扩展，请先更新扩展。");
  }

  let migratedValue = structuredClone(value);

  for (let version = sourceVersion; version < SCHEMA_VERSION; version += 1) {
    const migration = migrationSteps.get(version);

    if (migration === undefined) {
      throw new Error(`缺少从版本 ${version} 开始的数据迁移函数。`);
    }

    migratedValue = migration(migratedValue);
  }

  return normalizeResume(migratedValue);
}

/** @type {Map<number, (value: unknown) => unknown>} */
const migrationSteps = new Map([[0, migrateVersionZeroToOne]]);

/**
 * 早期开发数据可能使用 modifiedAt，此迁移将其统一为 updatedAt。
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function migrateVersionZeroToOne(value) {
  if (!isRecord(value)) {
    return value;
  }

  if (typeof value.updatedAt !== "number" && typeof value.modifiedAt === "number") {
    return { ...value, updatedAt: value.modifiedAt };
  }

  return value;
}

/**
 * @param {unknown} value
 * @returns {Resume}
 */
function normalizeResume(value) {
  if (!isRecord(value)) {
    throw new Error("简历数据必须是对象。");
  }

  const id = requireText(value.id, "简历 ID");
  const name = requireText(value.name, "简历名称");
  const rawModules = Array.isArray(value.modules) ? value.modules : null;

  if (rawModules === null) {
    throw new Error(`简历“${name}”缺少模块列表。`);
  }

  const moduleIds = new Set();
  const modules = rawModules.map((module, moduleIndex) => {
    if (!isRecord(module)) {
      throw new Error(`第 ${moduleIndex + 1} 个模块格式不正确。`);
    }

    const moduleId = requireText(module.id, "模块 ID");

    if (moduleIds.has(moduleId)) {
      throw new Error(`模块 ID 重复：${moduleId}`);
    }

    moduleIds.add(moduleId);
    const kind = normalizeModuleKind(module.kind);
    const rawFields = Array.isArray(module.fields) ? module.fields : null;

    if (rawFields === null) {
      throw new Error(`模块“${String(module.name ?? moduleId)}”缺少字段列表。`);
    }

    const fieldIds = new Set();
    const fields = rawFields.map((field, fieldIndex) => {
      if (!isRecord(field)) {
        throw new Error(`模块“${moduleId}”的第 ${fieldIndex + 1} 个字段格式不正确。`);
      }

      const fieldId = requireText(field.id, "字段 ID");

      if (fieldIds.has(fieldId)) {
        throw new Error(`模块“${moduleId}”存在重复字段 ID：${fieldId}`);
      }

      fieldIds.add(fieldId);
      return {
        id: fieldId,
        label: requireText(field.label, "字段名称"),
        type: normalizeFieldType(field.type),
      };
    });

    return {
      id: moduleId,
      name: requireText(module.name, "模块名称"),
      kind,
      fields,
    };
  });

  const rawValues = isRecord(value.values) ? value.values : {};
  /** @type {import("./schema.js").ResumeValues} */
  const values = {};

  for (const module of modules) {
    const rawModuleValue = rawValues[module.id];

    if (module.kind === "multi") {
      const rawGroups = Array.isArray(rawModuleValue)
        ? rawModuleValue
        : isRecord(rawModuleValue)
          ? [rawModuleValue]
          : [];
      values[module.id] = rawGroups
        .filter(isRecord)
        .map((group) => normalizeGroup(group, module.fields));
    } else {
      const rawGroup = Array.isArray(rawModuleValue)
        ? rawModuleValue.find(isRecord)
        : rawModuleValue;
      values[module.id] = normalizeGroup(
        isRecord(rawGroup) ? rawGroup : {},
        module.fields,
      );
    }
  }

  return {
    id,
    name,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
    modules,
    values,
  };
}

/**
 * @param {Record<string, unknown>} group
 * @param {Array<{ id: string }>} fields
 * @returns {ResumeGroup}
 */
function normalizeGroup(group, fields) {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      typeof group[field.id] === "string" ? group[field.id] : "",
    ]),
  );
}

/**
 * @param {unknown} value
 * @returns {ModuleKind}
 */
function normalizeModuleKind(value) {
  if (value === "single" || value === "multi") {
    return value;
  }

  throw new Error(`不支持的模块类型：${String(value)}`);
}

/**
 * @param {unknown} value
 * @returns {FieldType}
 */
function normalizeFieldType(value) {
  if (value === "text" || value === "textarea" || value === "date") {
    return value;
  }

  throw new Error(`不支持的字段类型：${String(value)}`);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}不能为空。`);
  }

  return value;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
