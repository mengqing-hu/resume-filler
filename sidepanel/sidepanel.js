// @ts-check

import { createElement } from "../lib/dom.js";
import { getResumeCollection, setActiveResume } from "../lib/storage.js";

/** @typedef {import("../lib/schema.js").Resume} Resume */
/** @typedef {import("../lib/schema.js").ResumeGroup} ResumeGroup */
/** @typedef {import("../lib/schema.js").ResumeModule} ResumeModule */

const openOptionsButton = getElement("open-options", HTMLButtonElement);
const undoButton = getElement("undo-fill", HTMLButtonElement);
const resumeSelector = getElement("resume-selector", HTMLSelectElement);
const moduleList = getElement("module-list", HTMLDivElement);
const panelStatus = getElement("panel-status", HTMLParagraphElement);
const collapsedModuleIds = new Set();

openOptionsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

undoButton.addEventListener("click", () => {
  void handleUndo();
});

resumeSelector.addEventListener("change", () => {
  void handleResumeChange(resumeSelector.value);
});

chrome.tabs.onActivated.addListener(() => {
  void refreshUndoAvailability();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    Object.keys(changes).some(
      (key) =>
        key === "activeResumeId" ||
        key === "resumeOrder" ||
        key.startsWith("resume:"),
    )
  ) {
    void loadResumeCollection();
  }
});

void loadResumeCollection();
void refreshUndoAvailability();

async function loadResumeCollection() {
  try {
    const collection = await getResumeCollection();
    const activeResume = collection.resumes.find(
      (resume) => resume.id === collection.activeResumeId,
    );

    if (activeResume === undefined) {
      throw new Error("找不到当前使用的简历。");
    }

    resumeSelector.replaceChildren(
      ...collection.resumes.map((resume) => {
        const option = document.createElement("option");
        option.value = resume.id;
        option.textContent = resume.name;
        option.selected = resume.id === collection.activeResumeId;
        return option;
      }),
    );
    resumeSelector.disabled = false;
    renderResume(activeResume);
    setPanelStatus("已显示最新保存内容", "loaded");
  } catch (error) {
    resumeSelector.disabled = true;
    moduleList.replaceChildren(
      createElement("p", {
        text: "无法读取简历，请前往设置页检查数据。",
        classNames: ["error-state"],
      }),
    );
    setPanelStatus(getErrorMessage(error), "error");
  }
}

/**
 * @param {string} resumeId
 */
async function handleResumeChange(resumeId) {
  resumeSelector.disabled = true;
  setPanelStatus("正在切换简历...", "working");

  try {
    await setActiveResume(resumeId);
    await loadResumeCollection();
  } catch (error) {
    setPanelStatus(`切换失败：${getErrorMessage(error)}`, "error");
    await loadResumeCollection();
  }
}

/**
 * @param {Resume} resume
 */
function renderResume(resume) {
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
  const header = createElement("div", { classNames: ["module-header"] });
  const title = createElement("h2", { text: module.name });
  const toggleButton = createElement("button", {
    text: collapsedModuleIds.has(module.id) ? "展开" : "收起",
    classNames: ["module-toggle"],
  });
  const content = createElement("div", { classNames: ["module-content"] });
  const isCollapsed = collapsedModuleIds.has(module.id);
  toggleButton.type = "button";
  toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
  content.hidden = isCollapsed;
  toggleButton.addEventListener("click", () => {
    const shouldCollapse = !content.hidden;
    content.hidden = shouldCollapse;
    toggleButton.textContent = shouldCollapse ? "展开" : "收起";
    toggleButton.setAttribute("aria-expanded", String(!shouldCollapse));

    if (shouldCollapse) {
      collapsedModuleIds.add(module.id);
    } else {
      collapsedModuleIds.delete(module.id);
    }
  });
  header.append(title, toggleButton);
  section.append(header, content);
  const storedValue = resume.values[module.id];

  if (module.kind === "multi") {
    const groups = Array.isArray(storedValue) ? storedValue : [];

    if (groups.length === 0) {
      content.append(createEmptyMessage());
    } else {
      groups.forEach((group, groupIndex) => {
        content.append(renderGroup(module, group, groupIndex, true));
      });
    }
  } else if (isResumeGroup(storedValue)) {
    content.append(renderGroup(module, storedValue, 0, false));
  } else {
    content.append(createEmptyMessage());
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
    button.disabled = value.trim() === "";
    button.title = button.disabled
      ? "字段内容为空，请先前往设置页填写"
      : `填写${field.label}`;
    button.addEventListener("click", () => {
      void handleFieldAction(value, field.label, button);
    });
    button.append(label, preview);
    fields.append(button);
  }

  if (module.fields.length === 0) {
    fields.append(createEmptyMessage());
  }

  groupContainer.append(fields);
  return groupContainer;
}

