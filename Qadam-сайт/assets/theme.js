(() => {
  const key = "qadam-theme";
  let saved;
  try {
    saved = localStorage.getItem(key);
  } catch (_) {
    /* Storage may be disabled. */
  }
  document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";
  function render() {
    const dark = document.documentElement.dataset.theme === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.textContent = dark ? "☀ Ашық тақырып" : "☾ Қараңғы тақырып";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute(
        "aria-label",
        dark ? "Ашық тақырыпқа ауысу" : "Қараңғы тақырыпқа ауысу",
      );
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    render();
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const theme =
          document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try {
          localStorage.setItem(key, theme);
        } catch (_) {
          /* The switch still works. */
        }
        render();
      });
    });
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key) {
      document.documentElement.dataset.theme =
        event.newValue === "light" ? "light" : "dark";
      render();
    }
  });
})();
