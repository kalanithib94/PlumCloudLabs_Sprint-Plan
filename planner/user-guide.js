(function () {
  "use strict";

  function printPreview() {
    window.print();
  }

  function bindToolbar() {
    var pr = document.getElementById("btn-print-preview");
    if (pr) pr.addEventListener("click", printPreview);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindToolbar);
  } else {
    bindToolbar();
  }

  window.SprintUserGuide = {
    openPreview: function () {
      window.open("user-guide.html", "_blank", "noopener");
    },
  };
})();
