/* To-Do App: localStorage + filtering + inline edit + drag reorder */
(function () {
    const $ = (s, o = document) => o.querySelector(s);
    const $$ = (s, o = document) => Array.from(o.querySelectorAll(s));

    const newTodo = $('#new-todo');
    const addBtn = $('#add-btn');
    const list = $('#todo-list');
    const empty = $('#empty');
    const itemsLeft = $('#items-left');
    const clearCompleted = $('#clear-completed');
    const filterChips = $$('.chip');
    const toggleTheme = $('#toggle-theme');
    const template = $('#todo-item-template');

    const STORAGE_KEY = 'todo.items.v1';
    const ORDER_KEY = 'todo.order.v1';
    let state = load();
    let filter = 'all';

    // --- Init ---
    render();
    bindGlobalEvents();

    function load() {
        try {
            const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            const order = JSON.parse(localStorage.getItem(ORDER_KEY)) || [];
            // keep order stable for known IDs; append new ones at end
            const byId = Object.fromEntries(items.map(i => [i.id, i]));
            const ordered = [...order.filter(id => byId[id]).map(id => byId[id]),
            ...items.filter(i => !order.includes(i.id))];
            return ordered;
        } catch {
            return [];
        }
    }

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.setItem(ORDER_KEY, JSON.stringify(state.map(t => t.id)));
    }

    function uid() {
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    function addTask(title) {
        const t = title.trim();
        if (!t) return;
        state.unshift({ id: uid(), title: t, completed: false, createdAt: Date.now() });
        persist();
        render();
    }

    function updateTask(id, patch) {
        const i = state.findIndex(t => t.id === id);
        if (i >= 0) {
            state[i] = { ...state[i], ...patch };
            persist();
            render();
        }
    }

    function deleteTask(id) {
        state = state.filter(t => t.id !== id);
        persist();
        render();
    }

    function clearCompletedTasks() {
        state = state.filter(t => !t.completed);
        persist();
        render();
    }

    function setFilter(next) {
        filter = next;
        filterChips.forEach(c => {
            const active = c.dataset.filter === filter;
            c.classList.toggle('active', active);
            c.setAttribute('aria-selected', String(active));
        });
        render();
    }

    function filtered() {
        switch (filter) {
            case 'active': return state.filter(t => !t.completed);
            case 'completed': return state.filter(t => t.completed);
            default: return state;
        }
    }

    function render() {
        list.innerHTML = '';
        const tasks = filtered();
        empty.style.display = tasks.length ? 'none' : 'block';

        tasks.forEach(task => {
            const li = template.content.firstElementChild.cloneNode(true);
            li.dataset.id = task.id;

            const cb = $('input[type="checkbox"]', li);
            const title = $('.title', li);
            const edit = $('.edit', li);
            const del = $('.destroy', li);

            cb.checked = task.completed;
            title.textContent = task.title;
            title.classList.toggle('completed', task.completed);

            // Toggle complete
            cb.addEventListener('change', () => updateTask(task.id, { completed: cb.checked }));

            // Delete
            del.addEventListener('click', () => deleteTask(task.id));

            // Enter edit mode: double-click or Enter on focus
            title.addEventListener('dblclick', () => startEdit());
            title.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') startEdit();
            });

            function startEdit() {
                li.classList.add('editing');
                edit.value = task.title;
                edit.focus();
                edit.select();
            }

            // Save / cancel editing
            edit.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const v = edit.value.trim();
                    if (v) updateTask(task.id, { title: v });
                    else deleteTask(task.id);
                } else if (e.key === 'Escape') {
                    li.classList.remove('editing');
                    edit.blur();
                }
            });
            edit.addEventListener('blur', () => {
                if (!li.classList.contains('editing')) return;
                const v = edit.value.trim();
                li.classList.remove('editing');
                if (v && v !== task.title) updateTask(task.id, { title: v });
                else render(); // reset view
            });

            // Drag & drop reorder
            li.addEventListener('dragstart', (e) => {
                li.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', task.id);
            });
            li.addEventListener('dragend', () => li.classList.remove('dragging'));
            li.addEventListener('dragover', (e) => e.preventDefault());
            li.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/plain');
                if (!draggedId || draggedId === task.id) return;
                reorder(draggedId, task.id);
            });

            list.appendChild(li);
        });

        // Items left
        const left = state.filter(t => !t.completed).length;
        itemsLeft.textContent = `${left} item${left !== 1 ? 's' : ''} left`;
    }

    function reorder(draggedId, targetId) {
        const from = state.findIndex(t => t.id === draggedId);
        const to = state.findIndex(t => t.id === targetId);
        if (from < 0 || to < 0) return;
        const [moved] = state.splice(from, 1);
        state.splice(to, 0, moved);
        persist();
        render();
    }

    // --- Events ---
    function bindGlobalEvents() {
        addBtn.addEventListener('click', () => addTask(newTodo.value));
        newTodo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addTask(newTodo.value);
        });
        newTodo.addEventListener('input', () => {
            // optional UX tweaks later
        });

        clearCompleted.addEventListener('click', clearCompletedTasks);

        filterChips.forEach(chip => chip.addEventListener('click', () => {
            setFilter(chip.dataset.filter);
        }));

        // Theme toggle (persist preference)
        const THEME_KEY = 'todo.theme';
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === 'light') document.documentElement.classList.add('light');

        toggleTheme.addEventListener('click', () => {
            document.documentElement.classList.toggle('light');
            localStorage.setItem(THEME_KEY,
                document.documentElement.classList.contains('light') ? 'light' : 'dark'
            );
        });

        // Keyboard: Delete to remove focused item
        list.addEventListener('keydown', (e) => {
            if (e.key === 'Delete') {
                const li = e.target.closest('.item');
                if (!li) return;
                deleteTask(li.dataset.id);
            }
        });
    }
})();
