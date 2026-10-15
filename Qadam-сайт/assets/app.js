// Display DummyJSON responses for this page session; never persist tasks.
(() => {
  const source = "https://dummyjson.com/todos";
  const users = window.TodoUsers;
  const byId = (id) => document.getElementById(id);
  const list = byId("tasks"), status = byId("status"), form = byId("add-form");
  const input = byId("new-task"), ownerInput = byId("task-user-id"), newStatus = byId("new-status");
  const taskSort = byId("task-sort"), connection = byId("connection"), loadButton = byId("load");
  const editDialog = byId("edit-dialog"), editTitle = byId("edit-title");
  const editStatus = byId("edit-status"), editOwner = byId("edit-user-id"), editError = byId("edit-error");
  const addDialog = byId("add-dialog"), addError = byId("add-error");
  let tasks = [], activity = [], filter = "all", busy = false, editingKey = null, responseSequence = 0;
  let editingTask = null;
  const updates = new Map();
  const deleted = new Set();
  const actionNames = { added: "Қосылды", edited: "Өзгертілді", deleted: "Өшірілді", completed: "Орындалды", reopened: "Қайта ашылды" };
  const timeFormat = new Intl.DateTimeFormat("kk-KZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });


  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setConnection(state, message, detail) {
    connection.dataset.state = state;
    byId("connection-label").textContent = message;
    byId("connection-detail").textContent = detail;
    loadButton.textContent = state === "loading" ? "Қосылуда…" : state === "connected" ? "Жаңарту" : "Қосылу";
  }

  async function request(path, method = "GET", body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`https://dummyjson.com${path}`, {
        method, signal: controller.signal,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const error = new Error(`DummyJSON қатесі: HTTP ${response.status}. Әрекет орындалмады.`);
        error.httpStatus = response.status;
        throw error;
      }
      return await response.json();
    } finally { clearTimeout(timeout); }
  }

  function normalize(data) {
    const id = Number(data?.id);
    if (!users.validId(id) || typeof data?.todo !== "string" || typeof data.completed !== "boolean" || !users.validId(data.userId)) {
      throw new Error("DummyJSON тапсырма деректерін дұрыс қайтармады.");
    }
    return { id, key: `server-${id}`, source, todo: data.todo, completed: data.completed, userId: data.userId };
  }

  function itemsFrom(data) {
    if (!Array.isArray(data?.todos)) throw new Error("DummyJSON тапсырмалар тізімін қайтармады.");
    return data.todos.map(normalize);
  }

  async function mutate(task, method, body) {
    try { return await request(`/todos/${task.id}`, method, body); }
    catch (error) {
      if (error.httpStatus === 404 && task.createdFromApi) {
        throw new Error("DummyJSON жаңа тапсырманы серверде сақтамайды, сондықтан бұл ID-ді өңдеу немесе өшіру мүмкін емес (HTTP 404). Өзгеріс жасалмады.");
      }
      throw error;
    }
  }

  async function updateTask(task, fields) {
    // Send all fields: DummyJSON does not retain previous PATCH results.
    const updated = normalize(await mutate(task, "PATCH", fields));
    if (updated.id !== task.id) throw new Error("Сервер басқа тапсырманың ID-сін қайтарды. Өзгеріс жасалмады.");
    Object.assign(task, updated, { key: task.key });
    const mainTask = tasks.find((item) => item.key === task.key);
    if (mainTask && mainTask !== task) Object.assign(mainTask, task);
    updates.set(task.key, { ...task });
  }

  async function validateOwner(value) {
    const userId = Number(value);
    if (!users.validId(userId)) throw new Error("Орындаушының User ID-сі 1 немесе одан үлкен бүтін сан болуы керек.");
    await users.getUser(source, userId);
    return userId;
  }

  function recordAction(task, action) {
    activity.unshift({ taskKey: task.key, todo: task.todo, userId: task.userId, source, action, at: new Date().toISOString() });
    activity = activity.slice(0, 100);
  }

  function openEdit(task) {
    if (busy) return;
    editingTask = tasks.find((item) => item.key === task.key) || task;
    editingKey = task.key;
    editTitle.value = task.todo;
    editStatus.value = String(task.completed);
    editOwner.value = task.userId;
    editError.textContent = "";
    byId("edit-note").hidden = !task.createdFromApi;
    editDialog.showModal();
    editTitle.focus();
    editTitle.select();
  }

  function openAdd(user) {
    if (busy) return;
    form.reset();
    if (user) ownerInput.value = user.id;
    addError.textContent = "";
    renderSelectedOwner();
    addDialog.showModal();
    input.focus();
  }
  byId("open-add").addEventListener("click", () => openAdd());
  byId("add-cancel").addEventListener("click", () => addDialog.close());
  addDialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  addDialog.addEventListener("close", () => {
    if (byId("user-dialog").open) users.focusTask();
    else byId("open-add").focus();
  });

  function render() {
    const done = tasks.filter((task) => task.completed).length;
    byId("total").textContent = tasks.length;
    byId("done").textContent = done;
    byId("pending").textContent = tasks.length - done;
    const visible = users.sortTasks(tasks.filter((task) => filter === "all" || task.completed === (filter === "done")), taskSort.value);
    list.replaceChildren();
    list.setAttribute("aria-busy", String(busy));
    document.querySelectorAll("#load, #random, #open-add, #add-form button, #add-form input, #add-form select, #edit-form button, #edit-form input, #edit-form select")
      .forEach((control) => { control.disabled = busy; });
    users.setBusy(busy);
    byId("empty").hidden = visible.length > 0;
    byId("empty").textContent = tasks.length ? "Бұл бөлімде тапсырмалар жоқ." : "Тізім әзірге бос.";
    for (const task of visible) {
      const row = element("li", task.completed ? "task complete" : "task");
      const main = element("div", "task-main");
      const label = element("label");
      const check = element("input");
      check.type = "checkbox";
      check.checked = task.completed;
      check.disabled = busy;
      check.dataset.taskKey = task.key;
      check.addEventListener("change", () => run(async () => {
        await updateTask(task, { todo: task.todo, completed: !task.completed, userId: task.userId });
        recordAction(task, task.completed ? "completed" : "reopened");
        return "DummyJSON статустың өзгеруін қабылдады.";
      }, task.key));
      label.append(check, element("span", "task-name", task.todo));
      const owner = element("div", "task-owner");
      owner.append(users.button(task));
      const latest = activity.find((entry) => entry.taskKey === task.key);
      if (latest) owner.append(element("span", `action-badge action-${latest.action}`, actionNames[latest.action]));
      main.append(label, owner);
      const actions = element("div", "task-actions");
      const edit = element("button", "secondary edit-task", "Өңдеу");
      edit.type = "button";
      edit.disabled = busy;
      edit.dataset.editKey = task.key;
      edit.setAttribute("aria-label", `Өңдеу: ${task.todo}`);
      edit.addEventListener("click", () => openEdit(task));
      const remove = element("button", "secondary remove-task", "Өшіру");
      remove.type = "button";
      remove.disabled = busy;
      remove.setAttribute("aria-label", `Өшіру: ${task.todo}`);
      remove.addEventListener("click", () => run(async () => {
        const result = await mutate(task, "DELETE");
        if (Number(result?.id) !== task.id || result.isDeleted !== true) throw new Error("DummyJSON тапсырманың өшірілгенін растамады.");
        recordAction(task, "deleted");
        tasks = tasks.filter((item) => item.key !== task.key);
        deleted.add(task.key);
        return "DummyJSON өшіру сұрауын қабылдады.";
      }));
      actions.append(edit, remove);
      row.append(main, actions);
      list.append(row);
    }
    renderActivity();
  }

  function renderActivity() {
    const container = byId("activity-list");
    container.replaceChildren();
    byId("activity-empty").hidden = activity.length > 0;
    byId("activity-count").textContent = `${activity.length} әрекет`;
    for (const entry of activity) {
      const row = element("li", "activity-item");
      const content = element("div", "activity-content");
      const owner = element("div", "activity-owner");
      owner.append(element("span", "owner-caption", "Орындаушы"), users.button(entry));
      content.append(element("span", `action-badge action-${entry.action}`, actionNames[entry.action]), element("p", "activity-title", entry.todo), owner);
      const time = element("time", "", timeFormat.format(new Date(entry.at)));
      time.dateTime = entry.at;
      row.append(content, time);
      container.append(row);
    }
  }

  async function run(action, focusKey) {
    if (busy) return;
    busy = true;
    status.classList.remove("error");
    status.textContent = "Күтіңіз…";
    render();
    try { status.textContent = await action(); }
    catch (error) {
      status.textContent = error instanceof TypeError ? "DummyJSON-ға қосылу мүмкін болмады. Интернетті тексеріңіз. Өзгеріс жасалмады."
        : error.name === "AbortError" ? "DummyJSON ұзақ жауап бермеді. Қайта көріңіз. Өзгеріс жасалмады." : error.message;
      status.classList.add("error");
      if (editDialog.open) editError.textContent = status.textContent;
      if (addDialog.open) addError.textContent = status.textContent;
    } finally {
      busy = false;
      render();
      if (focusKey) {
        const target = [...list.querySelectorAll("input")].find((item) => item.dataset.taskKey === focusKey);
        (target || document.querySelector('[data-filter][aria-pressed="true"]')).focus();
      }
    }
  }

  function renderSelectedOwner() {
    const userId = Number(ownerInput.value);
    const preview = byId("selected-owner");
    preview.textContent = users.validId(userId) ? `User ID: ${userId} · Орындаушы жүктелуде…` : "Орындаушының User ID-сін енгізіңіз.";
    if (!users.validId(userId)) return;
    users.getUser(source, userId).then((user) => {
      if (Number(ownerInput.value) === userId) preview.textContent = `${user.name} · User ID: ${user.id}`;
    }).catch((error) => {
      if (Number(ownerInput.value) === userId) preview.textContent = error.message;
    });
  }
  let ownerPreviewTimer;
  ownerInput.addEventListener("change", renderSelectedOwner);
  ownerInput.addEventListener("input", () => {
    clearTimeout(ownerPreviewTimer);
    ownerPreviewTimer = setTimeout(renderSelectedOwner, 250);
  });
  function focusEdit(key) {
    if (byId("user-dialog").open) { users.focusTask(key); return; }
    [...list.querySelectorAll("[data-edit-key]")].find((button) => button.dataset.editKey === key)?.focus();
  }
  byId("edit-cancel").addEventListener("click", () => editDialog.close());
  editDialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  editDialog.addEventListener("close", () => { focusEdit(editingKey); editingKey = null; editingTask = null; });
  byId("edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const todo = editTitle.value.trim();
    if (!todo) { editError.textContent = "Тапсырманың атауы бос болмауы керек."; editTitle.focus(); return; }
    const key = editingKey;
    const task = editingTask;
    if (!task) return;
    const completed = editStatus.value === "true", userId = Number(editOwner.value);
    if (task.todo === todo && task.completed === completed && task.userId === userId) { editDialog.close(); return; }
    editError.textContent = "";
    await run(async () => {
      await validateOwner(userId);
      await updateTask(task, { todo, completed, userId });
      recordAction(task, "edited");
      users.refreshTasks(`Тапсырма жаңартылды · Орындаушы: User ID ${task.userId}.`);
      editDialog.close();
      return "DummyJSON өзгерістерді қабылдады: атауы, статусы және орындаушысы жаңартылды.";
    });
    if (!editDialog.open) focusEdit(key);
  });

  function connect() {
    return run(async () => {
      setConnection("loading", "DummyJSON-ға қосылуда…", "Тапсырмалар серверден жүктелуде.");
      try {
        const incoming = itemsFrom(await request("/todos"));
        tasks = incoming;
        deleted.clear();
        updates.clear();
        setConnection("connected", "dummyjson.com · Қосылды", `${tasks.length} тапсырма серверден алынды.`);
        return "DummyJSON тапсырмалары жүктелді. Сервердің бастапқы деректері көрсетілуде.";
      } catch (error) {
        setConnection("error", "Серверге қосылмады", "Интернетті тексеріп, қайта қосылыңыз.");
        throw error;
      }
    });
  }
  loadButton.addEventListener("click", connect);
  byId("random").addEventListener("click", () => run(async () => {
    const task = normalize(await request("/todos/random"));
    deleted.delete(task.key);
    updates.delete(task.key);
    const index = tasks.findIndex((item) => item.key === task.key);
    if (index === -1) tasks.unshift(task); else tasks[index] = task;
    return "Кездейсоқ тапсырма DummyJSON-нан алынды.";
  }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    const todo = input.value.trim(), completed = newStatus.value === "true", ownerValue = ownerInput.value;
    if (!todo) { addError.textContent = "Тапсырманың атауын енгізіңіз."; input.focus(); return; }
    addError.textContent = "";
    run(async () => {
      const userId = await validateOwner(ownerValue);
      const task = normalize(await request("/todos/add", "POST", { todo, completed, userId }));
      // POST returns repeated simulated IDs; give each response a separate UI key.
      task.key = `response-${task.id}-${++responseSequence}`;
      task.createdFromApi = true;
      tasks.unshift(task);
      recordAction(task, "added");
      input.value = "";
      users.refreshTasks(`Жаңа тапсырма қосылды · Орындаушы: User ID ${task.userId}.`);
      addDialog.close();
      return "DummyJSON тапсырманы қабылдады. Бұл жауап бет жаңарғанға дейін көрсетіледі; сервер жаңа тапсырманы сақтамайды.";
    });
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      render();
    });
  });
  taskSort.addEventListener("change", render);

  function userTaskSnapshot(taskSource, userId, remote = []) {
    // Merge before filtering: reassigned tasks must leave the original owner's profile.
    const merged = new Map([...remote, ...tasks, ...updates.values()].map((task) => [task.key, task]));
    return [...merged.values()].filter((task) => task.source === taskSource && task.userId === userId && !deleted.has(task.key));
  }
  users.setTaskLoader(async (taskSource, userId) => {
    if (taskSource !== source || !users.validId(userId)) throw new Error("Пайдаланушы табылмады.");
    let remote = [], error = null;
    try { remote = itemsFrom(await request(`/todos/user/${userId}?limit=0`)); }
    catch { error = "Барлық тапсырма жүктелмеді. Осы бетте API-ден алынған тапсырмалар ғана көрсетіледі."; }
    return { tasks: userTaskSnapshot(taskSource, userId, remote), error };
  }, userTaskSnapshot);
  users.setTaskActions({ add: openAdd, edit: openEdit });
  render();
  connect();
})();
