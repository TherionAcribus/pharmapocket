(function () {
  function addBulkAddButton() {
    var path = window.location.pathname || "";

    var m = path.match(/\/admin\/snippets\/content\/pack\/edit\/(\d+)\/?/);
    if (!m) {
      m = path.match(/\/admin\/snippets\/content\/pack\/(\d+)\/?/);
    }
    if (!m) return;

    var packId = m[1];
    var actions =
      document.querySelector(".w-header__actions") ||
      document.querySelector(".header__actions") ||
      document.querySelector("header .actions");
    if (!actions) return;

    if (document.getElementById("pack-bulk-add-btn")) return;

    var a = document.createElement("a");
    a.id = "pack-bulk-add-btn";
    a.className = "button button-secondary";
    a.href = "/admin/packs/" + packId + "/bulk-add/";
    a.textContent = "Ajout en masse";

    actions.insertBefore(a, actions.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addBulkAddButton);
  } else {
    addBulkAddButton();
  }
})();
