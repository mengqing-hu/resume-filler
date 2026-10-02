// @ts-check

import { createElement } from "../lib/dom.js";

/** @typedef {import("../lib/schema.js").FieldType} FieldType */
/** @typedef {import("../lib/schema.js").ModuleKind} ModuleKind */
/** @typedef {import("../lib/schema.js").Resume} Resume */
/** @typedef {import("../lib/schema.js").ResumeField} ResumeField */
/** @typedef {import("../lib/schema.js").ResumeModule} ResumeModule */

/**
 * @typedef {object} ModuleManagerHandlers
 * @property {() => void} onAdd
 * @property {(module: ResumeModule) => void} onRename
 * @property {(module: ResumeModule, kind: ModuleKind) => void} onKindChange
 * @property {(module: ResumeModule) => void} onDelete
 * @property {(sourceId: string, targetId: string) => void} onMove
 * @property {(moduleId: string, offset: number) => void} onMoveByOffset
 */

/**
 * @typedef {object} FieldManagerHandlers
 * @property {(moduleId: string) => void} onSelectModule
 * @property {(module: ResumeModule) => void} onAdd
 * @property {(module: ResumeModule, field: ResumeField) => void} onRename
 * @property {(module: ResumeModule, field: ResumeField, type: FieldType) => void} onTypeChange
 * @property {(module: ResumeModule, field: ResumeField) => void} onDelete
 * @property {(module: ResumeModule, sourceId: string, targetId: string) => void} onMove
 * @property {(module: ResumeModule, fieldId: string, offset: number) => void} onMoveByOffset
 */

/**
 * 渲染模块管理列表。
 *
 * @param {HTMLElement} container
 * @param {Resume} resume
 * @param {ModuleManagerHandlers} handlers
 */
export function renderModuleManager(container, resume, handlers) {
  const header = createManagementHeader(
    "模块管理",
    "双击模块名称可重命名。拖动把手或聚焦后按上下方向键可调整顺序。",
    "新增模块",
    handlers.onAdd,
  );
  const list = createElement("div", { classNames: ["management-list"] });

  for (const module of resume.modules) {
    const row = createElement("div", {
      classNames: ["management-row"],
    });
    row.dataset.itemId = module.id;
    const handle = createDragHandle(
      `移动模块：${module.name}`,
      module.id,
      row,
      handlers.onMove,
      (offset) => handlers.onMoveByOffset(module.id, offset),
    );
    const nameButton = createElement("button", {
      text: module.name,
      classNames: ["management-name"],
    });
    nameButton.type = "button";
    nameButton.title = "双击重命名";
    nameButton.addEventListener("dblclick", () => handlers.onRename(module));
    const kindSelect = document.createElement("select");
    kindSelect.className = "kind-select";
    kindSelect.setAttribute("aria-label", `${module.name}的模块类型`);
    kindSelect.append(
      createOption("single", "单组", module.kind === "single"),
      createOption("multi", "多组", module.kind === "multi"),
    );
    kindSelect.addEventListener("change", () => {
      handlers.onKindChange(module, /** @type {ModuleKind} */ (kindSelect.value));
    });
    const deleteButton = createDeleteButton(`删除${module.name}`, () =>
      handlers.onDelete(module),
    );
    row.append(handle, nameButton, kindSelect, deleteButton);
    list.append(row);
  }

  if (resume.modules.length === 0) {
    list.append(createEmptyState("当前简历没有模块，请先新增模块。"));
  }

  container.replaceChildren(header, list);
}

/**
 * 渲染字段管理列表。
 *
 * @param {HTMLElement} container
 * @param {Resume} resume
 * @param {string | null} selectedModuleId
 * @param {FieldManagerHandlers} handlers
 */
