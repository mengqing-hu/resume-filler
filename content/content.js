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

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.composedPath()[0];
      lastFocusedElement = isSupportedField(target) ? target : null;
    },
    true,
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.composedPath()[0];

      if (!isSupportedField(target)) {
        lastFocusedElement = null;
      }
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isFillMessage(message)) {
      return false;
    }

    sendResponse(fillLastFocusedField(message.value));
    return false;
  });

  /**
   * 将内容写入最后获得焦点的输入框，并触发表单框架常用事件。
   *
   * @param {string} value
   * @returns {{ status: "filled" | "no-target" | "error" }}
   */
  function fillLastFocusedField(value) {
    const target = lastFocusedElement;

    if (
      target === null ||
      !target.isConnected ||
      !isSupportedField(target)
    ) {
      lastFocusedElement = null;
      return { status: "no-target" };
    }

    try {
      setNativeValue(target, value);
      dispatchFormEvents(target, value);
      highlightField(target);
      return { status: "filled" };
    } catch (error) {
      console.error("简历填写助手无法写入当前输入框。", error);
      return { status: "error" };
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
   * 使用临时动画提示填写目标，不修改网页的永久样式。
   *
   * @param {HTMLInputElement | HTMLTextAreaElement} element
   */
  function highlightField(element) {
    const originalColor = getComputedStyle(element).backgroundColor;
    element.animate(
      [
        { backgroundColor: "#bbf7d0" },
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
   * @returns {message is { type: "fill-field", value: string }}
   */
  function isFillMessage(message) {
    if (typeof message !== "object" || message === null) {
      return false;
    }

    const candidate = /** @type {Record<string, unknown>} */ (message);
    return candidate.type === "fill-field" && typeof candidate.value === "string";
  }
})();
