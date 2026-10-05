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

/** @typedef {Record<string, string>} ResumeGroup */
/** @typedef {Record<string, ResumeGroup | ResumeGroup[]>} ResumeValues */

/**
 * @typedef {object} Resume
 * @property {string} id
 * @property {string} name
 * @property {number} updatedAt
 * @property {ResumeModule[]} modules
 * @property {ResumeValues} values
 */

/** @type {ReadonlyArray<Readonly<ResumeModule>>} */
const DEFAULT_MODULES = [
  {
    id: "personal",
    name: "个人信息",
    kind: "single",
    fields: [
      { id: "name", label: "姓名", type: "text" },
      { id: "phone", label: "手机号码", type: "text" },
      { id: "email", label: "邮箱", type: "text" },
      { id: "identity_number", label: "证件号码", type: "text" },
      { id: "birth_date", label: "出生日期", type: "date" },
      { id: "hometown", label: "籍贯", type: "text" },
      { id: "current_city", label: "现居住地", type: "text" },
      { id: "address", label: "通讯地址", type: "text" },
      { id: "preferred_city", label: "期望城市", type: "text" },
      { id: "preferred_position", label: "期望职位", type: "text" },
    ],
  },
  {
    id: "education",
    name: "教育背景",
    kind: "multi",
    fields: [
      { id: "degree", label: "学历", type: "text" },
      { id: "school", label: "学校名称", type: "text" },
      { id: "college", label: "学院名称", type: "text" },
      { id: "major", label: "专业名称", type: "text" },
      { id: "start_date", label: "开始时间", type: "date" },
      { id: "end_date", label: "结束时间", type: "date" },
      { id: "advisor", label: "导师姓名", type: "text" },
      { id: "research_direction", label: "研究方向", type: "text" },
    ],
  },
  {
    id: "work_experience",
    name: "实习与工作经历",
    kind: "multi",
    fields: [
      { id: "company", label: "公司名称", type: "text" },
      { id: "department", label: "所在部门", type: "text" },
      { id: "position", label: "职位名称", type: "text" },
      { id: "start_date", label: "开始时间", type: "date" },
      { id: "end_date", label: "结束时间", type: "date" },
      { id: "responsibilities", label: "工作职责", type: "textarea" },
    ],
  },
  {
    id: "projects",
    name: "项目经验",
    kind: "multi",
    fields: [
      { id: "name", label: "项目名称", type: "text" },
      { id: "organization", label: "所在单位", type: "text" },
      { id: "role", label: "担任角色", type: "text" },
      { id: "start_date", label: "开始时间", type: "date" },
      { id: "end_date", label: "结束时间", type: "date" },
      { id: "description", label: "项目描述", type: "textarea" },
      { id: "responsibilities", label: "项目中职责", type: "textarea" },
      { id: "link", label: "项目链接", type: "text" },
    ],
  },
  {
    id: "awards",
    name: "获奖经历",
    kind: "multi",
    fields: [
      { id: "name", label: "奖项名称", type: "text" },
      { id: "date", label: "获奖时间", type: "date" },
      { id: "description", label: "奖项描述", type: "textarea" },
    ],
  },
  {
    id: "campus_roles",
    name: "在校职务",
    kind: "multi",
    fields: [
      { id: "name", label: "职务名称", type: "text" },
      { id: "start_date", label: "开始时间", type: "date" },
      { id: "end_date", label: "结束时间", type: "date" },
      { id: "description", label: "职务描述", type: "textarea" },
    ],
  },
  {
    id: "certificates",
    name: "证书",
    kind: "multi",
    fields: [
      { id: "name", label: "证书名称", type: "text" },
      { id: "date", label: "获得时间", type: "date" },
    ],
  },
  {
    id: "self_description",
    name: "自我描述",
    kind: "single",
    fields: [
      { id: "summary", label: "自我评价", type: "textarea" },
      { id: "skills", label: "专业技能", type: "textarea" },
      { id: "interests", label: "兴趣爱好", type: "textarea" },
      { id: "strengths", label: "特长", type: "textarea" },
    ],
  },
  {
    id: "other",
    name: "其他",
    kind: "single",
    fields: [
      { id: "github", label: "GitHub", type: "text" },
      { id: "homepage", label: "个人主页", type: "text" },
      { id: "wechat", label: "微信号", type: "text" },
    ],
  },
];

/**
 * 创建符合字段结构的空白内容组。
 *
 * @param {ResumeModule} module
 * @returns {ResumeGroup}
 */
export function createEmptyGroup(module) {
  return Object.fromEntries(module.fields.map((field) => [field.id, ""]));
}

/**
 * 创建包含默认模块的新简历。
 *
 * @param {{ id?: string, name?: string, updatedAt?: number }} [options]
 * @returns {Resume}
 */
export function createDefaultResume(options = {}) {
  const modules = DEFAULT_MODULES.map((module) => ({
    ...module,
    fields: module.fields.map((field) => ({ ...field })),
  }));

  /** @type {ResumeValues} */
  const values = {};

  for (const module of modules) {
    values[module.id] =
      module.kind === "multi"
        ? [createEmptyGroup(module)]
        : createEmptyGroup(module);
  }

  return {
    id: options.id ?? createResumeId(),
    name: options.name ?? "默认简历",
    updatedAt: options.updatedAt ?? Date.now(),
    modules,
    values,
  };
}

/**
 * 创建不会与其他简历冲突的本地标识。
 *
 * @returns {string}
 */
export function createResumeId() {
  return `r_${crypto.randomUUID()}`;
}

/**
 * 创建自定义模块标识。
 *
 * @returns {string}
 */
export function createModuleId() {
  return `m_${crypto.randomUUID()}`;
}

/**
 * 创建自定义字段标识。
 *
 * @returns {string}
 */
export function createFieldId() {
  return `f_${crypto.randomUUID()}`;
}

/**
 * 深拷贝简历并分配新的简历标识。
 *
 * @param {Resume} source
 * @param {{ name?: string, id?: string }} [options]
 * @returns {Resume}
 */
export function cloneResume(source, options = {}) {
  return {
    id: options.id ?? createResumeId(),
    name: options.name ?? `${source.name} 副本`,
    updatedAt: Date.now(),
    modules: source.modules.map((module) => ({
      ...module,
      fields: module.fields.map((field) => ({ ...field })),
    })),
    values: Object.fromEntries(
      Object.entries(source.values).map(([moduleId, moduleValue]) => [
        moduleId,
        Array.isArray(moduleValue)
          ? moduleValue.map((group) => ({ ...group }))
          : { ...moduleValue },
      ]),
    ),
  };
}