export function renderFieldManager(
  container,
  resume,
  selectedModuleId,
  handlers,
) {
  const selectedModule =
    resume.modules.find((module) => module.id === selectedModuleId) ??
    resume.modules[0] ??
    null;
  const toolbar = createElement("div", {
    classNames: ["field-manager-toolbar"],
  });
  const toolbarText = createElement("div");
  toolbarText.append(
    createElement("h3", { text: "字段管理" }),
    createElement("p", {
      text: "第一项字段会作为多组模块的标题。拖动把手或按上下方向键可调整顺序。",
    }),
  );
  const moduleSelect = document.createElement("select");
  moduleSelect.className = "module-select";
  moduleSelect.setAttribute("aria-label", "选择要管理字段的模块");

  for (const module of resume.modules) {
    moduleSelect.append(
      createOption(module.id, module.name, module.id === selectedModule?.id),
    );
  }

  moduleSelect.disabled = selectedModule === null;
  moduleSelect.addEventListener("change", () =>
    handlers.onSelectModule(moduleSelect.value),
  );
  toolbar.append(toolbarText, moduleSelect);

  if (selectedModule === null) {
    container.replaceChildren(
      toolbar,
      createEmptyState("请先在模块管理中新增模块。"),
    );
    return;
  }

  const actionRow = createElement("div", { classNames: ["management-actions"] });
  const addButton = createElement("button", {
    text: "新增字段",
    classNames: ["secondary-button"],
  });
  addButton.type = "button";
  addButton.addEventListener("click", () => handlers.onAdd(selectedModule));
  actionRow.append(addButton);

  const list = createElement("div", { classNames: ["management-list"] });

  for (const field of selectedModule.fields) {
    const row = createElement("div", {
      classNames: ["management-row", "field-management-row"],
    });
    row.dataset.itemId = field.id;
    const handle = createDragHandle(
      `移动字段：${field.label}`,
      field.id,
      row,
      (sourceId, targetId) => handlers.onMove(selectedModule, sourceId, targetId),
      (offset) => handlers.onMoveByOffset(selectedModule, field.id, offset),
    );
    const nameButton = createElement("button", {
      text: field.label,
      classNames: ["management-name"],
    });
    nameButton.type = "button";
    nameButton.title = "双击重命名";
    nameButton.addEventListener("dblclick", () =>
      handlers.onRename(selectedModule, field),
    );
    const typeSelect = document.createElement("select");
    typeSelect.className = "kind-select";
    typeSelect.setAttribute("aria-label", `${field.label}的字段类型`);
    typeSelect.append(
      createOption("text", "单行文本", field.type === "text"),
      createOption("textarea", "多行文本", field.type === "textarea"),
      createOption("date", "日期", field.type === "date"),
    );
    typeSelect.addEventListener("change", () => {
      handlers.onTypeChange(
        selectedModule,
        field,
        /** @type {FieldType} */ (typeSelect.value),
      );
    });
    const deleteButton = createDeleteButton(`删除${field.label}`, () =>
      handlers.onDelete(selectedModule, field),
    );
    row.append(handle, nameButton, typeSelect, deleteButton);
    list.append(row);
  }

  if (selectedModule.fields.length === 0) {
    list.append(createEmptyState("这个模块还没有字段。"));
  }

  container.replaceChildren(toolbar, actionRow, list);
}

/**
 * @param {string} title
 * @param {string} description
 * @param {string} actionText
 * @param {() => void} action
 * @returns {HTMLElement}
 */
function createManagementHeader(title, description, actionText, action) {
  const header = createElement("div", { classNames: ["management-header"] });
  const text = createElement("div");
  text.append(
    createElement("h3", { text: title }),
    createElement("p", { text: description }),
  );
  const button = createElement("button", {
    text: actionText,
    classNames: ["secondary-button"],
  });
  button.type = "button";
  button.addEventListener("click", action);
  header.append(text, button);
  return header;
}

/**
 * @param {string} label
 * @param {string} itemId
 * @param {HTMLElement} row
 * @param {(sourceId: string, targetId: string) => void} onMove
 * @param {(offset: number) => void} onMoveByOffset
 * @returns {HTMLButtonElement}
 */
function createDragHandle(
  label,
  itemId,
  row,
  onMove,
  onMoveByOffset,
) {
  const handle = createElement("button", {
    text: "拖动",
    classNames: ["drag-handle"],
  });
  handle.type = "button";
  handle.draggable = true;
  handle.setAttribute("aria-label", label);
  handle.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", itemId);

    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = "move";
    }
  });
  row.addEventListener("dragover", (event) => {
    event.preventDefault();
    row.classList.add("management-row--drop-target");
  });
  row.addEventListener("dragleave", () => {
    row.classList.remove("management-row--drop-target");
  });
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    row.classList.remove("management-row--drop-target");
    const sourceId = event.dataTransfer?.getData("text/plain") ?? "";

    if (sourceId !== "" && sourceId !== itemId) {
      onMove(sourceId, itemId);
    }
  });
  handle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onMoveByOffset(event.key === "ArrowUp" ? -1 : 1);
    }
  });
  return handle;
}

/**
 * @param {string} label
 * @param {() => void} action
 * @returns {HTMLButtonElement}
 */
function createDeleteButton(label, action) {
  const button = createElement("button", {
    text: "删除",
    classNames: ["text-button", "text-button--danger"],
  });
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}

/**
 * @param {string} value
 * @param {string} label
 * @param {boolean} selected
 * @returns {HTMLOptionElement}
 */
function createOption(value, label, selected) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  return option;
}

/**
 * @param {string} message
 * @returns {HTMLParagraphElement}
 */
function createEmptyState(message) {
  return createElement("p", {
    text: message,
    classNames: ["management-empty-state"],
  });
}
