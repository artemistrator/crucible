// --- Constants & State ---
const STORAGE_KEY = 'pwa_todo_v1';

let todos = [];

// --- DOM Elements ---
const todoInput = document.getElementById('todo-input');
const addButton = document.querySelector('.add-btn');
const todoList = document.getElementById('todo-list');

// --- Storage Functions ---

/**
 * Loads todos from localStorage. 
 * Returns the parsed array or an empty array if data is missing/corrupt.
 */
function loadTodos() {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) {
        try {
            return JSON.parse(storedData);
        } catch (e) {
            console.error('Data corruption detected. Resetting todos.', e);
            return [];
        }
    }
    return [];
}

/**
 * Saves the current todos array to localStorage.
 */
function saveTodos(todosArray) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todosArray));
}

// --- Core Logic ---

/**
 * Initializes the application by loading data and rendering the UI.
 */
function initApp() {
    // Load data from local storage instead of using hardcoded data
    todos = loadTodos();
    renderTodos();
}

/**
 * Renders the todo list to the DOM based on the 'todos' state.
 */
function renderTodos() {
    todoList.innerHTML = '';

    todos.forEach(todo => {
        const li = document.createElement('li');
        li.className = 'todo-item';
        if (todo.completed) {
            li.classList.add('completed');
        }

        li.innerHTML = `
            <span class="todo-text">${escapeHtml(todo.text)}</span>
            <div class="todo-actions">
                <button class="complete-btn" aria-label="Mark as complete">&#10003;</button>
                <button class="delete-btn" aria-label="Delete todo">&#10005;</button>
            </div>
        `;

        // Event Delegation for buttons inside the item
        const completeBtn = li.querySelector('.complete-btn');
        completeBtn.addEventListener('click', () => toggleTodo(todo.id));

        const deleteBtn = li.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => deleteTodo(todo.id));

        todoList.appendChild(li);
    });
}

/**
 * Adds a new todo item.
 */
function addTodo() {
    const text = todoInput.value.trim();
    if (text === '') return;

    const newTodo = {
        id: Date.now(), // Simple unique ID generation
        text: text,
        completed: false
    };

    todos.push(newTodo);
    
    // Persist changes
    saveTodos(todos);
    
    renderTodos();
    todoInput.value = '';
    todoInput.focus();
}

/**
 * Toggles the completed status of a todo item.
 */
function toggleTodo(id) {
    todos = todos.map(todo => 
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );

    // Persist changes
    saveTodos(todos);
    
    renderTodos();
}

/**
 * Deletes a todo item by ID.
 */
function deleteTodo(id) {
    todos = todos.filter(todo => todo.id !== id);

    // Persist changes
    saveTodos(todos);
    
    renderTodos();
}

/**
 * Utility function to prevent XSS attacks when rendering user input.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Event Listeners ---

addButton.addEventListener('click', addTodo);

todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTodo();
    }
});

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);