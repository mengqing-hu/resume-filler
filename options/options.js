// @ts-check

import { createElement } from "../lib/dom.js";
import { createEmptyGroup } from "../lib/schema.js";
import { getActiveResume, saveResume } from "../lib/storage.js";

/** @typedef {import("../lib/schema.js").Resume} Resume */
/** @typedef {import("../lib/schema.js").ResumeField} ResumeField */
/** @typedef {import("../lib/schema.js").ResumeGroup} ResumeGroup */
/** @typedef {import("../lib/schema.js").ResumeModule} ResumeModule */

const resumeForm = getElement("resume-form", HTMLFormElement);
const resumeList = getElement("resume-list", HTMLDivElement);
const resumeTitle = getElement("resume-title", HTMLHeadingElement);
const saveButton = getElement("save-resume", HTMLButtonElement);
const saveStatus = getElement("save-status", HTMLParagraphElement);
const moduleNavigation = getElement("module-navigation", HTMLElement);
const pageError = getElement("page-error", HTMLParagraphElement);

/** @type {Resume | null} */
let currentResume = null;
let hasUnsavedChanges = false;
let isSaving = false;

resumeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleSave();
});

void loadResume();

async function loadResume() {
  try {
    currentResume = await getActiveResume();
    renderResume(currentResume);
    setSaveState("已读取本地简历", "saved");
  } catch (error) {
    showPageError(getErrorMessage(error));
  }
}

/**
 * 渲染当前简历的版本信息、模块导航和内容表单。
 *
 * @param {Resume} resume
 */
function renderResume(resume) {
  resumeTitle.textContent = resume.name;
  renderResumeList(resume);
  renderModuleNavigation(resume.modules);
  resumeForm.replaceChildren(
    ...resume.modules.map((module) => renderModule(module, resume)),
  );
}

/**
 * @param {Resume} resume
 */
function renderResumeList(resume) {
  const resumeName = createElement("span", {
    text: resume.name,
    classNames: ["resume-list-name"],
  });
  const activeBadge = createElement("span", {
    text: "在用",
    classNames: ["active-badge"],
  });
  const resumeItem = createElement("div", {
    classNames: ["resume-list-item", "resume-list-item--active"],
  });

  resumeItem.append(resumeName, activeBadge);
  resumeList.replaceChildren(resumeItem);
}

/**
 * @param {ResumeModule[]} modules
 */
function renderModuleNavigation(modules) {
  const links = modules.map((module) => {
    const link = createElement("a", {
      text: module.name,
      classNames: ["module-navigation-link"],
    });
    link.href = `#module-${module.id}`;
    return link;
  });

  moduleNavigation.replaceChildren(...links);
}

/**
 * @param {ResumeModule} module
 * @param {Resume} resume
 * @returns {HTMLElement}
 */
function renderModule(module, resume) {
  const section = createElement("section", { classNames: ["module-card"] });
  section.id = `module-${module.id}`;

  const heading = createElement("div", { classNames: ["module-heading"] });
  const titleGroup = createElement("div");
  const title = createElement("h3", { text: module.name });
  const typeLabel = createElement("span", {
    text: module.kind === "multi" ? "多组内容" : "单组内容",
    classNames: ["module-type"],
  });
  titleGroup.append(title, typeLabel);
  heading.append(titleGroup);

  if (module.kind === "multi") {
    const addButton = createElement("button", {
      text: "添加一组",
      classNames: ["secondary-button"],
    });
    addButton.type = "button";
    addButton.addEventListener("click", () => addGroup(module));
    heading.append(addButton);
  }

  section.append(heading);

  if (module.kind === "multi") {
    const groups = getMultiValues(resume, module);

    if (groups.length === 0) {
      section.append(
        createElement("p", {
          text: "还没有内容，点击“添加一组”开始填写。",
          classNames: ["module-empty-state"],
        }),
      );
    } else {
      groups.forEach((group, index) => {
        section.append(renderMultiGroup(module, group, index));
      });
    }
  } else {
    section.append(renderFieldGrid(module, getSingleValue(resume, module)));
  }

  return section;
}

/**
 * @param {ResumeModule} module
 * @param {ResumeGroup} group
 * @param {number} groupIndex
 * @returns {HTMLElement}
 */
function renderMultiGroup(module, group, groupIndex) {
  const groupCard = createElement("article", { classNames: ["group-card"] });
  const groupHeader = createElement("header", { classNames: ["group-header"] });
  const groupTitle = createElement("h4", {
    text: getGroupTitle(module, group, groupIndex),
  });
  const deleteButton = createElement("button", {
    text: "删除本组",
    classNames: ["text-button", "text-button--danger"],
  });
  deleteButton.type = "button";
  deleteButton.addEventListener("click", () => removeGroup(module, groupIndex));
  groupHeader.append(groupTitle, deleteButton);
  groupCard.append(
    groupHeader,
    renderFieldGrid(module, group, groupIndex, groupTitle),
  );
  return groupCard;
}

/**
 * @param {ResumeModule} module
 * @param {ResumeGroup} group
 * @param {number | null} [groupIndex]
 * @param {HTMLHeadingElement | null} [groupTitle]
 * @returns {HTMLElement}
 */
