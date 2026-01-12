(function () {
  "use strict";

  var LIMIT = 350;
  var FIELD_ID = "id_answer_express";
  var COUNTER_CLASS = "pp-char-counter";
  var OVER_CLASS = "pp-char-counter--over";
  var STYLE_ID = "pp-char-counter-style";

  function stripHtml(html) {
    var div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "." +
      COUNTER_CLASS +
      "{margin-top:4px;font-size:12px;color:#667085;}" +
      "." +
      OVER_CLASS +
      "{color:#b42318;font-weight:600;}";
    document.head.appendChild(style);
  }

  function attachCounter(textarea) {
    if (!textarea || textarea.dataset.ppCounterAttached === "1") return;
    textarea.dataset.ppCounterAttached = "1";

    ensureStyles();

    var counter = document.createElement("div");
    counter.className = COUNTER_CLASS;

    var container = textarea.parentElement || textarea;
    var field = textarea.closest(".field") || container;
    var draftail = field ? field.querySelector(".Draftail-Editor") : null;
    if (draftail && draftail.parentElement) {
      draftail.parentElement.appendChild(counter);
    } else if (field) {
      field.appendChild(counter);
    } else {
      container.appendChild(counter);
    }

    var update = function () {
      var text = stripHtml(textarea.value);
      var len = text.length;
      counter.textContent = len + " / " + LIMIT + " caracteres (recommande)";
      if (len > LIMIT) {
        counter.classList.add(OVER_CLASS);
      } else {
        counter.classList.remove(OVER_CLASS);
      }
    };

    update();
    textarea.addEventListener("input", update);
    textarea.addEventListener("change", update);

    if (draftail) {
      draftail.addEventListener("input", update);
      draftail.addEventListener("keyup", update);
    }

    var interval = setInterval(update, 500);
    setTimeout(function () {
      clearInterval(interval);
    }, 10000);
  }

  function init() {
    var textarea = document.getElementById(FIELD_ID);
    if (!textarea) return false;
    attachCounter(textarea);
    return true;
  }

  function waitForField() {
    if (init()) return;
    var attempts = 0;
    var interval = setInterval(function () {
      attempts += 1;
      if (init() || attempts > 40) {
        clearInterval(interval);
      }
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForField);
  } else {
    waitForField();
  }

  var observer = new MutationObserver(function () {
    init();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
