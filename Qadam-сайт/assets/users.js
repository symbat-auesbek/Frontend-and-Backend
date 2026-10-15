// Todo.userId -> DummyJSON GET /users/:id.
(() => {
  const providers = {
    "https://dummyjson.com/todos": { base: "https://dummyjson.com/users/", name: "DummyJSON" },
  };
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;
  let dialogVersion = 0;
  let taskLoader;
  let taskReader = () => [];
  let taskActions = {}, actionsBusy = false, currentUser = null;
  let profileResult = { tasks: [] };
  const titleCollator = new Intl.Collator(["kk-KZ", "ru", "en"], { sensitivity: "base", numeric: true });
  function sortTasks(items, order) {
    const copy = [...items];
    if (order === "asc" || order === "desc") {
      const direction = order === "desc" ? -1 : 1;
      copy.sort((a, b) => direction * titleCollator.compare(a.todo.trim(), b.todo.trim()));
    }
    return copy;
  }
  const dialog = document.getElementById("user-dialog");
  const content = document.getElementById("user-content");
  const close = document.getElementById("user-close");
  const validId = (id) => Number.isSafeInteger(id) && id > 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function schedule(action) {
    return new Promise((resolve, reject) => {
      queue.push({ action, resolve, reject });
      drain();
    });
  }

  function drain() {
    while (active < 4 && queue.length) {
      const job = queue.shift();
      active++;
      Promise.resolve().then(job.action).then(job.resolve, job.reject).finally(() => {
        active--;
        drain();
      });
    }
  }

  async function getUser(source, id) {
    if (!validId(id)) throw new Error("Пайдаланушы ID-сі оң бүтін сан болуы керек.");
    const provider = providers[source];
    if (!provider) throw new Error("Бұл тапсырманың API-і үшін пайдаланушы профилі қосылмаған.");
    const key = `${source}#${id}`;
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    const promise = schedule(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`${provider.base}${id}`, { signal: controller.signal });
        if (response.status === 404) throw new Error(`User ID ${id} табылмады. Басқа ID енгізіңіз.`);
        if (!response.ok) throw new Error(`Пайдаланушы жүктелмеді (HTTP ${response.status}).`);
        const data = await response.json();
        if (data.id !== id) throw new Error("API сұралған пайдаланушыны қайтармады.");
        // Keep only the public fields displayed in this interface.
        const user = {
          id, source, provider: provider.name,
          name: [data.firstName, data.lastName].filter(Boolean).join(" ") || data.name || `Пайдаланушы ${id}`,
          username: data.username, email: data.email, phone: data.phone,
          age: data.age, birthDate: data.birthDate, gender: data.gender,
          address: [data.address?.address || data.address?.street, data.address?.city, data.address?.country].filter(Boolean).join(", "),
          company: data.company?.name, job: data.company?.title,
          department: data.company?.department, university: data.university,
          image: typeof data.image === "string" && data.image.startsWith("https://") ? data.image : null,
        };
        cache.set(key, user);
        return user;
      } catch (error) {
        if (error.name === "AbortError") throw new Error("Профиль ұзақ жауап бермеді. Қайта көріңіз.");
        if (error instanceof TypeError) throw new Error("Профильді жүктеу мүмкін болмады. Интернетті тексеріп, қайта көріңіз.");
        throw error;
      } finally {
        clearTimeout(timer);
      }
    });
    pending.set(key, promise);
    try { return await promise; } finally { pending.delete(key); }
  }

  function initials(name) {
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function avatar(user) {
    const wrap = element("div", "user-avatar");
    const fallback = element("span", "avatar-initials", initials(user.name));
    fallback.setAttribute("aria-hidden", "true");
    wrap.append(fallback);
    if (user.image) {
      const img = element("img");
      img.alt = "";
      img.hidden = true;
      img.addEventListener("load", () => { img.hidden = false; fallback.hidden = true; });
      img.addEventListener("error", () => {
        img.hidden = true;
        fallback.hidden = false;
      }, { once: true });
      img.src = user.image;
      wrap.append(img);
    }
    return wrap;
  }

  function fillButton(button, user) {
    const text = element("span", "user-label");
    text.append(element("strong", "user-name", user.name), element("small", "user-id", `User ID: ${user.id} · ${user.provider}`));
    button.replaceChildren(avatar(user), text, element("span", "profile-arrow", "↗"));
    button.setAttribute("aria-label", `${user.name}, User ID ${user.id}: профильді ашу`);
  }

  function button(owner) {
    if (!validId(owner.userId)) return element("span", "owner-unknown", "Пайдаланушы ID-сі көрсетілмеген");
    if (!providers[owner.source]) return element("span", "owner-unknown", `User ID: ${owner.userId} · Профиль қолжетімсіз`);
    const node = element("button", "user-link");
    node.type = "button";
    node.dataset.userId = owner.userId;
    node.dataset.userSource = owner.source;
    node.setAttribute("aria-haspopup", "dialog");
    const text = element("span", "user-label");
    text.append(element("strong", "user-name", owner.userName || "Пайдаланушы жүктелуде…"), element("small", "user-id", `User ID: ${owner.userId} · ${providers[owner.source].name}`));
    node.append(text, element("span", "profile-arrow", "↗"));
    const key = `${owner.source}#${owner.userId}`;
    if (cache.has(key)) fillButton(node, cache.get(key));
    else getUser(owner.source, owner.userId).then((user) => fillButton(node, user)).catch(() => {
      node.querySelector(".user-name").textContent = owner.userName || "Профильді ашу";
    });
    node.addEventListener("click", () => openProfile(owner.source, owner.userId));
    return node;
  }

  function details(user) {
    const layout = element("div", "profile-layout");
    const info = element("section", "profile-details");
    const identity = element("div", "profile-identity");
    const photo = avatar(user);
    photo.classList.add("profile-avatar");
    const img = photo.querySelector("img");
    if (img) img.alt = `${user.name} — профиль суреті`;
    const identityText = element("div");
    identityText.append(element("p", "kicker", user.provider));
    const heading = element("h2", "profile-name", user.name);
    heading.id = "user-heading";
    const meta = element("p", "profile-meta", `User ID: ${user.id}${user.username ? ` · @${user.username}` : ""}`);
    identityText.append(heading, meta);
    identity.append(photo, identityText);
    info.append(identity);
    const list = element("dl", "profile-fields");
    const gender = { male: "Ер", female: "Әйел" }[user.gender] || user.gender;
    for (const [label, value] of [
      ["Email", user.email], ["Телефон", user.phone], ["Жасы", user.age],
      ["Туған күні", user.birthDate], ["Жынысы", gender], ["Мекенжайы", user.address],
      ["Компаниясы", user.company], ["Қызметі", user.job], ["Бөлімі", user.department], ["Университеті", user.university],
    ]) {
      if (value === undefined || value === null || value === "") continue;
      const row = element("div");
      row.append(element("dt", "", label), element("dd", "", String(value)));
      list.append(row);
    }
    info.append(list);
    const tasksPanel = element("section", "profile-tasks");
    tasksPanel.setAttribute("aria-labelledby", "profile-tasks-heading");
    tasksPanel.append(element("p", "kicker", "ПАЙДАЛАНУШЫНЫҢ ІСТЕРІ"));
    const tasksHeading = element("h3", "", "Тапсырмалары");
    tasksHeading.id = "profile-tasks-heading";
    const add = element("button", "profile-add", "Жаңа тапсырма");
    add.type = "button";
    add.disabled = actionsBusy;
    add.setAttribute("aria-haspopup", "dialog");
    add.addEventListener("click", () => taskActions.add?.(user));
    const feedback = element("p", "profile-feedback");
    feedback.id = "profile-feedback";
    feedback.setAttribute("role", "status");
    const summary = element("p", "profile-task-summary", "Тапсырмалар жүктелуде…");
    summary.id = "profile-task-summary";
    summary.setAttribute("role", "status");
    const results = element("div", "profile-task-results");
    results.id = "profile-task-results";
    results.setAttribute("aria-busy", "true");
    tasksPanel.append(tasksHeading, add, feedback, summary, results);
    layout.append(info, tasksPanel);
    return layout;
  }

  async function loadProfileTasks(user, version) {
    if (!taskLoader || version !== dialogVersion || !dialog.open) return;
    // Show API responses already received while the complete user list is loading.
    renderProfileTasks(user, version, { tasks: taskReader(user.source, user.id, profileResult.tasks), loading: true });
    let loaded;
    try {
      loaded = await taskLoader(user.source, user.id);
    } catch {
      loaded = { tasks: taskReader(user.source, user.id, profileResult.tasks), error: "Тапсырмаларды жүктеу мүмкін болмады. Қайта көріңіз." };
    }
    renderProfileTasks(user, version, loaded);
  }

  function renderProfileTasks(user, version, loaded) {
    if (version !== dialogVersion || !dialog.open) return;
    const summary = content.querySelector("#profile-task-summary");
    const results = content.querySelector("#profile-task-results");
    if (!summary || !results) return;
    const focusKey = results.contains(document.activeElement) ? document.activeElement.dataset.profileEditKey : null;
    const scrollTop = results.querySelector(".profile-task-list")?.scrollTop || 0;
    profileResult = loaded;
    results.setAttribute("aria-busy", String(Boolean(loaded.loading)));
    const allTasks = loaded.tasks;
    const done = allTasks.filter((task) => task.completed).length;
    summary.textContent = `${allTasks.length} тапсырма · ${done} орындалды`;
    if (loaded.loading) summary.textContent += " · API тапсырмалары жүктелуде…";
    results.replaceChildren();
    if (loaded.error) {
      const warning = element("p", "profile-task-warning", loaded.error);
      warning.setAttribute("role", "alert");
      const retry = element("button", "secondary profile-tasks-retry", "Қайта жүктеу");
      retry.type = "button";
      retry.addEventListener("click", () => {
        retry.disabled = true;
        loadProfileTasks(user, version);
      });
      results.append(warning, retry);
    }
    if (!allTasks.length) {
      if (!loaded.error && !loaded.loading) results.append(element("p", "profile-tasks-empty", "Бұл пайдаланушыда әзірге тапсырма жоқ."));
      if (focusKey) focusTask();
      return;
    }
    const list = element("ul", "profile-task-list");
    list.setAttribute("aria-label", "Пайдаланушының барлық тапсырмалары");
    for (const task of allTasks) {
      const row = element("li", task.completed ? "profile-task is-complete" : "profile-task");
      const mark = element("span", "profile-task-mark", task.completed ? "✓" : "○");
      mark.setAttribute("aria-hidden", "true");
      const text = element("div", "profile-task-body");
      text.append(element("p", "profile-task-title", task.todo));
      const meta = element("div", "profile-task-meta");
      meta.append(element("span", `action-badge ${task.completed ? "action-completed" : ""}`, task.completed ? "Орындалды" : "Орындалмады"));
      meta.append(element("span", "", `Тапсырма #${task.id}`));
      text.append(meta);
      const edit = element("button", "secondary profile-edit", "Өңдеу");
      edit.type = "button";
      edit.disabled = actionsBusy;
      edit.dataset.profileEditKey = task.key;
      edit.setAttribute("aria-label", `Өңдеу: ${task.todo}`);
      edit.setAttribute("aria-haspopup", "dialog");
      edit.addEventListener("click", () => taskActions.edit?.(task));
      text.append(edit);
      row.append(mark, text);
      list.append(row);
    }
    results.append(list);
    list.scrollTop = scrollTop;
    if (focusKey) focusTask(focusKey);
  }

  function focusTask(key) {
    const button = [...content.querySelectorAll(".profile-edit")].find((node) => node.dataset.profileEditKey === key);
    (button || content.querySelector(".profile-add") || close).focus();
  }

  function refreshTasks(message) {
    if (!dialog.open || !currentUser) return;
    renderProfileTasks(currentUser, dialogVersion, {
      ...profileResult, tasks: taskReader(currentUser.source, currentUser.id, profileResult.tasks),
    });
    content.querySelector("#profile-feedback").textContent = message || "";
  }

  function setBusy(value) {
    actionsBusy = value;
    content.querySelectorAll(".profile-add, .profile-edit").forEach((button) => { button.disabled = value; });
  }

  async function openProfile(source, id) {
    const version = ++dialogVersion;
    currentUser = null;
    profileResult = { tasks: [] };
    const state = element("div", "profile-message");
    const heading = element("h2", "", `User ID: ${id}`);
    heading.id = "user-heading";
    state.append(heading, element("p", "help", "Пайдаланушының деректері жүктелуде…"));
    content.replaceChildren(state);
    if (!dialog.open) dialog.showModal();
    close.focus();
    try {
      const user = await getUser(source, id);
      if (version !== dialogVersion || !dialog.open) return;
      currentUser = user;
      content.replaceChildren(details(user));
      loadProfileTasks(user, version);
      document.querySelectorAll("button.user-link").forEach((node) => {
        if (node.dataset.userSource === source && Number(node.dataset.userId) === id) fillButton(node, user);
      });
    } catch (error) {
      if (version !== dialogVersion || !dialog.open) return;
      const message = element("p", "profile-error", error.message);
      message.setAttribute("role", "alert");
      const retry = element("button", "secondary", "Қайта жүктеу");
      retry.type = "button";
      retry.addEventListener("click", () => openProfile(source, id));
      state.replaceChildren(heading, message, retry);
    }
  }

  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { dialogVersion++; currentUser = null; profileResult = { tasks: [] }; });
  window.TodoUsers = {
    getUser, button, validId, sortTasks, refreshTasks, focusTask, setBusy,
    setTaskActions: (actions) => { taskActions = actions; },
    setTaskLoader: (loader, reader) => { taskLoader = loader; taskReader = reader || (() => []); },
    supports: (source) => Boolean(providers[source]),
  };
})();
