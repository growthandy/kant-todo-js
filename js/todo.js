const STORAGE_KEY = 'kant-todo:items';

const $ = (selector) => document.querySelector(selector);

const addForm = $('#add-form');
const list = $('#todo-list');
const filterGroup = $('.filters');
const searchInput = $('#search');
const summary = $('#summary');
const emptyMessage = $('#empty');
const clearDoneButton = $('#clear-done');
const viewTemplate = $('#tpl-view');
const editTemplate = $('#tpl-edit');

const state = {
  todos: load(),
  filter: 'all',
  query: '',
  editingId: null,
};

const FILTERS = {
  all: () => true,
  active: (todo) => !todo.done,
  done: (todo) => todo.done,
};

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
  } catch {
    // 용량 초과·사생활 보호 모드: 저장만 실패하고 화면은 계속 동작
  }
}

const addTodo = (todos, text, due) => [
  ...todos,
  { id: String(Date.now()), text, due, done: false, createdAt: Date.now() },
];
// ponytail: id 는 밀리초 시각 — 같은 1ms 안에 두 번 추가하면 겹친다. 사람 손으론 불가능하니 충분, 다중 입력원이 생기면 crypto.randomUUID().

const updateTodo = (todos, id, patch) =>
  todos.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo));

const removeTodo = (todos, id) => todos.filter((todo) => todo.id !== id);

const byDue = (a, b) =>
  (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') || a.createdAt - b.createdAt;

function visibleTodos({ todos, filter, query }) {
  const keyword = query.trim().toLowerCase();
  return todos
    .filter(FILTERS[filter])
    .filter((todo) => todo.text.toLowerCase().includes(keyword))
    .sort(byDue);
}

const countTodos = (todos) =>
  todos.reduce(
    (acc, todo) => {
      acc.total += 1;
      acc[todo.done ? 'done' : 'active'] += 1;
      return acc;
    },
    { total: 0, active: 0, done: 0 },
  );

const today = () => new Date().toLocaleDateString('sv-SE');

function viewItem(todo) {
  const li = viewTemplate.content.firstElementChild.cloneNode(true);
  li.dataset.id = todo.id;
  li.classList.toggle('is-done', todo.done);
  const isOverdue = Boolean(todo.due) && !todo.done && todo.due < today();
  li.classList.toggle('is-overdue', isOverdue);

  const check = li.querySelector('.todo__check');
  check.checked = todo.done;
  check.setAttribute('aria-label', `${todo.text} 완료 표시`);

  li.querySelector('.todo__text').textContent = todo.text;

  const due = li.querySelector('.todo__due');
  if (todo.due) {
    due.textContent = `마감 ${todo.due}`;
    due.dateTime = todo.due;
  }
  return li;
}

function editItem(todo) {
  const li = editTemplate.content.firstElementChild.cloneNode(true);
  li.dataset.id = todo.id;
  const form = li.querySelector('form');
  form.elements.text.value = todo.text;
  form.elements.due.value = todo.due || '';
  return li;
}

function render() {
  const items = visibleTodos(state);

  list.replaceChildren(
    ...items.map((todo) => (todo.id === state.editingId ? editItem(todo) : viewItem(todo))),
  );
  // ponytail: 매번 목록 전체를 다시 그림. 항목이 수백 개를 넘어 버벅이면 바뀐 li 만 교체 (React 가 해주는 일).

  emptyMessage.hidden = items.length > 0;

  const count = countTodos(state.todos);
  summary.textContent = `전체 ${count.total} · 진행 ${count.active} · 완료 ${count.done}`;
  clearDoneButton.disabled = count.done === 0;

  filterGroup.querySelectorAll('[data-filter]').forEach((button) => {
    const on = button.dataset.filter === state.filter;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-pressed', String(on));
  });

  if (state.editingId) list.querySelector('.todo__edit-text')?.focus();
}

function commit(todos) {
  state.todos = todos;
  save();
  render();
}

function setView(changes) {
  Object.assign(state, changes);
  render();
}

addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = addForm.elements.text.value.trim();
  if (!text) return;
  commit(addTodo(state.todos, text, addForm.elements.due.value));
  addForm.reset();
  addForm.elements.text.focus();
});

list.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const id = target.closest('li').dataset.id;
  const todo = state.todos.find((item) => item.id === id);

  switch (target.dataset.action) {
    case 'toggle':
      commit(updateTodo(state.todos, id, { done: !todo.done }));
      break;
    case 'edit':
      setView({ editingId: id });
      break;
    case 'cancel':
      setView({ editingId: null });
      break;
    case 'delete':
      if (confirm(`"${todo.text}" 을(를) 삭제할까요?`)) {
        commit(removeTodo(state.todos, id));
      }
      break;
  }
});

list.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const id = form.closest('li').dataset.id;
  const text = form.elements.text.value.trim();
  if (!text) return;
  state.editingId = null;
  commit(updateTodo(state.todos, id, { text, due: form.elements.due.value }));
});

list.addEventListener('dblclick', (event) => {
  const text = event.target.closest('.todo__text');
  if (text) setView({ editingId: text.closest('li').dataset.id });
});

list.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.editingId) setView({ editingId: null });
});

filterGroup.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (button) setView({ filter: button.dataset.filter, editingId: null });
});

searchInput.addEventListener('input', () => {
  setView({ query: searchInput.value });
});
// ponytail: 매 입력마다 render. 데이터가 수천 건이면 setTimeout 디바운스 (300ms) 추가.

clearDoneButton.addEventListener('click', () => {
  if (confirm('완료한 항목을 모두 지울까요?')) {
    commit(state.todos.filter(FILTERS.active));
  }
});

render();
