// @ts-check

export const SCHEMA_VERSION = 1;

/** @typedef {"single" | "multi"} ModuleKind */
/** @typedef {"text" | "textarea" | "date"} FieldType */

/**
 * @typedef {object} ResumeField
 * @property {string} id
 * @property {string} label
 * @property {FieldType} type
 */

/**
 * @typedef {object} ResumeModule
 * @property {string} id
 * @property {string} name
 * @property {ModuleKind} kind
 * @property {ResumeField[]} fields
 */

/**
 * @typedef {object} Resume
 * @property {string} id
 * @property {string} name
 * @property {number} updatedAt
 * @property {ResumeModule[]} modules
 * @property {Record<string, Record<string, string> | Array<Record<string, string>>>} values
 */
