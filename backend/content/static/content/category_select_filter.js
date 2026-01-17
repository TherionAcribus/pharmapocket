(function () {
  function normalize(str) {
    return (str || "").toString().trim().toLowerCase();
  }

  function shouldFilterSelect(selectEl) {
    if (!selectEl || selectEl.tagName !== "SELECT") return false;
    if (!selectEl.multiple) return false;
    var name = selectEl.getAttribute("name") || "";
    // Only target our taxonomy selects
    return name.indexOf("categories_") !== -1;
  }

  function guessAddUrl(selectEl) {
    var name = selectEl.getAttribute("name") || "";
    if (name.indexOf("categories_theme") !== -1) {
      return "/cms/snippets/content/categorytheme/add/";
    }
    if (name.indexOf("categories_maladies") !== -1) {
      return "/cms/snippets/content/categorymaladies/add/";
    }
    if (name.indexOf("categories_medicament") !== -1) {
      return "/cms/snippets/content/categorymedicament/add/";
    }
    if (name.indexOf("categories_pharmacologie") !== -1) {
      return "/cms/snippets/content/categorypharmacologie/add/";
    }
    return null;
  }

  function attachFilter(selectEl) {
    if (!shouldFilterSelect(selectEl)) return;
    if (selectEl.dataset.categoryFilterAttached === "1") return;
    selectEl.dataset.categoryFilterAttached = "1";

    var wrapper = document.createElement("div");
    wrapper.style.margin = "0 0 6px 0";

    var input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Rechercher…";
    input.autocomplete = "off";
    input.style.width = "100%";

    wrapper.appendChild(input);

    var addUrl = guessAddUrl(selectEl);
    if (addUrl) {
      var addButton = document.createElement("a");
      addButton.textContent = "Ajouter une catégorie (nouvel onglet)";
      addButton.href = addUrl;
      addButton.target = "_blank";
      addButton.rel = "noopener noreferrer";
      addButton.style.display = "inline-block";
      addButton.style.margin = "6px 0 0";
      addButton.style.fontSize = "12px";
      addButton.style.textDecoration = "underline";
      wrapper.appendChild(addButton);
    }

    // Insert above select
    selectEl.parentNode.insertBefore(wrapper, selectEl);

    function applyFilter() {
      var q = normalize(input.value);
      // Keep selected options always visible
      for (var i = 0; i < selectEl.options.length; i++) {
        var opt = selectEl.options[i];
        if (opt.selected) {
          opt.hidden = false;
          continue;
        }
        if (!q) {
          opt.hidden = false;
          continue;
        }
        var text = normalize(opt.text);
        opt.hidden = text.indexOf(q) === -1;
      }
    }

    input.addEventListener("input", applyFilter);
    selectEl.addEventListener("change", applyFilter);

    applyFilter();
  }

  function scan(root) {
    var selects = (root || document).querySelectorAll("select");
    for (var i = 0; i < selects.length; i++) {
      attachFilter(selects[i]);
    }
  }

  function boot() {
    scan(document);

    // Wagtail can dynamically add panels; observe changes
    var obs = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n && n.querySelectorAll) {
            scan(n);
          }
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