function renderFieldGrid(
  module,
  group,
  groupIndex = null,
  groupTitle = null,
) {
  const fieldGrid = createElement("div", { classNames: ["field-grid"] });

  module.fields.forEach((field, fieldIndex) => {
    fieldGrid.append(
      renderField(module, field, group, fieldIndex, groupIndex, groupTitle),
    );
  });

  return fieldGrid;
}

/**
 * @param {ResumeModule} module
 * @param {ResumeField} field
 * @param {ResumeGroup} group
 * @param {number} fieldIndex
 * @param {number | null} groupIndex
 * @param {HTMLHeadingElement | null} groupTitle
 * @returns {HTMLElement}
 */
function renderField(
  module,
  field,
  group,
  fieldIndex,
  groupIndex,
  groupTitle,
) {
  const fieldContainer = createElement("div", {
    classNames: [
      "field-control",
      ...(field.type === "textarea" ? ["field-control--wide"] : []),
    ],
  });
  const inputId = `${module.id}-${groupIndex ?? "single"}-${field.id}`;
  const label = createElement("label", { text: field.label });
  label.htmlFor = inputId;

  /** @type {HTMLInputElement | HTMLTextAreaElement} */
  const input =
    field.type === "textarea"
      ? document.createElement("textarea")
      : document.createElement("input");

  input.id = inputId;
  input.name = inputId;
  input.value = typeof group[field.id] === "string" ? group[field.id] : "";
  input.autocomplete = "off";

  if (input instanceof HTMLTextAreaElement) {
    input.rows = 5;
  } else {
    input.type = field.type === "date" ? "date" : "text";
  }

  input.addEventListener("input", () => {
    group[field.id] = input.value;

    if (fieldIndex === 0 && groupIndex !== null && groupTitle !== null) {
      groupTitle.textContent = getGroupTitle(module, group, groupIndex);
    }

    markDirty();
  });

  fieldContainer.append(label, input);
  return fieldContainer;
}

/**
 * @param {ResumeModule} module
 */
function addGroup(module) {
  if (currentResume === null) {
    return;
  }

  getMultiValues(currentResume, module).push(createEmptyGroup(module));
  renderResume(currentResume);
  markDirty();
  document.querySelector(`#module-${module.id}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

/**
 * @param {ResumeModule} module
 * @param {number} groupIndex
 */
function removeGroup(module, groupIndex) {
  if (currentResume === null) {
    return;
  }

  const confirmed = window.confirm(`确定删除“${module.name}”中的这一组内容吗？`);

  if (!confirmed) {
    return;
  }

  getMultiValues(currentResume, module).splice(groupIndex, 1);
  renderResume(currentResume);
  markDirty();
}

async function handleSave() {
  if (currentResume === null || !hasUnsavedChanges || isSaving) {
    return;
  }

  isSaving = true;
  saveButton.disabled = true;
  setSaveState("正在保存...", "saving");

  try {
    currentResume = await saveResume(currentResume);
    hasUnsavedChanges = false;
    setSaveState("已保存到本地浏览器", "saved");
  } catch (error) {
    setSaveState(`保存失败：${getErrorMessage(error)}`, "error");
    saveButton.disabled = false;
  } finally {
    isSaving = false;
  }
}

function markDirty() {
  hasUnsavedChanges = true;
  saveButton.disabled = false;
  setSaveState("有未保存的更改", "dirty");
}

/**
 * @param {Resume} resume
 * @param {ResumeModule} module
 * @returns {ResumeGroup}
 */
function getSingleValue(resume, module) {
  const storedValue = resume.values[module.id];

  if (
    typeof storedValue === "object" &&
    storedValue !== null &&
    !Array.isArray(storedValue)
  ) {
    return storedValue;
  }

  const group = createEmptyGroup(module);
  resume.values[module.id] = group;
  return group;
}

/**
 * @param {Resume} resume
 * @param {ResumeModule} module
 * @returns {ResumeGroup[]}
 */
function getMultiValues(resume, module) {
  const storedValue = resume.values[module.id];

  if (Array.isArray(storedValue)) {
    return storedValue;
  }

  const groups = [];
  resume.values[module.id] = groups;
  return groups;
}

/**
 * @param {ResumeModule} module
 * @param {ResumeGroup} group
 * @param {number} groupIndex
 * @returns {string}
 */
function getGroupTitle(module, group, groupIndex) {
  const titleField = module.fields[0];
  const title = titleField === undefined ? "" : group[titleField.id]?.trim();
  return title || `第 ${groupIndex + 1} 组`;
}

/**
 * @param {string} message
 * @param {"saved" | "dirty" | "saving" | "error"} state
 */
function setSaveState(message, state) {
  saveStatus.textContent = message;
  saveStatus.dataset.state = state;
}

/**
 * @param {string} message
 */
function showPageError(message) {
  pageError.textContent = `无法打开简历设置：${message}`;
  pageError.hidden = false;
  resumeForm.replaceChildren();
  moduleNavigation.replaceChildren();
  saveButton.disabled = true;
  setSaveState("读取失败", "error");
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : "发生未知错误";
}

/**
 * @template {typeof HTMLElement} ElementConstructor
 * @param {string} id
 * @param {ElementConstructor} constructor
 * @returns {InstanceType<ElementConstructor>}
 */
function getElement(id, constructor) {
  const element = document.getElementById(id);

  if (!(element instanceof constructor)) {
    throw new Error(`页面缺少必要元素：${id}`);
  }

  return /** @type {InstanceType<ElementConstructor>} */ (element);
}
