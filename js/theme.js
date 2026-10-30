// Shared by every page. Light is the default; the visitor's choice is remembered.
(function () {
  var root = document.documentElement;

  function savedTheme() {
    try {
      return localStorage.getItem("theme");
    } catch (e) {
      return null;
    }
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var button = document.getElementById("theme-toggle");
    if (button) {
      var isDark = theme === "dark";
      button.setAttribute("aria-pressed", String(isDark));
      button.textContent = isDark ? "Switch to light theme" : "Switch to dark theme";
    }
  }

  // Run immediately (script is in <head>) so the page doesn't flash the wrong theme.
  applyTheme(savedTheme() === "dark" ? "dark" : "light");

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.getElementById("theme-toggle");
    applyTheme(root.getAttribute("data-theme"));
    if (!button) return;
    button.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {
        // Storage can be blocked; the toggle still works for this visit.
      }
    });
  });
})();
