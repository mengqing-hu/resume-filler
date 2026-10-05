// @ts-check

import { createElement } from "../lib/dom.js";
import { createEmptyGroup } from "../lib/schema.js";

/** @typedef {import("../lib/schema.js").Resume} Resume */
/** @typedef {import("../lib/schema.js").ResumeField} ResumeField */
/** @typedef {import("../lib/schema.js").ResumeGroup} ResumeGroup */
/** @typedef {import("../lib/schema.js").ResumeModule} ResumeModule */

/**
 * @typedef {object} ContentEditorHandlers
 * @property {() => void} onChange
 * @property {(module: ResumeModule) => void} onStructureChange
 * @property {(module: ResumeModule, groupIndex: number) => void} onRemoveGroup
 */

/**
 * 渲染简历内容编辑区。
 *
 * @param {HTMLFormElement} form
 * @param {HTMLElement} navigation
 * @param {Resume} resume
 * @param {ContentEditorHandlers} handlers
 */
export function renderContentEditor(form, navigation, resume, handlers) {
  navigation.replaceChildren(
    ...resume.modules.map((module) => {
      const link = createElement("a", {
        text: module.name,
        classNames: ["module-navigation-link"],
      });
      link.href = `#module-${module.id}`;
      return link;
    }),
  );
  form.replaceChildren(
    ...resume.modules.map((module) => renderModule(module, resume, handlers)),
  );
}

/**
 * @param {ResumeModule} module
 * @param {Resume} resume
 * @param {ContentEditorHandlers} handlers
 * @returns {HTMLElement}
 */
function renderModule(module, resume, handlers) {
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
    addButton.addEventListener("click", () => {
      getMultiValues(resume, module).push(createEmptyGroup(module));
      handlers.onStructureChange(module);
    });
    heading.append(addButton);
  }

  section.append(heading);

  if (module.fields.length === 0) {
    section.append(
      createElement("p", {
        text: "此模块还没有字段，请前往字段管理添加。",
        classNames: ["module-empty-state"],
      }),
    );
    return section;
  }

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
        section.append(renderMultiGroup(module, group, index, handlers));
      });
    }
  } else {
    section.append(
      renderFieldGrid(module, getSingleValue(resume, module), null, null, handlers),
    );
  }

  return section;
}

/**
 * @param {ResumeModule} module
 * @param {ResumeGroup} group
 * @param {number} groupIndex
 * @param {ContentEditorHandlers} handlers
 * @returns {HTMLElement}
 */
function renderMultiGroup(module, group, groupIndex, handlers) {
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
  deleteButton.addEventListener("click", () => {
    handlers.onRemoveGroup(module, groupIndex);
  });
  groupHeader.append(groupTitle, deleteButton);
  groupCard.append(
    groupHeader,
    renderFieldGrid(module, group, groupIndex, groupTitle, handlers),
  );

  return groupCard;
}

/**
 * @param {ResumeModule} module
 * @param {ResumeGroup} group
 * @param {number | null} groupIndex
 * @param {HTMLHeadingElement | null} groupTitle
 * @param {ContentEditorHandlers} handlers
 * @returns {HTMLElement}
 */
function renderFieldGrid(module, group, groupIndex, groupTitle, handlers) {
  const fieldGrid = createElement("div", { classNames: ["field-grid"] });

  module.fields.forEach((field, fieldIndex) => {
    fieldGrid.append(
      renderField(
        module,
        field,
        group,
        fieldIndex,
        groupIndex,
        groupTitle,
        handlers,
      ),
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
 * @param {ContentEditorHandlers} handlers
 * @returns {HTMLElement}
 */
function renderField(
  module,
  field,
  group,
  fieldIndex,
  groupIndex,
  groupTitle,
  handlers,
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

    handlers.onChange();
  });

  fieldContainer.append(label, input);
  return fieldContainer;
}

/**
 * @param {Resume} resume
 * @param {ResumeModule} module
 * @returns {ResumeGroup}
 */
function getSingleValue(resume, module) {
  const storedValue = resume.values[module.id];

  if (isResumeGroup(storedValue)) {
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
 * @param {unknown} value
 * @returns {value is ResumeGroup}
 */
function isResumeGroup(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
