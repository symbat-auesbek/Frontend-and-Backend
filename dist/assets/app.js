(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const storageKey = 'ister-white-blue-v1';
  const defaultEndpoint = 'https://dummyjson.com/todos';
  const list = $('tasks');
  const dialog = $('edit-dialog');
  let tasks = [], removedKeys = [], filter = 'all', editingKey = null, importing = false, toastTimer;
  const uid = () => 'local-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  };
  function announce(message, type = '', undo) {
    clearTimeout(toastTimer);
    const box = $('status');
    box.className = 'toast' + (type ? ' ' + type : '');
    box.replaceChildren(document.createTextNode(message));
    if (undo) {
      const button = document.createElement('button');
      button.className = 'undo-button';
      button.textContent = 'Қайтару';
      button.addEventListener('click', undo, { once: true });
      box.append(button);
    }
    box.hidden = false;
    if (type !== 'busy') toastTimer = setTimeout(() => { box.hidden = true; }, type === 'error' || undo ? 9000 : 4500);
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ tasks, removedKeys, endpoint: $('endpoint').value }));
      return true;
    } catch {
      announce('Браузерде сақтау мүмкін болмады. Өзгерістер осы бет ашық тұрғанда ғана қалады.', 'error');
      return false;
    }
  }
  function commit(message, undo) {
    render();
    if (save()) announce(message, '', undo);
  }
  function setFilter(next) {
    filter = next;
    render();
  }
  function focusTask(key, action = 'check') {
    const row = [...list.children].find(item => item.dataset.key === key);
    (row?.querySelector(action === 'edit' ? '.edit-task' : '.task-check') || $('new-task')).focus();
  }
  function actionButton(name, label, className, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button ' + className;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.append(icon(name));
    button.addEventListener('click', callback);
    return button;
  }
  function render() {
    const done = tasks.filter(task => task.completed).length;
    const counts = { all: tasks.length, pending: tasks.length - done, done };
    $('total').textContent = tasks.length;
    $('pending').textContent = counts.pending;
    $('done').textContent = done;
    $('list-count').textContent = tasks.length;
    document.querySelectorAll('[data-count]').forEach(node => { node.textContent = counts[node.dataset.count]; });
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    $('progress-ring').style.setProperty('--progress', percent + '%');
    $('progress-ring').setAttribute('aria-valuenow', percent);
    $('progress-value').replaceChildren(document.createTextNode(percent));
    const sign = document.createElement('span'); sign.textContent = '%'; $('progress-value').append(sign);
    $('progress-bar').style.width = percent + '%';
    $('progress-summary').textContent = `${done} / ${tasks.length} тапсырма орындалды`;
    $('progress-copy').textContent = !tasks.length ? 'Бірінші қадамды жасаңыз.' : percent === 100 ? 'Бәрі дайын. Жарайсыз!' : done ? 'Әр қадам сізді алға жетелейді.' : 'Бастау үшін бір істі таңдаңыз.';
    $('progress-heading').textContent = percent === 100 && tasks.length ? 'Бәрі орындалды!' : 'Алға жылжып келесіз!';
    const query = $('search').value.trim().toLocaleLowerCase('kk');
    const visible = tasks.filter(task => (filter === 'all' || task.completed === (filter === 'done')) && task.todo.toLocaleLowerCase('kk').includes(query));
    $('visible-count').textContent = `${visible.length} тапсырма`;
    list.replaceChildren();
    for (const task of visible) {
      const row = document.createElement('li');
      row.className = 'task' + (task.completed ? ' complete' : '');
      row.dataset.key = task.key;
      const label = document.createElement('label'); label.className = 'task-label';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.className = 'task-check'; checkbox.checked = task.completed;
      const copy = document.createElement('span'); copy.className = 'task-copy';
      const title = document.createElement('span'); title.className = 'task-name'; title.textContent = task.todo;
      const meta = document.createElement('span'); meta.className = 'task-meta';
      meta.textContent = task.example ? 'Үлгі тапсырма' : task.local ? 'Жеке тапсырма' : task.sourceLabel || 'API тапсырмасы';
      copy.append(title, meta); label.append(checkbox, copy);
      checkbox.addEventListener('change', () => {
        task.completed = checkbox.checked;
        task.completionEdited = true;
        commit(task.completed ? 'Тағы бір қадам алға. Тапсырма орындалды!' : 'Тапсырма қайта ашылды.');
        focusTask(task.key);
      });
      const actions = document.createElement('div'); actions.className = 'task-actions';
      actions.append(
        actionButton('edit', 'Өңдеу: ' + task.todo, 'edit-task', () => {
          editingKey = task.key;
          $('edit-title').value = task.todo;
          $('edit-error').textContent = '';
          dialog.showModal();
          $('edit-title').focus(); $('edit-title').select();
        }),
        actionButton('trash', 'Өшіру: ' + task.todo, 'remove-task', () => {
          const index = tasks.findIndex(item => item.key === task.key);
          tasks.splice(index, 1);
          if (!task.local && !removedKeys.includes(task.key)) removedKeys.push(task.key);
          commit('Тапсырма өшірілді.', () => {
            if (!tasks.some(item => item.key === task.key)) tasks.splice(Math.min(index, tasks.length), 0, task);
            removedKeys = removedKeys.filter(key => key !== task.key);
            commit('Тапсырма қайтарылды.');
            focusTask(task.key);
          });
          const next = visible[visible.findIndex(item => item.key === task.key) + 1];
          focusTask(next?.key);
        })
      );
      row.append(label, actions); list.append(row);
    }
    $('empty').hidden = visible.length > 0;
    $('load-examples').hidden = tasks.length > 0 || Boolean(query) || filter !== 'all';
    $('empty-title').textContent = query ? 'Ештеңе табылмады' : tasks.length ? 'Бұл бөлім әзірге бос' : 'Бір істен бастаңыз';
    $('empty-text').textContent = query ? 'Басқа сөзбен іздеп көріңіз немесе сүзгіні өзгертіңіз.' : tasks.length ? 'Басқа бөлімді таңдаңыз немесе жаңа тапсырма қосыңыз.' : 'Алғашқы тапсырмаңызды қосыңыз. Үлкен жоспар кішкентай қадамнан басталады.';
  }
  function focusAdd() {
    $('new-task').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    $('new-task').focus({ preventScroll: true });
  }
  $('quick-add').addEventListener('click', focusAdd);
  $('hero-add').addEventListener('click', focusAdd);
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  $('search').addEventListener('input', render);
  $('add-form').addEventListener('submit', event => {
    event.preventDefault();
    const todo = $('new-task').value.trim();
    if (!todo) { announce('Тапсырманың атауын енгізіңіз.', 'error'); $('new-task').focus(); return; }
    tasks.unshift({ key: uid(), todo, completed: false, local: true });
    $('new-task').value = ''; $('search').value = ''; filter = 'all';
    commit('Жаңа тапсырма қосылды.');
    $('new-task').focus();
  });
  $('load-examples').addEventListener('click', () => {
    if (tasks.length) return;
    tasks = [
      ['Бүгінгі маңызды істерді жоспарлау', false],
      ['JavaScript тапсырмасын орындау', false],
      ['Жаңа идеяларды жазып алу', false],
      ['Кітаптың бір тарауын оқу', false],
      ['Жұмыс орнын ретке келтіру', true]
    ].map(([todo, completed]) => ({ key: uid(), todo, completed, local: true, example: true }));
    commit('Үлгі тапсырмалар қосылды. Оларды өзіңізге сай өзгерте аласыз.');
  });
  $('edit-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { focusTask(editingKey, 'edit'); editingKey = null; });
  $('edit-form').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('edit-title').value.trim();
    if (!title) { $('edit-error').textContent = 'Тапсырманың атауы бос болмауы керек.'; $('edit-title').focus(); return; }
    const task = tasks.find(item => item.key === editingKey);
    if (!task) { dialog.close(); return; }
    task.todo = title; task.titleEdited = true;
    commit('Тапсырма сақталды.');
    dialog.close();
  });
  function syncPresets() {
    document.querySelectorAll('[data-api]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.api === $('endpoint').value.trim())));
  }
  document.querySelectorAll('[data-api]').forEach(button => button.addEventListener('click', () => {
    $('endpoint').value = button.dataset.api; syncPresets(); $('endpoint').focus();
  }));
  $('endpoint').addEventListener('input', syncPresets);
  $('endpoint').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('load').click(); } });
  function apiUrl() {
    let url;
    try { url = new URL($('endpoint').value.trim()); } catch { throw new Error('API сілтемесі дұрыс емес. Толық HTTPS сілтемесін енгізіңіз.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Логин мен құпиясөзсіз HTTPS сілтемесін енгізіңіз.');
    url.hash = ''; return url;
  }
  function sourceOf(url) {
    if (['https://dummyjson.com', 'https://jsonplaceholder.typicode.com'].includes(url.origin) && /^\/todos(?:\/|$)/.test(url.pathname)) return url.origin + '/todos';
    return url.origin + url.pathname.replace(/\/$/, '');
  }
  function itemsFrom(data) {
    const items = Array.isArray(data) ? data : data?.todos ?? data?.tasks ?? data?.data;
    if (!Array.isArray(items)) throw new Error('API тапсырмалар тізімін қайтармады. JSON массиві немесе todos/tasks/data тізімі қажет.');
    return items;
  }
  function normalize(item, source, hostname) {
    const title = item?.todo ?? item?.title;
    if (!Number.isInteger(item?.id) || typeof title !== 'string' || !title.trim() || typeof item.completed !== 'boolean') throw new Error('Әр тапсырмада сандық id, todo немесе title мәтіні және completed (true/false) болуы керек.');
    const key = source + '#' + item.id;
    const existing = tasks.find(task => task.key === key);
    return {
      key, id: item.id, todo: existing?.titleEdited ? existing.todo : title.trim(),
      completed: existing?.completionEdited ? existing.completed : item.completed,
      titleEdited: Boolean(existing?.titleEdited), completionEdited: Boolean(existing?.completionEdited),
      local: false, sourceLabel: hostname
    };
  }
  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`API қатесі: HTTP ${response.status}. Сілтемені тексеріңіз.`);
      try { return await response.json(); } catch { throw new Error('API JSON пішіміндегі дерек қайтармады.'); }
    } finally { clearTimeout(timeout); }
  }
  async function importTasks(random = false) {
    if (importing) return;
    importing = true;
    document.querySelectorAll('#load, #random, #endpoint, [data-api]').forEach(button => { button.disabled = true; });
    $('load').setAttribute('aria-busy', 'true');
    announce('Тапсырмалар жүктелуде…', 'busy');
    try {
      const url = apiUrl(), source = sourceOf(url);
      let items;
      if (random && source === defaultEndpoint) items = [await fetchJson(source + '/random')];
      else {
        items = itemsFrom(await fetchJson(url.href));
        if (random) {
          if (!items.length) throw new Error('Бұл API-де тапсырмалар жоқ.');
          items = [items[Math.floor(Math.random() * items.length)]];
        }
      }
      const normalized = [...new Map(items.map(item => { const task = normalize(item, source, url.hostname); return [task.key, task]; })).values()];
      if (random) removedKeys = removedKeys.filter(key => !normalized.some(task => task.key === key));
      const incoming = normalized.filter(task => !removedKeys.includes(task.key));
      const keys = new Set(incoming.map(task => task.key));
      const added = incoming.filter(task => !tasks.some(existing => existing.key === task.key)).length;
      tasks = [...incoming, ...tasks.filter(task => !keys.has(task.key))];
      filter = 'all'; $('search').value = '';
      commit(random ? 'Кездейсоқ тапсырма тізімге қосылды.' : `${url.hostname}: ${added} жаңа тапсырма қосылды. Өз өзгерістеріңіз сақталды.`);
    } catch (error) {
      const message = error.name === 'AbortError' ? 'API уақытында жауап бермеді. Қайта көріңіз.' : error instanceof TypeError ? 'API-ге қосылу мүмкін болмады. Интернетті және браузерге рұқсатты (CORS) тексеріңіз.' : error.message;
      announce(message + ' Бұрынғы тізім сақталды.', 'error');
    } finally {
      importing = false;
      document.querySelectorAll('#load, #random, #endpoint, [data-api]').forEach(button => { button.disabled = false; });
      $('load').setAttribute('aria-busy', 'false');
    }
  }
  $('load').addEventListener('click', () => importTasks());
  $('random').addEventListener('click', () => importTasks(true));
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Array.isArray(saved.tasks) && saved.tasks.every(task => typeof task?.key === 'string' && typeof task.todo === 'string' && typeof task.completed === 'boolean')) {
      tasks = [...new Map(saved.tasks.map(task => [task.key, task])).values()];
      removedKeys = Array.isArray(saved.removedKeys) ? saved.removedKeys.filter(key => typeof key === 'string') : [];
      if (typeof saved.endpoint === 'string') $('endpoint').value = saved.endpoint;
    }
  } catch { /* Start with an empty list if storage is unavailable or corrupt. */ }
  function renderDate() {
    const now = new Date();
    $('today').dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const months = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
    $('today').textContent = `${now.getDate()} ${months[now.getMonth()]}, ${now.getFullYear()}`;
  }
  renderDate(); setInterval(renderDate, 60000);
  syncPresets(); render();
})();
