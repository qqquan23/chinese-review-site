(function () {
  const state = {
    category: "overview",
    mode: "highlight",
    query: "",
    quizOrders: {},
  };

  const categories = window.REVIEW_DATA.categories;
  const notes = window.REVIEW_DATA.notes;
  const images = window.REVIEW_DATA.images;
  const quiz = window.REVIEW_DATA.quiz || { modules: [] };

  const nav = document.querySelector("#categoryNav");
  const overview = document.querySelector("#overview");
  const content = document.querySelector("#content");
  const title = document.querySelector("#viewTitle");
  const search = document.querySelector("#searchInput");
  const stats = document.querySelector("#stats");
  const startQuiz = document.querySelector("#startQuiz");

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function findHighlights(text, terms) {
    const ranges = [];
    for (const term of terms || []) {
      if (!term || term.length < 2) continue;
      let start = text.indexOf(term);
      while (start !== -1) {
        ranges.push([start, start + term.length]);
        start = text.indexOf(term, start + term.length);
      }
    }
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (!last || range[0] > last[1]) {
        merged.push(range);
      } else if (range[1] > last[1]) {
        last[1] = range[1];
      }
    }
    return merged;
  }

  function renderText(note) {
    const text = note.text;
    if (state.mode === "plain") return escapeHtml(text);

    const ranges = findHighlights(text, note.highlights);
    if (!ranges.length) return escapeHtml(text);

    let html = "";
    let index = 0;
    ranges.forEach(([start, end]) => {
      html += escapeHtml(text.slice(index, start));
      const answer = escapeHtml(text.slice(start, end));
      if (state.mode === "cloze") {
        html += `<span class="cloze" title="點擊顯示">${answer}</span>`;
      } else {
        html += `<mark>${answer}</mark>`;
      }
      index = end;
    });
    html += escapeHtml(text.slice(index));
    return html;
  }

  function noteMatches(note) {
    if (state.category !== "overview" && note.category !== state.category) return false;
    if (!state.query) return true;
    const haystack = `${note.title} ${note.source} ${note.text}`.toLowerCase();
    return haystack.includes(state.query.toLowerCase());
  }

  function categoryById(id) {
    return categories.find((item) => item.id === id);
  }

  function renderNav() {
    nav.innerHTML = [
      `<button class="nav-button ${state.category === "overview" ? "is-active" : ""}" data-category="overview"><strong>總覽</strong><span>按模組進入複習</span></button>`,
      ...categories.map((category) => {
        const quizModule = quiz.modules.find((module) => module.id === category.id);
        const count = category.id === "quiz"
          ? quiz.modules.reduce((sum, module) => sum + module.questions.length, 0)
          : notes.filter((note) => note.category === category.id).length;
        const imageCount =
          images.filter((image) => image.category === category.id).length +
          notes.filter((note) => note.category === category.id && note.imagePath).length;
        const active = state.category === category.id ? "is-active" : "";
        const label = category.id === "quiz"
          ? `${count} 題`
          : imageCount ? `${count} 條筆記 · ${imageCount} 張圖` : `${count} 條筆記`;
        return `<button class="nav-button ${active}" data-category="${category.id}"><strong>${escapeHtml(category.name)}</strong><span>${label}</span></button>`;
      }),
    ].join("");
  }

  function renderStats() {
    const highlightCount = notes.reduce((sum, note) => sum + (note.highlights || []).length, 0);
    const imageCount = images.length + notes.filter((note) => note.imagePath).length;
    stats.innerHTML = `
      <div class="stat"><strong>${notes.length}</strong><span>段資料</span></div>
      <div class="stat"><strong>${highlightCount}</strong><span>高亮點</span></div>
      <div class="stat"><strong>${imageCount}</strong><span>課文圖</span></div>
    `;
  }

  function renderOverview() {
    overview.hidden = false;
    content.hidden = true;
    title.textContent = state.query ? "搜尋結果" : "總覽";

    if (state.query) {
      renderContent();
      return;
    }

    overview.innerHTML = categories.map((category) => {
      const count = category.id === "quiz"
        ? quiz.modules.reduce((sum, module) => sum + module.questions.length, 0)
        : notes.filter((note) => note.category === category.id).length;
      const highlightCount = notes
        .filter((note) => note.category === category.id)
        .reduce((sum, note) => sum + (note.highlights || []).length, 0);
      return `
        <article class="overview-card" data-category="${category.id}">
          <h3>${escapeHtml(category.name)}</h3>
          <p>${escapeHtml(category.description)}</p>
          <div class="card-meta">
            <span class="pill">${category.id === "quiz" ? count + " 題" : count + " 段"}</span>
            <span class="pill">${highlightCount} 個重點</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderImageCards(list) {
    return list.map((image) => `
      <a class="image-card" href="${escapeHtml(image.path)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(image.path)}" alt="${escapeHtml(image.displayName || image.name)}" loading="lazy" />
        <span>${escapeHtml(image.displayName || image.name)}</span>
      </a>
    `).join("");
  }

  function renderImagesForCategory(categoryId) {
    const list = images.filter((image) => image.category === categoryId);
    if (!list.length) return "";
    const grouped = new Map();
    list.forEach((image) => {
      const key = image.group || "圖片資料";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(image);
    });
    const chunks = [];
    grouped.forEach((items, heading) => {
      chunks.push(`<h3 class="section-heading">${escapeHtml(heading)} · 圖片</h3><div class="image-grid">${renderImageCards(items)}</div>`);
    });
    return chunks.join("");
  }

  function renderContent() {
    if (state.category === "quiz") {
      renderQuiz();
      return;
    }
    const category = categoryById(state.category);
    const filtered = notes.filter(noteMatches);

    overview.hidden = true;
    content.hidden = false;
    title.textContent = state.query
      ? `搜尋：${state.query}`
      : category ? category.name : "總覽";

    const grouped = new Map();
    filtered.forEach((note) => {
      const key = note.group || note.title || categoryById(note.category)?.name || "資料";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(note);
    });

    const chunks = [];
    if (!filtered.length) {
      chunks.push(`<div class="empty">沒有找到匹配內容。可以換一個關鍵詞，比如「白居易」「紀傳體」「話劇」。</div>`);
    }

    grouped.forEach((items, heading) => {
      chunks.push(`<h3 class="section-heading">${escapeHtml(heading)}</h3>`);
      items.forEach((note) => {
        const image = note.imagePath
          ? `<a class="note-image-link" href="${escapeHtml(note.imagePath)}" target="_blank" rel="noreferrer">
              <img class="note-image" src="${escapeHtml(note.imagePath)}" alt="${escapeHtml(note.imageName || note.title)}" loading="lazy" />
            </a>`
          : "";
        chunks.push(`
          <article class="note-card">
            <p class="source">${escapeHtml(note.title)} · ${escapeHtml(note.source)}</p>
            <p class="note-text">${renderText(note)}</p>
            ${image}
          </article>
        `);
      });
    });

    if (!state.query) {
      chunks.push(renderImagesForCategory(state.category));
    }

    content.innerHTML = chunks.join("");
  }

  function renderQuiz() {
    overview.hidden = true;
    content.hidden = false;
    title.textContent = "測驗";

    const modules = quiz.modules || [];
    const activeId = state.quizModule || modules[0]?.id;
    state.quizModule = activeId;
    const activeModule = modules.find((module) => module.id === activeId) || modules[0];
    if (!activeModule) {
      content.innerHTML = `<div class="empty">暫無測驗題庫。</div>`;
      return;
    }

    const tabs = modules.map((module) => {
      const active = module.id === activeModule.id ? "is-active" : "";
      return `<button class="quiz-tab ${active}" data-quiz-module="${escapeHtml(module.id)}">${escapeHtml(module.name)} <span>${module.questions.length}</span></button>`;
    }).join("");

    const questions = getQuizQuestions(activeModule).map((question, index) => renderQuizQuestion(question, index)).join("");
    content.innerHTML = `
      <div class="quiz-shell">
        <div class="quiz-toolbar">
          <div class="quiz-tabs">${tabs}</div>
          <button class="quiz-shuffle" type="button" data-shuffle-quiz>隨機排序題目</button>
        </div>
        <div class="quiz-list">${questions}</div>
      </div>
    `;
  }

  function getQuizQuestions(module) {
    const order = state.quizOrders[module.id];
    if (!order) return module.questions;
    return order.map((index) => module.questions[index]).filter(Boolean);
  }

  function shuffleQuizQuestions(module) {
    const order = module.questions.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }
    state.quizOrders[module.id] = order;
  }

  function renderQuizQuestion(question, index) {
    const number = index + 1;
    if (question.type === "choice") {
      const options = (question.options || []).map((option) => `
        <button class="quiz-option" data-answer="${escapeHtml(question.answer)}" data-correct="${isCorrectQuizOption(option, question.answer) ? "true" : "false"}">${escapeHtml(option)}</button>
      `).join("");
      return `
        <article class="note-card quiz-card">
          <p class="source">第 ${number} 題 · 選擇題${question.source ? " · " + escapeHtml(question.source) : ""}</p>
          <p class="note-text">${escapeHtml(question.prompt)}</p>
          <div class="quiz-options">${options}</div>
          <p class="quiz-answer" hidden>答案：${escapeHtml(question.answer)}</p>
        </article>
      `;
    }

    if (question.type === "matching") {
      const left = (question.pairs || []).map((pair, idx) => `<li>${idx + 1}. ${escapeHtml(pair.left)}</li>`).join("");
      const right = [...(question.pairs || [])].reverse().map((pair, idx) => `<li>${String.fromCharCode(65 + idx)}. ${escapeHtml(pair.right)}</li>`).join("");
      const answer = (question.pairs || []).map((pair) => `${escapeHtml(pair.left)} → ${escapeHtml(pair.right)}`).join("<br>");
      return `
        <article class="note-card quiz-card">
          <p class="source">第 ${number} 題 · 配對題</p>
          <p class="note-text">${escapeHtml(question.prompt)}</p>
          <div class="matching-grid"><ol>${left}</ol><ol>${right}</ol></div>
          <button class="answer-toggle">顯示答案</button>
          <p class="quiz-answer" hidden>${answer}</p>
        </article>
      `;
    }

    return `
      <article class="note-card quiz-card">
        <p class="source">第 ${number} 題 · 填空題${question.source ? " · " + escapeHtml(question.source) : ""}</p>
        <p class="note-text">${escapeHtml(question.prompt)}</p>
        <button class="answer-toggle">顯示答案</button>
        <p class="quiz-answer" hidden>答案：${escapeHtml(question.answer)}</p>
      </article>
    `;
  }

  function isCorrectQuizOption(option, answer) {
    const optionText = String(option).trim();
    const answerText = String(answer).trim();
    if (/^[A-D]$/.test(answerText)) {
      return optionText.startsWith(answerText + ".") || optionText.startsWith(answerText + "．") || optionText.startsWith("(" + answerText + ")") || optionText.startsWith("（" + answerText + "）");
    }
    return optionText === answerText;
  }

  function render() {
    renderNav();
    renderStats();
    if (state.category === "overview" && !state.query) {
      renderOverview();
    } else {
      renderContent();
    }
  }

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    if (state.category === "quiz" && !state.quizModule) state.quizModule = quiz.modules[0]?.id;
    state.query = "";
    search.value = "";
    render();
  });

  overview.addEventListener("click", (event) => {
    const card = event.target.closest("[data-category]");
    if (!card) return;
    state.category = card.dataset.category;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.querySelectorAll(".mode").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  content.addEventListener("click", (event) => {
    const cloze = event.target.closest(".cloze");
    if (cloze) cloze.classList.toggle("is-revealed");
    const tab = event.target.closest("[data-quiz-module]");
    if (tab) {
      state.quizModule = tab.dataset.quizModule;
      renderQuiz();
      return;
    }
    const shuffle = event.target.closest("[data-shuffle-quiz]");
    if (shuffle) {
      const activeModule = quiz.modules.find((module) => module.id === state.quizModule) || quiz.modules[0];
      if (activeModule) shuffleQuizQuestions(activeModule);
      renderQuiz();
      return;
    }
    const answerToggle = event.target.closest(".answer-toggle");
    if (answerToggle) {
      const answer = answerToggle.parentElement.querySelector(".quiz-answer");
      if (answer) answer.hidden = !answer.hidden;
      answerToggle.textContent = answer && !answer.hidden ? "隱藏答案" : "顯示答案";
      return;
    }
    const option = event.target.closest(".quiz-option");
    if (option) {
      const card = option.closest(".quiz-card");
      card.querySelectorAll(".quiz-option").forEach((item) => {
        item.disabled = true;
        if (item.dataset.correct === "true") item.classList.add("is-correct");
      });
      if (option.dataset.correct !== "true") option.classList.add("is-wrong");
      const answer = card.querySelector(".quiz-answer");
      if (answer) answer.hidden = false;
    }
  });

  search.addEventListener("input", () => {
    state.query = search.value.trim();
    if (state.query) state.category = "overview";
    render();
  });

  if (startQuiz) {
    startQuiz.addEventListener("click", () => {
      state.category = "quiz";
      state.query = "";
      state.quizModule = quiz.modules[0]?.id;
      search.value = "";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  render();
})();
