// @ts-check

import { createElement } from "../lib/dom.js";

/** @typedef {import("../lib/schema.js").Resume} Resume */

/**
 * @typedef {object} ResumeListHandlers
 * @property {(resumeId: string) => void} onSelect
 * @property {(resume: Resume, name: string) => void} onRename
 * @property {(resumeId: string) => void} onActivate
 * @property {(resumeId: string) => void} onDuplicate
 * @property {(resumeId: string) => void} onDelete
 */

/**
 * 渲染简历版本列表和每份简历的操作菜单。
 *
 * @param {HTMLElement} container
 * @param {Resume[]} resumes
 * @param {string} selectedResumeId
 * @param {string} activeResumeId
 * @param {ResumeListHandlers} handlers
 */
export function renderResumeList(
  container,
  resumes,
  selectedResumeId,
  activeResumeId,
  handlers,
) {
  container.replaceChildren(
    ...resumes.map((resume) =>
      createResumeItem(
        resume,
        selectedResumeId,
        activeResumeId,
        resumes.length,
        handlers,
      ),
    ),
  );
}

/**
 * @param {Resume} resume
 * @param {string} selectedResumeId
 * @param {string} activeResumeId
 * @param {number} resumeCount
 * @param {ResumeListHandlers} handlers
 * @returns {HTMLElement}
 */
function createResumeItem(
  resume,
  selectedResumeId,
  activeResumeId,
  resumeCount,
  handlers,
) {
  const item = createElement("div", {
    classNames: [
      "resume-list-item",
      ...(resume.id === selectedResumeId ? ["resume-list-item--selected"] : []),
    ],
  });
  const selectButton = createElement("button", {
    classNames: ["resume-select-button"],
  });
  const name = createElement("span", {
    text: resume.name,
    classNames: ["resume-list-name"],
  });
  selectButton.type = "button";
  selectButton.title = "选择这份简历";
  selectButton.addEventListener("click", () => handlers.onSelect(resume.id));
  selectButton.append(name);

  if (resume.id === activeResumeId) {
    selectButton.append(
      createElement("span", {
        text: "在用",
        classNames: ["active-badge"],
      }),
    );
  }

  const menu = document.createElement("details");
  menu.className = "resume-menu";
  const menuButton = document.createElement("summary");
  menuButton.textContent = "更多";
  menuButton.setAttribute("aria-label", `管理${resume.name}`);
  const menuContent = createElement("div", {
    classNames: ["resume-menu-content"],
  });

  if (resume.id !== activeResumeId) {
    menuContent.append(
      createMenuButton("设为当前使用", () => handlers.onActivate(resume.id)),
    );
  }

  menuContent.append(
    createMenuButton("重命名", startRename),
    createMenuButton("复制一份", () => handlers.onDuplicate(resume.id)),
    createMenuButton(
      "删除",
      () => handlers.onDelete(resume.id),
      "resume-menu-action--danger",
      resumeCount <= 1,
    ),
  );
  menu.append(menuButton, menuContent);
  name.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    startRename();
  });
  item.append(selectButton, menu);
  return item;

  function startRename() {
    menu.open = false;
    selectButton.hidden = true;
    const input = document.createElement("input");
    input.className = "resume-rename-input";
    input.value = resume.name;
    input.setAttribute("aria-label", `重命名${resume.name}`);
    item.insertBefore(input, menu);
    input.focus();
    input.select();
    let finished = false;

    const finish = (shouldSave) => {
      if (finished) {
        return;
      }

      finished = true;
      const nextName = input.value.trim();
      input.remove();
      selectButton.hidden = false;

      if (shouldSave && nextName !== "" && nextName !== resume.name) {
        handlers.onRename(resume, nextName);
      }
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  }
}

/**
 * @param {string} text
 * @param {() => void} action
 * @param {string} [className]
 * @param {boolean} [disabled]
 * @returns {HTMLButtonElement}
 */
function createMenuButton(text, action, className, disabled = false) {
  const button = createElement("button", {
    text,
    classNames: ["resume-menu-action", ...(className ? [className] : [])],
  });
  button.type = "button";
  button.disabled = disabled;
  button.addEventListener("click", action);
  return button;
}
