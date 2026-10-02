// @ts-check

const openOptionsButton = document.querySelector("#open-options");

if (!(openOptionsButton instanceof HTMLButtonElement)) {
  throw new Error("The options button is missing from the side panel.");
}

openOptionsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
