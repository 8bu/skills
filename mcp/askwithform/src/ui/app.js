// The page for one Ask. Vanilla JS, no framework.
//
// Everything the assistant wrote is escaped before a hand-rolled markdown
// subset is applied, so no unescaped assistant output ever reaches the DOM.

(function () {
  "use strict";

  var root = document.getElementById("root");
  var form = null;
  var state = Object.create(null); // question id -> { choices: string[], other: string }
  var socket = null;
  var finished = false;

  // --- text rendering ---------------------------------------------------

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // `code`, **bold**, [text](http(s)://…). Code spans are lifted out first so
  // their contents stay literal.
  function md(raw) {
    var escaped = escapeHtml(String(raw));
    var parts = escaped.split(/(`[^`]+`)/);
    return parts
      .map(function (part) {
        if (part.charAt(0) === "`" && part.length > 1) {
          return "<code>" + part.slice(1, -1) + "</code>";
        }
        return part
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (_m, text, url) {
            // url is already escaped, and only http(s) reaches here.
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + "</a>";
          });
      })
      .join("");
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  // --- rendering --------------------------------------------------------

  function render() {
    root.replaceChildren();

    var title = el("h1", "form-title", md(form.title));
    var count = form.questions.length;
    var subtitle = el(
      "p",
      "form-subtitle",
      count + (count === 1 ? " question" : " questions") + " — all are required."
    );
    root.append(title, subtitle);

    form.questions.forEach(function (q) {
      root.append(renderQuestion(q));
    });

    root.append(renderSubmitBar());
    refresh();
  }

  function renderQuestion(q) {
    var article = el("article", "question");
    article.append(el("div", "question-text", md(q.text)));

    if (q.choices.length > 0) {
      article.append(
        el(
          "div",
          "question-hint",
          q.type === "single" ? "Pick one." : "Pick any number."
        )
      );
      var choices = el("div", "choices");
      q.choices.forEach(function (choice, i) {
        choices.append(renderChoice(q, choice, i));
      });
      article.append(choices);
    }

    if (q.allowOther) article.append(renderOther(q));
    return article;
  }

  function renderChoice(q, choice, index) {
    var wrap = el("div", "choice");
    var label = document.createElement("label");
    var input = document.createElement("input");
    input.type = q.type === "single" ? "radio" : "checkbox";
    input.name = "q-" + q.id;
    input.value = choice.label;
    input.id = "q-" + q.id + "-c-" + index;
    input.addEventListener("change", function () {
      var selected = state[q.id].choices;
      if (q.type === "single") {
        state[q.id].choices = input.checked ? [choice.label] : [];
      } else if (input.checked) {
        if (selected.indexOf(choice.label) === -1) selected.push(choice.label);
      } else {
        state[q.id].choices = selected.filter(function (l) {
          return l !== choice.label;
        });
      }
      refresh();
    });

    label.append(input, document.createTextNode(" "));
    var text = el("span", null, md(choice.label));
    label.append(text);
    wrap.append(label);

    if (choice.description) {
      wrap.append(el("small", "choice-description", md(choice.description)));
    }
    return wrap;
  }

  function renderOther(q) {
    var wrap = el("div", "other-field");
    var label = document.createElement("label");
    label.htmlFor = "q-" + q.id + "-other";
    label.textContent = q.choices.length > 0 ? "Other / in your own words" : "Your answer";

    var textarea = document.createElement("textarea");
    textarea.id = "q-" + q.id + "-other";
    textarea.rows = 2;
    textarea.addEventListener("input", function () {
      state[q.id].other = textarea.value;
      refresh();
    });

    label.append(textarea);
    wrap.append(label);
    return wrap;
  }

  var submitButton = null;
  var statusText = null;

  function renderSubmitBar() {
    var bar = el("div", "submit-bar");

    submitButton = document.createElement("button");
    submitButton.type = "button";
    submitButton.textContent = "Submit";
    submitButton.addEventListener("click", function () {
      send({ type: "submit", answers: collect() });
    });

    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary outline";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", function () {
      send({ type: "cancel" });
    });

    statusText = el("span", "status");
    bar.append(submitButton, cancel, statusText);
    return bar;
  }

  function answered(q) {
    var s = state[q.id];
    return s.choices.length > 0 || s.other.trim() !== "";
  }

  function refresh() {
    var missing = form.questions.filter(function (q) {
      return !answered(q);
    }).length;
    submitButton.disabled = missing > 0;
    statusText.textContent =
      missing === 0
        ? "All questions answered."
        : missing + (missing === 1 ? " question" : " questions") + " left.";
  }

  function collect() {
    var out = {};
    form.questions.forEach(function (q) {
      out[q.id] = { choices: state[q.id].choices.slice(), other: state[q.id].other };
    });
    return out;
  }

  function done(message) {
    finished = true;
    root.replaceChildren();
    root.append(el("h1", "form-title", escapeHtml(message)));
    root.append(el("p", "form-subtitle", "You can close this tab."));
    if (socket) socket.close();
    // A tab the browser opened for us usually refuses to close itself. Try
    // anyway; the message above is what the person actually relies on.
    setTimeout(function () {
      window.close();
    }, 500);
  }

  // --- transport --------------------------------------------------------

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function connect() {
    var protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(protocol + "//" + location.host + location.pathname + "/ws");

    socket.addEventListener("message", function (event) {
      var message = JSON.parse(event.data);
      if (message.type === "form") {
        form = message.form;
        form.questions.forEach(function (q) {
          if (!state[q.id]) state[q.id] = { choices: [], other: "" };
        });
        render();
      } else if (message.type === "done") {
        done(message.outcome === "submitted" ? "Answers sent." : "Cancelled.");
      } else if (message.type === "error") {
        if (statusText) statusText.textContent = message.message;
      }
    });

    socket.addEventListener("close", function () {
      if (finished) return;
      if (statusText) statusText.textContent = "Reconnecting…";
      // A finished Ask stops being served at all, so a 404 here means there is
      // nothing to come back to — reconnecting forever would be a lie.
      fetch(location.pathname, { cache: "no-store" }).then(
        function (response) {
          if (finished) return;
          if (response.ok) setTimeout(connect, 1000);
          else done("This form is closed.");
        },
        function () {
          if (!finished) setTimeout(connect, 1000);
        }
      );
    });
  }

  connect();
})();
