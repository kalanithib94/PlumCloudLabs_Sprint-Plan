(function () {
  "use strict";

  var FILENAME = "PLUM-CLOUD-LABS-Sprint-Plan-User-Guide.pdf";

  function getContentEl() {
    return document.getElementById("guide-content");
  }

  function pdfOptions() {
    return {
      margin: [12, 14, 14, 14],
      filename: FILENAME,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], before: ".page-break" },
    };
  }

  function downloadPdf() {
    var el = getContentEl();
    if (!el || typeof html2pdf !== "function") {
      window.print();
      return;
    }
    var btn = document.getElementById("btn-print-pdf");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating PDF…";
    }
    html2pdf()
      .set(pdfOptions())
      .from(el)
      .save()
      .then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
      })
      .catch(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
        window.print();
      });
  }

  function printPreview() {
    window.print();
  }

  function bindToolbar() {
    var dl = document.getElementById("btn-print-pdf");
    var pr = document.getElementById("btn-print-preview");
    if (dl) dl.addEventListener("click", downloadPdf);
    if (pr) pr.addEventListener("click", printPreview);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindToolbar);
  } else {
    bindToolbar();
  }

  // Auto-download when opened from planner with ?download=1
  if (/[?&]download=1/.test(location.search)) {
    var run = function () {
      setTimeout(downloadPdf, 400);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
  }

  window.SprintUserGuide = {
    openPreview: function () {
      window.open("user-guide.html", "_blank", "noopener");
    },
    downloadPdf: downloadPdf,
  };
})();
