// @ts-check

(() => {
  "use strict";

  const namespace = (globalThis.ResumeFillerContent ??= {});

  if (namespace.initialized === true) {
    return;
  }

  namespace.initialized = true;

  const supportedInputTypes = new Set([
    "date",
    "datetime-local",
    "email",
    "month",
    "number",
    "search",
    "tel",
    "text",
    "time",
    "url",
    "week",
  ]);

  /** @type {HTMLInputElement | HTMLTextAreaElement | null} */
  let lastFocusedElement = null;
  /** @type {{ element: HTMLInputElement | HTMLTextAreaElement, value: string } | null} */
  let undoEntry = null;
  let extensionContextAvailable = true;

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.composedPath()[0];
      lastFocusedElement = isSupportedField(target) ? target : null;
      notifyFocusState(lastFocusedElement !== null);
    },
    true,
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.composedPath()[0];

      if (!isSupportedField(target)) {
        lastFocusedElement = null;
        notifyFocusState(false);
      }
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isFillMessage(message)) {
      void fillLastFocusedField(
        message.value,
        message.ignoreMaxLength === true,
      )
        .then(sendResponse)
        .catch(() => {});
      return true;
    }

    if (isUndoMessage(message)) {
      sendResponse(undoLastFill());
      return false;
    }

    if (isStatusMessage(message)) {
      sendResponse({ status: "ready", canUndo: hasUndoEntry() });
      return false;
    }

    return false;
  });

  /**
   * 将内容写入最后获得焦点的输入框，并触发表单框架常用事件。
   *
   * @param {string} value
   * @param {boolean} ignoreMaxLength
   * @returns {Promise<{ status: string, maxLength?: number, valueLength?: number }>}
   */
  async function fillLastFocusedField(value, ignoreMaxLength) {
    const target = lastFocusedElement;

    if (
      target === null ||
      !target.isConnected ||
      !isSupportedField(target)
    ) {
      lastFocusedElement = null;
      return { status: "no-target" };
    }

    const compatibleValue = getCompatibleValue(target, value);
    const maxLength = target.maxLength;

    if (
      !ignoreMaxLength &&
      maxLength >= 0 &&
      compatibleValue.length > maxLength
    ) {
      return {
        status: "maxlength-exceeded",
        maxLength,
        valueLength: compatibleValue.length,
      };
    }

    const previousValue = target.value;

    try {
      setNativeValue(target, compatibleValue);

      if (target.value !== compatibleValue) {
        setNativeValue(target, previousValue);
        return { status: "error" };
      }

      dispatchFormEvents(target, compatibleValue);
      await waitForPageUpdate();

      if (!target.isConnected || target.value !== compatibleValue) {
        return { status: "error" };
      }

      highlightField(target, "#dbeafe");
      undoEntry = { element: target, value: previousValue };
      return { status: "filled" };
    } catch (error) {
      console.error("简历填写助手无法写入当前输入框。", error);
      return { status: "error" };
    }
  }

  /**
   * 根据网页日期控件当前使用的格式调整简历中的标准日期。
   *
   * @param {HTMLInputElement | HTMLTextAreaElement} element
   * @param {string} value
   * @returns {string}
   */
  function getCompatibleValue(element, value) {
    if (!(element instanceof HTMLInputElement)) {
      return value;
    }

    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (dateParts === null) {
      return value;
    }

    const [, year, month, day] = dateParts;

    if (element.type === "month") {
      return `${year}-${month}`;
    }

    if (element.type === "date") {
      return value;
    }

    const currentValue = element.value.trim();
    const monthFormat = /^(\d{4})([-/.])(\d{2})$/.exec(currentValue);

    if (monthFormat !== null) {
      return `${year}${monthFormat[2]}${month}`;
    }

    const dateFormat = /^(\d{4})([-/.])(\d{2})\2(\d{2})$/.exec(currentValue);

    if (dateFormat !== null) {
      return `${year}${dateFormat[2]}${month}${dateFormat[2]}${day}`;
    }

    const placeholder = element.placeholder.trim();
    const placeholderMonthFormat = /^y{4}([-/.])m{1,2}$/i.exec(placeholder);

    if (placeholderMonthFormat !== null) {
      return `${year}${placeholderMonthFormat[1]}${month}`;
    }

    return value;
  }

  /**
   * 等待网页框架处理输入事件，避免受控表单恢复旧值后仍报告成功。
   *
   * @returns {Promise<void>}
   */
  function waitForPageUpdate() {
    return new Promise((resolve) => {
      window.setTimeout(resolve, 80);
    });
  }

  /**
   * @returns {{ status: "undone" | "no-history" | "error" }}
   */
  function undoLastFill() {
    if (!hasUndoEntry()) {
      undoEntry = null;
      return { status: "no-history" };
    }

    const entry = undoEntry;

    try {
      setNativeValue(entry.element, entry.value);
      dispatchFormEvents(entry.element, entry.value);
      highlightField(entry.element, "#fde68a");
      lastFocusedElement = entry.element;
      undoEntry = null;
      return { status: "undone" };
    } catch (error) {
      console.error("简历填写助手无法撤销上次填写。", error);
      return { status: "error" };
    }
  }

  /**
   * @returns {boolean}
   */
  function hasUndoEntry() {
    return undoEntry !== null && undoEntry.element.isConnected;
  }

  /**
   * 通知后台当前框架是否包含最后聚焦的输入框，用于嵌套页面路由。
   *
   * @param {boolean} focused
   */
  function notifyFocusState(focused) {
    if (!extensionContextAvailable) {
      return;
    }

    try {
      void chrome.runtime
        .sendMessage({ type: "resume-filler-focus-state", focused })
        .catch(() => {});
    } catch {
      // 扩展重载后旧页面脚本会失去上下文，等待页面刷新后重新注入。
      extensionContextAvailable = false;
    }
  }

  /**
   * 使用浏览器原生 value setter，避免绕过 React 或 Vue 的值追踪。
   *
   * @param {HTMLInputElement | HTMLTextAreaElement} element
   * @param {string} value
   */
  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const ownSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
    const prototypeSetter = Object.getOwnPropertyDescriptor(
      prototype,
      "value",
    )?.set;

    if (prototypeSetter !== undefined && ownSetter !== prototypeSetter) {
      prototypeSetter.call(element, value);
      return;
    }

    if (ownSetter !== undefined) {
      ownSetter.call(element, value);
      return;
    }

    element.value = value;
  }

  /**
   * @param {HTMLInputElement | HTMLTextAreaElement} element
   * @param {string} value
   */
  function dispatchFormEvents(element, value) {
    let inputEvent;

    try {
      inputEvent = new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: value,
        inputType: "insertText",
      });
    } catch {
      inputEvent = new Event("input", { bubbles: true, composed: true });
    }

    element.dispatchEvent(inputEvent);
    element.dispatchEvent(
      new Event("change", { bubbles: true, composed: true }),
    );

    const wasFocused = document.activeElement === element;
    element.blur();

    if (!wasFocused) {
      element.dispatchEvent(new FocusEvent("blur", { composed: true }));
      element.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, composed: true }),
      );
    }
  }

  /**
   * 使用临时动画提示填写或撤销目标，不修改网页的永久样式。
   *
   * @param {HTMLInputElement | HTMLTextAreaElement} element
   * @param {string} highlightColor
   */
  function highlightField(element, highlightColor) {
    const originalColor = getComputedStyle(element).backgroundColor;
    element.animate(
      [
        { backgroundColor: highlightColor },
        { backgroundColor: originalColor },
      ],
      { duration: 900, easing: "ease-out" },
    );
  }

  /**
   * @param {unknown} value
   * @returns {value is HTMLInputElement | HTMLTextAreaElement}
   */
  function isSupportedField(value) {
    if (value instanceof HTMLTextAreaElement) {
      return !value.disabled && !value.readOnly;
    }

    return (
      value instanceof HTMLInputElement &&
      supportedInputTypes.has(value.type) &&
      !value.disabled &&
      !value.readOnly
    );
  }

  /**
   * @param {unknown} message
   * @returns {message is { type: "fill-field", value: string, ignoreMaxLength?: boolean }}
   */
  function isFillMessage(message) {
    if (!isRecord(message)) {
      return false;
    }

    return message.type === "fill-field" && typeof message.value === "string";
  }

  /**
   * @param {unknown} message
   * @returns {message is { type: "undo-fill" }}
   */
  function isUndoMessage(message) {
    return isRecord(message) && message.type === "undo-fill";
  }

  /**
   * @param {unknown} message
   * @returns {message is { type: "get-fill-status" }}
   */
  function isStatusMessage(message) {
    return isRecord(message) && message.type === "get-fill-status";
  }

  /**
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
})();
