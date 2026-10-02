// @ts-check

import { renderContentEditor } from "./content-editor.js";
import { renderResumeList } from "./resume-list.js";
import { renderFieldManager, renderModuleManager } from "./schema-editor.js";
import {
  createEmptyGroup,
  createFieldId,
  createModuleId,
} from "../lib/schema.js";
import {
  createResume,
  deleteResume,
  duplicateResume,
  getResumeCollection,
  renameResume,
  saveResume,
  setActiveResume,
} from "../lib/storage.js";

/** @typedef {import("../lib/schema.js").FieldType} FieldType */
/** @typedef {import("../lib/schema.js").ModuleKind} ModuleKind */
/** @typedef {import("../lib/schema.js").Resume} Resume */
/** @typedef {import("../lib/schema.js").ResumeField} ResumeField */
/** @typedef {import("../lib/schema.js").ResumeGroup} ResumeGroup */
/** @typedef {import("../lib/schema.js").ResumeModule} ResumeModule */
/** @typedef {import("../lib/storage.js").ResumeCollection} ResumeCollection */

const createResumeButton = getElement("create-resume", HTMLButtonElement);
const fieldManager = getElement("field-manager", HTMLElement);
const moduleManager = getElement("module-manager", HTMLElement);
const moduleNavigation = getElement("module-navigation", HTMLElement);
const pageError = getElement("page-error", HTMLParagraphElement);
const resumeCount = getElement("resume-count", HTMLElement);
const resumeForm = getElement("resume-form", HTMLFormElement);
const resumeList = getElement("resume-list", HTMLDivElement);
const resumeTitle = getElement("resume-title", HTMLHeadingElement);
const saveButton = getElement("save-resume", HTMLButtonElement);
const saveStatus = getElement("save-status", HTMLParagraphElement);
const tabButtons = Array.from(document.querySelectorAll(".editor-tab"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

/** @type {ResumeCollection | null} */
let collection = null;
/** @type {Resume | null} */
let currentResume = null;
let selectedResumeId = "";
/** @type {string | null} */
let selectedFieldModuleId = null;
let activeTab = "content";
let hasUnsavedChanges = false;
let isSaving = false;

resumeForm.addEventListener("submit", (event) => event.preventDefault());
saveButton.addEventListener("click", () => void handleSave());
createResumeButton.addEventListener("click", () => void handleCreateResume());

for (const tabButton of tabButtons) {
  tabButton.addEventListener("click", () => {
    const tabName = tabButton.getAttribute("data-tab");

    if (tabName !== null) {
      setActiveTab(tabName);
    }
  });
}

void loadPage();

async function loadPage() {
  try {
    collection = await getResumeCollection();
    selectedResumeId = collection.activeResumeId;
    currentResume = copyForEditing(getSelectedStoredResume());
    selectedFieldModuleId = currentResume.modules[0]?.id ?? null;
    renderPage();
    setSaveState("已读取本地简历", "saved");
  } catch (error) {
    showPageError(getErrorMessage(error));
  }
}

function renderPage() {
  if (collection === null || currentResume === null) {
    return;
  }

  resumeTitle.textContent = currentResume.name;
  resumeCount.textContent = `${collection.resumes.length} 份`;
  renderResumeList(
    resumeList,
    collection.resumes,
    selectedResumeId,
    collection.activeResumeId,
    {
      onSelect: (resumeId) => void handleSelectResume(resumeId),
      onRename: (resume, name) => void handleRenameResume(resume, name),
      onActivate: (resumeId) => void handleActivateResume(resumeId),
      onDuplicate: (resumeId) => void handleDuplicateResume(resumeId),
      onDelete: (resumeId) => void handleDeleteResume(resumeId),
    },
  );
  renderEditors();
  setActiveTab(activeTab);
}

function renderEditors() {
  if (currentResume === null) {
    return;
  }

  renderContentEditor(resumeForm, moduleNavigation, currentResume, {
    onChange: markDirty,
    onStructureChange: (module) => {
      markDirty();
      renderEditors();
      document.querySelector(`#module-${module.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    onRemoveGroup: (module, groupIndex) => {
      const groups = currentResume?.values[module.id];

      if (Array.isArray(groups)) {
        groups.splice(groupIndex, 1);
        markDirty();
        renderEditors();
      }
    },
  });
  renderModuleManager(moduleManager, currentResume, {
    onAdd: handleAddModule,
    onRename: handleRenameModule,
    onKindChange: handleModuleKindChange,
    onDelete: handleDeleteModule,
    onMove: (sourceId, targetId) => {
      if (moveItem(currentResume.modules, sourceId, targetId)) {
        markDirtyAndRender();
      }
    },
    onMoveByOffset: (moduleId, offset) => {
      if (moveItemByOffset(currentResume.modules, moduleId, offset)) {
        markDirtyAndRender();
      }
    },
  });
  renderFieldManager(
    fieldManager,
    currentResume,
    selectedFieldModuleId,
    {
      onSelectModule: (moduleId) => {
        selectedFieldModuleId = moduleId;
        renderEditors();
      },
      onAdd: handleAddField,
      onRename: handleRenameField,
      onTypeChange: (module, field, type) => {
        field.type = type;
        markDirtyAndRender();
      },
      onDelete: handleDeleteField,
      onMove: (module, sourceId, targetId) => {
        if (moveItem(module.fields, sourceId, targetId)) {
          markDirtyAndRender();
        }
      },
      onMoveByOffset: (module, fieldId, offset) => {
        if (moveItemByOffset(module.fields, fieldId, offset)) {
          markDirtyAndRender();
        }
      },
    },
  );
}

/**
 * @param {string} resumeId
 */
async function handleSelectResume(resumeId) {
  if (resumeId === selectedResumeId || !confirmDiscardChanges()) {
    return;
  }

  selectedResumeId = resumeId;
  currentResume = copyForEditing(getSelectedStoredResume());
  selectedFieldModuleId = currentResume.modules[0]?.id ?? null;
  hasUnsavedChanges = false;
  saveButton.disabled = true;
  renderPage();
  setSaveState("已切换编辑版本", "saved");
}

async function handleCreateResume() {
  if (!confirmDiscardChanges()) {
    return;
  }

  try {
    const resume = await createResume();
    await refreshCollection(resume.id);
    setSaveState("已新建空白简历", "saved");
  } catch (error) {
    showActionError("新建失败", error);
  }
}

/**
 * @param {Resume} resume
 * @param {string} name
 */
async function handleRenameResume(resume, name) {
  try {
    const renamedResume = await renameResume(resume.id, name);

    if (currentResume?.id === renamedResume.id) {
      currentResume.name = renamedResume.name;
    }

    await refreshCollection(selectedResumeId, true);
    setSaveState("简历已重命名", hasUnsavedChanges ? "dirty" : "saved");
  } catch (error) {
    showActionError("重命名失败", error);
  }
}

/**
 * @param {string} resumeId
 */
async function handleActivateResume(resumeId) {
  try {
    await setActiveResume(resumeId);

    if (collection !== null) {
      collection.activeResumeId = resumeId;
    }

    renderPage();
    setSaveState("已更新侧边栏当前简历", hasUnsavedChanges ? "dirty" : "saved");
  } catch (error) {
    showActionError("切换当前简历失败", error);
  }
}

/**
 * @param {string} resumeId
 */
async function handleDuplicateResume(resumeId) {
  if (hasUnsavedChanges && resumeId === selectedResumeId) {
    window.alert("请先保存当前更改，再复制这份简历。");
    return;
  }

  try {
    const copy = await duplicateResume(resumeId);
    await refreshCollection(copy.id);
    setSaveState("已复制简历", "saved");
  } catch (error) {
    showActionError("复制失败", error);
  }
}

/**
 * @param {string} resumeId
 */
async function handleDeleteResume(resumeId) {
  const target = collection?.resumes.find((resume) => resume.id === resumeId);

  if (target === undefined) {
    return;
  }

  if (!window.confirm(`确定删除简历“${target.name}”吗？此操作无法撤销。`)) {
    return;
  }

  try {
    const updatedCollection = await deleteResume(resumeId);
    const selectedWasDeleted = selectedResumeId === resumeId;
    collection = updatedCollection;

    if (selectedWasDeleted) {
      selectedResumeId = updatedCollection.activeResumeId;
      currentResume = copyForEditing(getSelectedStoredResume());
      selectedFieldModuleId = currentResume.modules[0]?.id ?? null;
      hasUnsavedChanges = false;
      saveButton.disabled = true;
    }

    renderPage();
    setSaveState("简历已删除", hasUnsavedChanges ? "dirty" : "saved");
  } catch (error) {
    showActionError("删除失败", error);
  }
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
    await refreshCollection(selectedResumeId, true);
    setSaveState("已保存到本地浏览器", "saved");
  } catch (error) {
    setSaveState(`保存失败：${getErrorMessage(error)}`, "error");
    saveButton.disabled = false;
  } finally {
    isSaving = false;
  }
}

function handleAddModule() {
  if (currentResume === null) {
    return;
  }

  const name = window.prompt("请输入模块名称", "新模块")?.trim();

  if (name === undefined || name === "") {
    return;
  }

  const module = {
    id: createModuleId(),
    name,
    kind: /** @type {ModuleKind} */ ("single"),
    fields: [],
  };
  currentResume.modules.push(module);
  currentResume.values[module.id] = {};
  selectedFieldModuleId = module.id;
  markDirtyAndRender();
}

/**
 * @param {ResumeModule} module
 */
function handleRenameModule(module) {
  const name = window.prompt("请输入新的模块名称", module.name)?.trim();

  if (name === undefined || name === "" || name === module.name) {
    return;
  }

  module.name = name;
  markDirtyAndRender();
}

/**
 * @param {ResumeModule} module
 * @param {ModuleKind} kind
 */
function handleModuleKindChange(module, kind) {
  if (currentResume === null || module.kind === kind) {
    return;
  }

  const storedValue = currentResume.values[module.id];

  if (kind === "multi") {
    currentResume.values[module.id] = isResumeGroup(storedValue)
      ? [storedValue]
      : [createEmptyGroup(module)];
  } else {
    const groups = Array.isArray(storedValue) ? storedValue : [];

    if (
      groups.length > 1 &&
      !window.confirm("切换为单组后只会保留第一组内容，确定继续吗？")
    ) {
      renderEditors();
      return;
    }

    currentResume.values[module.id] = groups[0] ?? createEmptyGroup(module);
  }

  module.kind = kind;
  markDirtyAndRender();
}

/**
 * @param {ResumeModule} module
 */
function handleDeleteModule(module) {
  if (
    currentResume === null ||
    !window.confirm(`确定删除模块“${module.name}”及其中全部内容吗？`)
  ) {
    return;
  }

  currentResume.modules = currentResume.modules.filter(
    (candidate) => candidate.id !== module.id,
  );
  delete currentResume.values[module.id];

  if (selectedFieldModuleId === module.id) {
    selectedFieldModuleId = currentResume.modules[0]?.id ?? null;
  }

  markDirtyAndRender();
}

/**
 * @param {ResumeModule} module
 */
function handleAddField(module) {
  const label = window.prompt("请输入字段名称", "新字段")?.trim();

  if (label === undefined || label === "") {
    return;
  }

  const field = {
    id: createFieldId(),
    label,
    type: /** @type {FieldType} */ ("text"),
  };
  module.fields.push(field);
  updateGroups(module, (group) => {
    group[field.id] = "";
  });
  markDirtyAndRender();
}

/**
 * @param {ResumeModule} module
 * @param {ResumeField} field
 */
function handleRenameField(module, field) {
  const label = window.prompt("请输入新的字段名称", field.label)?.trim();

  if (label === undefined || label === "" || label === field.label) {
    return;
  }

  field.label = label;
  markDirtyAndRender();
}

/**
 * @param {ResumeModule} module
 * @param {ResumeField} field
 */
function handleDeleteField(module, field) {
  if (!window.confirm(`确定删除字段“${field.label}”及对应内容吗？`)) {
    return;
  }

  module.fields = module.fields.filter((candidate) => candidate.id !== field.id);
  updateGroups(module, (group) => {
    delete group[field.id];
  });
  markDirtyAndRender();
}

/**
 * @param {ResumeModule} module
 * @param {(group: ResumeGroup) => void} update
 */
function updateGroups(module, update) {
  if (currentResume === null) {
    return;
  }

  const value = currentResume.values[module.id];

  if (Array.isArray(value)) {
    value.forEach(update);
  } else if (isResumeGroup(value)) {
    update(value);
  }
}

/**
 * @template {{ id: string }} Item
 * @param {Item[]} items
 * @param {string} sourceId
 * @param {string} targetId
 * @returns {boolean}
 */
function moveItem(items, sourceId, targetId) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return false;
  }

  const [item] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, item);
  return true;
}

/**
 * @template {{ id: string }} Item
 * @param {Item[]} items
 * @param {string} itemId
 * @param {number} offset
 * @returns {boolean}
 */
function moveItemByOffset(items, itemId, offset) {
  const sourceIndex = items.findIndex((item) => item.id === itemId);

  if (sourceIndex < 0) {
    return false;
  }

  const targetIndex = Math.max(0, Math.min(items.length - 1, sourceIndex + offset));

  if (sourceIndex === targetIndex) {
    return false;
  }

  const [item] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, item);
  return true;
}

/**
 * @param {string} tabName
 */
function setActiveTab(tabName) {
  activeTab = tabName;

  for (const button of tabButtons) {
    const isActive = button.getAttribute("data-tab") === tabName;
    button.classList.toggle("editor-tab--active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of tabPanels) {
    panel.toggleAttribute("hidden", panel.getAttribute("data-panel") !== tabName);
  }
}

function markDirty() {
  hasUnsavedChanges = true;
  saveButton.disabled = false;
  setSaveState("有未保存的更改", "dirty");
}

function markDirtyAndRender() {
  markDirty();
  renderEditors();
}

/**
 * @param {string} selectedId
 * @param {boolean} [preserveCurrentEdits]
 */
async function refreshCollection(selectedId, preserveCurrentEdits = false) {
  collection = await getResumeCollection();
  selectedResumeId = selectedId;

  if (!preserveCurrentEdits) {
    currentResume = copyForEditing(getSelectedStoredResume());
    selectedFieldModuleId = currentResume.modules[0]?.id ?? null;
    hasUnsavedChanges = false;
    saveButton.disabled = true;
  }

  renderPage();
}

/**
 * @returns {Resume}
 */
function getSelectedStoredResume() {
  const resume = collection?.resumes.find(
    (candidate) => candidate.id === selectedResumeId,
  );

  if (resume === undefined) {
    throw new Error("找不到选中的简历。");
  }

  return resume;
}

/**
 * @param {Resume} resume
 * @returns {Resume}
 */
function copyForEditing(resume) {
  return structuredClone(resume);
}

/**
 * @returns {boolean}
 */
function confirmDiscardChanges() {
  return (
    !hasUnsavedChanges ||
    window.confirm("当前简历有未保存的更改，确定放弃这些更改吗？")
  );
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
 * @param {string} title
 * @param {unknown} error
 */
function showActionError(title, error) {
  setSaveState(`${title}：${getErrorMessage(error)}`, "error");
}

/**
 * @param {string} message
 */
function showPageError(message) {
  pageError.textContent = `无法打开简历设置：${message}`;
  pageError.hidden = false;
  resumeForm.replaceChildren();
  moduleNavigation.replaceChildren();
  moduleManager.replaceChildren();
  fieldManager.replaceChildren();
  saveButton.disabled = true;
  setSaveState("读取失败", "error");
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
