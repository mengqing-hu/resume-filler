// @ts-check

import { renderContentEditor } from "./content-editor.js";
import { renderResumeList } from "./resume-list.js";
import { renderFieldManager, renderModuleManager } from "./schema-editor.js";
import { createBackupDocument, parseBackupDocument } from "../lib/backup.js";
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
  importResumes,
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
const backupFileInput = getElement("backup-file", HTMLInputElement);
const exportAllButton = getElement("export-all", HTMLButtonElement);
const fieldManager = getElement("field-manager", HTMLElement);
const importBackupButton = getElement("import-backup", HTMLButtonElement);
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
let changeRevision = 0;
/** @type {number | null} */
let autoSaveTimer = null;
/** @type {Promise<boolean> | null} */
let saveInProgress = null;

resumeForm.addEventListener("submit", (event) => event.preventDefault());
saveButton.addEventListener("click", () => void flushPendingSave());
createResumeButton.addEventListener("click", () => void handleCreateResume());
exportAllButton.addEventListener("click", () => void handleExportAll());
importBackupButton.addEventListener("click", () => backupFileInput.click());
backupFileInput.addEventListener("change", () => {
  const file = backupFileInput.files?.[0];
  backupFileInput.value = "";

  if (file !== undefined) {
    void handleImportBackup(file);
  }
});
window.addEventListener("beforeunload", (event) => {
  if (hasUnsavedChanges || saveInProgress !== null) {
    event.preventDefault();
    event.returnValue = "";
  }
});

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
      onExport: (resumeId) => void handleExportResume(resumeId),
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
  if (resumeId === selectedResumeId || !(await flushPendingSave())) {
    return;
  }

  selectedResumeId = resumeId;
  currentResume = copyForEditing(getSelectedStoredResume());
  selectedFieldModuleId = currentResume.modules[0]?.id ?? null;
  hasUnsavedChanges = false;
  changeRevision = 0;
  saveButton.disabled = true;
  renderPage();
  setSaveState("已切换编辑版本", "saved");
}

async function handleCreateResume() {
  if (!(await flushPendingSave())) {
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
  if (!(await flushPendingSave())) {
    return;
  }

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
  if (!(await flushPendingSave())) {
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

  if (!(await flushPendingSave())) {
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
      changeRevision = 0;
      cancelAutoSave();
      saveButton.disabled = true;
    }

    renderPage();
    setSaveState("简历已删除", hasUnsavedChanges ? "dirty" : "saved");
  } catch (error) {
    showActionError("删除失败", error);
  }
}

async function handleExportAll() {
  if (!(await flushPendingSave()) || collection === null) {
    return;
  }

  try {
    downloadBackup(
      collection.resumes,
      collection.activeResumeId,
      `resume-filler-${createDateStamp()}.resume-backup.json`,
    );
    setSaveState("全部简历已导出", "saved");
  } catch (error) {
    showActionError("导出失败", error);
  }
}

/**
 * @param {string} resumeId
 */
async function handleExportResume(resumeId) {
  if (!(await flushPendingSave()) || collection === null) {
    return;
  }

  const resume = collection.resumes.find((candidate) => candidate.id === resumeId);

  if (resume === undefined) {
    showActionError("导出失败", new Error("找不到要导出的简历。"));
    return;
  }

  try {
    downloadBackup(
      [resume],
      resume.id,
      `${createSafeFileName(resume.name)}-${createDateStamp()}.resume-backup.json`,
    );
    setSaveState(`已导出“${resume.name}”`, "saved");
  } catch (error) {
    showActionError("导出失败", error);
  }
}

/**
 * @param {File} file
 */
async function handleImportBackup(file) {
  if (!(await flushPendingSave())) {
    return;
  }

  try {
    const backup = parseBackupDocument(await file.text());

    if (
      !window.confirm(
        `备份中包含 ${backup.resumes.length} 份简历，确定作为新版本导入吗？`,
      )
    ) {
      return;
    }

    const imported = await importResumes(backup.resumes);
    await refreshCollection(imported[0].id);
    setSaveState(`已导入 ${imported.length} 份简历`, "saved");
  } catch (error) {
    showActionError("导入失败", error);
  }
}

/**
 * @param {Resume[]} resumes
 * @param {string} activeResumeId
 * @param {string} fileName
 */
function downloadBackup(resumes, activeResumeId, fileName) {
  const backup = createBackupDocument(resumes, activeResumeId);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * @returns {string}
 */
function createDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} value
 * @returns {string}
 */
function createSafeFileName(value) {
  const safeName = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return safeName || "resume";
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
  changeRevision += 1;
  hasUnsavedChanges = true;
  saveButton.disabled = false;
  setSaveState("等待自动保存", "dirty");
  scheduleAutoSave();
}

function markDirtyAndRender() {
  markDirty();
  renderEditors();
}

function scheduleAutoSave() {
  cancelAutoSave();
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null;
    void saveCurrentRevision();
  }, 800);
}

function cancelAutoSave() {
  if (autoSaveTimer !== null) {
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/**
 * 保存当前修订；保存期间产生的新修改会继续保持待保存状态。
 *
 * @returns {Promise<boolean>}
 */
async function saveCurrentRevision() {
  if (currentResume === null || !hasUnsavedChanges) {
    return true;
  }

  if (saveInProgress !== null) {
    return saveInProgress;
  }

  cancelAutoSave();
  const revision = changeRevision;
  const resumeId = currentResume.id;
  const snapshot = structuredClone(currentResume);
  saveButton.disabled = true;
  setSaveState("正在自动保存...", "saving");

  saveInProgress = (async () => {
    try {
      const savedResume = await saveResume(snapshot);
      const storedIndex = collection?.resumes.findIndex(
        (resume) => resume.id === savedResume.id,
      );

      if (collection !== null && storedIndex !== undefined && storedIndex >= 0) {
        collection.resumes[storedIndex] = savedResume;
      }

      if (currentResume?.id === resumeId) {
        currentResume.updatedAt = savedResume.updatedAt;
      }

      if (currentResume?.id === resumeId && changeRevision === revision) {
        hasUnsavedChanges = false;
        saveButton.disabled = true;
        setSaveState("已自动保存到本地浏览器", "saved");
      } else if (currentResume?.id === resumeId) {
        saveButton.disabled = false;
        setSaveState("有新的更改等待保存", "dirty");
      }

      return true;
    } catch (error) {
      setSaveState(`自动保存失败：${getErrorMessage(error)}`, "error");
      saveButton.disabled = false;
      return false;
    }
  })();

  const succeeded = await saveInProgress;
  saveInProgress = null;

  if (succeeded && hasUnsavedChanges) {
    scheduleAutoSave();
  }

  return succeeded;
}

/**
 * 在切换、导入或导出前保存全部待处理修订。
 *
 * @returns {Promise<boolean>}
 */
async function flushPendingSave() {
  cancelAutoSave();

  while (hasUnsavedChanges) {
    if (!(await saveCurrentRevision())) {
      return false;
    }
  }

  return true;
}

/**
 * @param {string} selectedId
 * @param {boolean} [preserveCurrentEdits]
 */
async function refreshCollection(selectedId, preserveCurrentEdits = false) {
  collection = await getResumeCollection();
  selectedResumeId = selectedId;

  if (!preserveCurrentEdits) {
    cancelAutoSave();
    currentResume = copyForEditing(getSelectedStoredResume());
    selectedFieldModuleId = currentResume.modules[0]?.id ?? null;
    hasUnsavedChanges = false;
    changeRevision = 0;
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
