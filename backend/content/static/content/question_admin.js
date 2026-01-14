(function () {
  "use strict";

  var TYPE_ID = "id_type";
  var QCM_IDS = [
    "id_qcm_answer_1",
    "id_qcm_answer_2",
    "id_qcm_answer_3",
    "id_qcm_answer_4",
  ];
  var TF_ID = "id_true_false_correct";

  var STYLE_ID = "pp-question-admin-style";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".pp-hidden{display:none !important;}" +
      ".pp-q-preview{margin-top:6px;font-size:12px;color:#667085;}" +
      ".pp-q-preview code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace;}" +
      ".pp-good-answer{position:relative;border:1px solid #0d9488;border-radius:8px;padding:8px 10px;background:#ecfdf3;}" +
      ".pp-good-answer-label{position:absolute;top:-10px;left:8px;background:#0d9488;color:#fff;font-size:11px;font-weight:700;padding:2px 6px;border-radius:999px;box-shadow:0 1px 2px rgba(0,0,0,0.08);}"+
      ".pp-good-answer input{border-color:#0d9488;}";
    document.head.appendChild(style);
  }

  function fieldContainerFor(inputEl) {
    if (!inputEl) return null;
    return inputEl.closest(".field") || inputEl.closest(".w-field") || inputEl.parentElement;
  }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.classList.add("pp-hidden");
    else el.classList.remove("pp-hidden");
  }

  function ensureGoodAnswerDecoration() {
    var first = document.getElementById(QCM_IDS[0]);
    var container = fieldContainerFor(first);
    if (!container) return;

    if (container.dataset.ppDecorated === "1") return;
    container.dataset.ppDecorated = "1";

    container.classList.add("pp-good-answer");
    var badge = document.createElement("div");
    badge.className = "pp-good-answer-label";
    badge.textContent = "Bonne réponse";
    container.appendChild(badge);
  }

  function clearGoodAnswerDecoration() {
    var first = document.getElementById(QCM_IDS[0]);
    var container = fieldContainerFor(first);
    if (!container) return;
    container.classList.remove("pp-good-answer");
    var badge = container.querySelector(".pp-good-answer-label");
    if (badge) badge.remove();
    delete container.dataset.ppDecorated;
  }

  function getTypeValue() {
    var typeEl = document.getElementById(TYPE_ID);
    return typeEl ? (typeEl.value || "") : "";
  }

  function ensureTrueFalsePreview(selectEl) {
    var container = fieldContainerFor(selectEl);
    if (!container) return null;

    var existing = container.querySelector(".pp-q-preview");
    if (existing) return existing;

    var preview = document.createElement("div");
    preview.className = "pp-q-preview";
    preview.setAttribute("data-pp-question-preview", "1");
    container.appendChild(preview);
    return preview;
  }

  function updateTrueFalsePreview() {
    var selectEl = document.getElementById(TF_ID);
    if (!selectEl) return;

    var preview = ensureTrueFalsePreview(selectEl);
    if (!preview) return;

    var v = (selectEl.value || "").toLowerCase();
    if (!v) {
      preview.textContent = "";
      return;
    }

    var choices;
    if (v === "true") choices = ["Vrai", "Faux"];
    else if (v === "false") choices = ["Faux", "Vrai"];

    if (!choices) {
      preview.textContent = "";
      return;
    }

    preview.innerHTML =
      "Choix générés: " +
      "<code>[\"" +
      choices[0] +
      "\", \"" +
      choices[1] +
      "\"]</code> — bonne réponse: <code>index 0</code>";
  }

  function applyVisibility() {
    ensureStyles();

    var t = getTypeValue();
    var isQcm = t === "qcm";
    var isTf = t === "true_false";

    QCM_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      setHidden(fieldContainerFor(el), !isQcm);
    });

    var tfEl = document.getElementById(TF_ID);
    setHidden(fieldContainerFor(tfEl), !isTf);

    if (isQcm) {
      ensureGoodAnswerDecoration();
    } else {
      clearGoodAnswerDecoration();
    }

    if (isTf) {
      updateTrueFalsePreview();
    }
  }

  function bind() {
    var typeEl = document.getElementById(TYPE_ID);
    if (typeEl && typeEl.dataset.ppBound !== "1") {
      typeEl.dataset.ppBound = "1";
      typeEl.addEventListener("change", applyVisibility);
    }

    var tfEl = document.getElementById(TF_ID);
    if (tfEl && tfEl.dataset.ppBound !== "1") {
      tfEl.dataset.ppBound = "1";
      tfEl.addEventListener("change", function () {
        applyVisibility();
        updateTrueFalsePreview();
      });
    }
  }

  function init() {
    // Only run on Question snippet forms (avoid collisions with other models having `id_type`)
    var hasType = !!document.getElementById(TYPE_ID);
    var hasTf = !!document.getElementById(TF_ID);
    var hasQcm = QCM_IDS.some(function (id) {
      return !!document.getElementById(id);
    });
    if (!hasType || (!hasTf && !hasQcm)) return false;

    bind();
    applyVisibility();
    return true;
  }

  function waitForDom() {
    if (init()) return;
    var attempts = 0;
    var interval = setInterval(function () {
      attempts += 1;
      if (init() || attempts > 40) {
        clearInterval(interval);
      }
    }, 250);
  }

  var scheduled = false;
  function scheduleInit() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      init();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForDom);
  } else {
    waitForDom();
  }

  var observer = new MutationObserver(function () {
    scheduleInit();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
