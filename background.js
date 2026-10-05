// @ts-check

/** @type {Map<number, number>} */
const focusedFrameByTabId = new Map();
/** @type {Set<number>} */
const optionsTabIds = new Set();

/**
 * 配置工具栏图标，使用户点击后打开扩展侧边栏。
 *
 * @returns {Promise<void>}
 */
async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("Unable to configure the extension side panel.", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  focusedFrameByTabId.delete(tabId);
  optionsTabIds.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    focusedFrameByTabId.delete(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isOptionsPageReadyMessage(message) && sender.tab?.id !== undefined) {
    optionsTabIds.add(sender.tab.id);
    return false;
  }

  if (isOptionsToggleMessage(message) && sender.tab === undefined) {
    void toggleOptionsPage().then(
      sendResponse,
      () => sendResponse({ status: "unavailable", open: false }),
    );
    return true;
  }

  if (isOptionsStateMessage(message) && sender.tab === undefined) {
    void getOptionsPageState().then(
      sendResponse,
      () => sendResponse({ status: "ready", open: false }),
    );
    return true;
  }

  if (isFocusStateMessage(message) && sender.tab?.id !== undefined) {
    if (message.focused) {
      focusedFrameByTabId.set(sender.tab.id, sender.frameId ?? 0);
    } else {
      focusedFrameByTabId.delete(sender.tab.id);
    }

    return false;
  }

  if (isRouteMessage(message) && sender.tab === undefined) {
    void routeMessageToActivePage(message.payload).then(
      sendResponse,
      () => sendResponse({ status: "unavailable" }),
    );
    return true;
  }

  return false;
});

void configureSidePanel();

/**
 * 根据当前活动标签页切换设置页的打开状态。
 *
 * @returns {Promise<{ status: "opened" | "closed" | "unavailable", open: boolean }>}
 */
async function toggleOptionsPage() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab?.id !== undefined && optionsTabIds.has(activeTab.id)) {
    await chrome.tabs.remove(activeTab.id);
    optionsTabIds.delete(activeTab.id);
    return { status: "closed", open: false };
  }

  await chrome.runtime.openOptionsPage();
  return { status: "opened", open: true };
}

/**
 * @returns {Promise<{ status: "ready", open: boolean }>}
 */
async function getOptionsPageState() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return {
    status: "ready",
    open: activeTab?.id !== undefined && optionsTabIds.has(activeTab.id),
  };
}

/**
 * 把侧边栏消息发送到当前标签页中最后聚焦输入框所在的框架。
 *
 * @param {Record<string, unknown>} message
 * @returns {Promise<Record<string, unknown> & { status: string }>}
 */
async function routeMessageToActivePage(message) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab?.id === undefined) {
    return { status: "unavailable" };
  }

  const frameId = focusedFrameByTabId.get(activeTab.id) ?? 0;
  const response = await sendMessageToFrame(activeTab.id, frameId, message);

  if (response.status !== "unavailable" || frameId === 0) {
    return response;
  }

  focusedFrameByTabId.delete(activeTab.id);
  return sendMessageToFrame(activeTab.id, 0, message);
}

/**
 * @param {number} tabId
 * @param {number} frameId
 * @param {Record<string, unknown>} message
 * @returns {Promise<Record<string, unknown> & { status: string }>}
 */
async function sendMessageToFrame(tabId, frameId, message) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message, { frameId });

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
 * @param {unknown} message
 * @returns {message is { type: "resume-filler-focus-state", focused: boolean }}
 */
function isFocusStateMessage(message) {
  return (
    isRecord(message) &&
    message.type === "resume-filler-focus-state" &&
    typeof message.focused === "boolean"
  );
}

/**
 * @param {unknown} message
 * @returns {message is { type: "options-page-ready" }}
 */
function isOptionsPageReadyMessage(message) {
  return isRecord(message) && message.type === "options-page-ready";
}

/**
 * @param {unknown} message
 * @returns {message is { type: "toggle-options-page" }}
 */
function isOptionsToggleMessage(message) {
  return isRecord(message) && message.type === "toggle-options-page";
}

/**
 * @param {unknown} message
 * @returns {message is { type: "get-options-page-state" }}
 */
function isOptionsStateMessage(message) {
  return isRecord(message) && message.type === "get-options-page-state";
}

/**
 * @param {unknown} message
 * @returns {message is { type: "route-to-active-page", payload: Record<string, unknown> }}
 */
function isRouteMessage(message) {
  return (
    isRecord(message) &&
    message.type === "route-to-active-page" &&
    isPageMessage(message.payload)
  );
}

/**
 * 只允许侧边栏发送页面脚本已定义的消息。
 *
 * @param {unknown} message
 * @returns {message is Record<string, unknown>}
 */
function isPageMessage(message) {
  if (!isRecord(message)) {
    return false;
  }

  if (message.type === "fill-field") {
    return typeof message.value === "string";
  }

  return message.type === "undo-fill" || message.type === "get-fill-status";
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
