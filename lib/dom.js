// @ts-check

/**
 * 创建元素并设置文本和 CSS 类，不使用 HTML 字符串。
 *
 * @template {keyof HTMLElementTagNameMap} TagName
 * @param {TagName} tagName
 * @param {{ text?: string, classNames?: string[] }} [options]
 * @returns {HTMLElementTagNameMap[TagName]}
 */
export function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  if (options.classNames !== undefined) {
    element.classList.add(...options.classNames);
  }

  return element;
}
