document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let todos = JSON.parse(localStorage.getItem('my-todo-pwa-data')) || [];

    const todoListEl = document.getElementById('todo-list');
    const formEl = document.getElementById('add-form');
    const inputEl = document.getElementById('todo-input');

    // --- Core Functions ---

    function saveTodos() {
        localStorage.setItem('my-todo-pwa-data', JSON.stringify(todos));
    }

    function renderTodos() {
        todoListEl.innerHTML = '';
        
        if (todos.length === 0) {
            todoListEl.innerHTML = `<div style="text-align:center; padding: 40px; color:#8E8E93;">No tasks yet</div>`;
            return;
        }

        todos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.setAttribute('data-id', todo.id);

            li.innerHTML = `
                <div class="todo-content" role="button" tabindex="0">
                    <div class="checkbox">
                        <div class="checkmark"></div>
                    </div>
                    <span class="todo-text">${escapeHtml(todo.text)}</span>
                </div>
                <button class="delete-btn" aria-label="Delete task">
                    <!-- Simple trash icon SVG -->
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;

            todoListEl.appendChild(li);
        });
    }

    function addTodo(text) {
        const newTodo = {
            id: Date.now(),
            text: text,
            completed: false
        };
        todos.unshift(newTodo); // Add to top
        saveTodos();
        renderTodos();
    }

    function toggleTodo(id) {
        todos = todos.map(todo => {
            if (todo.id === id) {
                return { ...todo, completed: !todo.completed };
            }
            return todo;
        });
        saveTodos();
        renderTodos();
    }

    function deleteTodo(id) {
        todos = todos.filter(todo => todo.id !== id);
        saveTodos();
        renderTodos();
    }

    // Helper to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Event Listeners ---

    formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = inputEl.value.trim();
        if (text) {
            addTodo(text);
            inputEl.value = '';
            inputEl.focus();
        }
    });

    // Event Delegation for List Items (Toggle and Delete)
    todoListEl.addEventListener('click', (e) => {
        const item = e.target.closest('.todo-item');
        if (!item) return;

        const id = parseInt(item.getAttribute('data-id'));

        // Check if delete button was clicked
        if (e.target.closest('.delete-btn')) {
            // Add a small visual delay or confirm if desired, but for now direct delete
            deleteTodo(id);
            return;
        }

        // Otherwise, toggle completion
        toggleTodo(id);
    });

    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
        });
    }

    // Initial Render
    renderTodos();
});