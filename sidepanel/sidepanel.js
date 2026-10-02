// @ts-check

import { createElement } from "../lib/dom.js";
import { getActiveResume } from "../lib/storage.js";

/** @typedef {import("../lib/schema.js").Resume} Resume */
/** @typedef {import("../lib/schema.js").ResumeGroup} ResumeGroup */
/** @typedef {import("../lib/schema.js").ResumeModule} ResumeModule */

const openOptionsButton = getElement("open-options", HTMLButtonElement);
const activeResumeName = getElement("active-resume-name", HTMLElement);
const moduleList = getElement("module-list", HTMLDivElement);
const panelStatus = getElement("panel-status", HTMLParagraphElement);

openOptionsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    Object.keys(changes).some(
      (key) => key === "activeResumeId" || key.startsWith("resume:"),
    )
  ) {
    void loadResume();
  }
});

void loadResume();

async function loadResume() {
  try {
    const resume = await getActiveResume();
    renderResume(resume);
    panelStatus.textContent = "已显示最新保存内容";
    panelStatus.dataset.state = "loaded";
  } catch (error) {
    moduleList.replaceChildren(
      createElement("p", {
        text: "无法读取简历，请前往设置页检查数据。",
        classNames: ["error-state"],
      }),
    );
    panelStatus.textContent = getErrorMessage(error);
    panelStatus.dataset.state = "error";
  }
}

/**
 * @param {Resume} resume
 */
function renderResume(resume) {
  activeResumeName.textContent = resume.name;
  moduleList.replaceChildren(
    ...resume.modules.map((module) => renderModule(module, resume)),
  );
}

/**
 * @param {ResumeModule} module
 * @param {Resume} resume
 * @returns {HTMLElement}
 */
function renderModule(module, resume) {
  const section = createElement("section", { classNames: ["module-section"] });
  const title = createElement("h2", { text: module.name });
  section.append(title);

  const storedValue = resume.values[module.id];

  if (module.kind === "multi") {
    const groups = Array.isArray(storedValue) ? storedValue : [];

    if (groups.length === 0) {
      section.append(createEmptyMessage());
      return section;
    }

    groups.forEach((group, groupIndex) => {
      section.append(renderGroup(module, group, groupIndex, true));
    });
  } else if (isResumeGroup(storedValue)) {
    section.append(renderGroup(module, storedValue, 0, false));
  } else {
    section.append(createEmptyMessage());
  }

  return section;
}

/**
 * @param {ResumeModule} module
 * @param {ResumeGroup} group
 * @param {number} groupIndex
 * @param {boolean} showTitle
 * @returns {HTMLElement}
 */
function renderGroup(module, group, groupIndex, showTitle) {
  const groupContainer = createElement("div", { classNames: ["field-group"] });

  if (showTitle) {
    groupContainer.append(
      createElement("h3", {
        text: getGroupTitle(module, group, groupIndex),
      }),
    );
  }

  const fields = createElement("div", { classNames: ["field-list"] });

  for (const field of module.fields) {
    const value = typeof group[field.id] === "string" ? group[field.id] : "";
    const button = createElement("button", {
      classNames: [
        "field-button",
        ...(value.trim() === "" ? ["field-button--empty"] : []),
      ],
    });
    const label = createElement("span", {
      text: field.label,
      classNames: ["field-label"],
    });
    const preview = createElement("span", {
      text: createValuePreview(value),
      classNames: ["field-preview"],
    });

    button.type = "button";
    button.disabled = true;
    button.append(label, preview);
    fields.append(button);
  }

  groupContainer.append(fields);
  return groupContainer;
}

/**
 * @param {ResumeModule} module
 * @param {ResumeGroup} group
 * @param {number} groupIndex
 * @returns {string}
 */
function getGroupTitle(module, group, groupIndex) {
  const firstField = module.fields[0];
  const title = firstField === undefined ? "" : group[firstField.id]?.trim();
  return title || `第 ${groupIndex + 1} 组`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function createValuePreview(value) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  return normalizedValue || "未填写";
}

/**
 * @returns {HTMLParagraphElement}
 */
function createEmptyMessage() {
  return createElement("p", {
    text: "暂无内容",
    classNames: ["module-empty-state"],
  });
}

/**
 * @param {unknown} value
 * @returns {value is ResumeGroup}
 */
function isResumeGroup(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