/**
 * 优先把字段写入网页，找不到输入框时复制到剪贴板。
 *
 * @param {string} value
 * @param {string} label
 * @param {HTMLButtonElement} button
 */
async function handleFieldAction(value, label, button) {
  button.disabled = true;
  setPanelStatus(`正在处理“${label}”...`, "working");

  try {
    let response = await sendMessageToActivePage({
      type: "fill-field",
      value,
    });

    if (response.status === "maxlength-exceeded") {
      const confirmed = window.confirm(
        `字段内容有 ${String(response.valueLength)} 个字符，输入框最多允许 ${String(response.maxLength)} 个字符。仍要继续填写吗？`,
      );

      if (!confirmed) {
        setPanelStatus("已取消填写，字段内容超过输入框限制", "warning");
        return;
      }

      response = await sendMessageToActivePage({
        type: "fill-field",
        value,
        ignoreMaxLength: true,
      });
    }

    if (response.status === "filled") {
      undoButton.disabled = false;
      setPanelStatus("", "loaded");
      return;
    }

    if (response.status === "unavailable") {
      await copyValue(
        value,
        "页面脚本不可用，请刷新网页；内容已复制到剪贴板",
      );
      return;
    }

    if (response.status === "error") {
      await copyValue(value, "网页填写失败，内容已复制到剪贴板");
      return;
    }

    await copyValue(value, "未检测到可用输入框，内容已复制到剪贴板");
  } catch (error) {
    setPanelStatus(`操作失败：${getErrorMessage(error)}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function handleUndo() {
  undoButton.disabled = true;
  const response = await sendMessageToActivePage({ type: "undo-fill" });

  if (response.status === "undone") {
    setPanelStatus("已撤销上次填写", "copied");
  } else if (response.status === "unavailable") {
    setPanelStatus("页面脚本不可用，请刷新网页后重试", "error");
  } else if (response.status === "error") {
    setPanelStatus("撤销失败", "error");
  } else {
    setPanelStatus("当前页面没有可撤销的填写", "warning");
  }
}

async function refreshUndoAvailability() {
  const response = await sendMessageToActivePage({ type: "get-fill-status" });
  undoButton.disabled = !(
    response.status === "ready" && response.canUndo === true
  );
}

/**
 * @param {string} value
 * @param {string} message
 */
async function copyValue(value, message) {
  await navigator.clipboard.writeText(value);
  setPanelStatus(message, "copied");
}

/**
 * @param {Record<string, unknown>} message
 * @returns {Promise<Record<string, unknown> & { status: string }>}
 */
async function sendMessageToActivePage(message) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "route-to-active-page",
      payload: message,
    });

    if (
      typeof response === "object" &&
      response !== null &&
      typeof response.status === "string"
    ) {
      return response;
    }
  } catch {
    return { status: "unavailable" };
  }

  return { status: "unavailable" };
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
 * @param {string} message
 * @param {"loaded" | "working" | "copied" | "warning" | "error"} state
 */
function setPanelStatus(message, state) {
  panelStatus.textContent = message;
  panelStatus.dataset.state = state;
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
