/**
 * Main Application Logic
 * Connects DOM elements with StorageService and handles CRUD operations.
 */

// State Container
let appState = {
  tasks: []
};

// DOM Elements
const columns = {
  todo: document.getElementById('column-todo'),
  'in-progress': document.getElementById('column-in-progress'),
  done: document.getElementById('column-done')
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
  // 1. Load state from storage
  appState = StorageService.loadState();

  // 2. Render initial UI
  renderTasks();

  // 3. Setup Event Listeners
  setupAddTaskListeners();
  setupDeleteListeners();
  setupDragAndDropSync();
});

// --- Core Logic (CRUD) ---

function createTask(title, status = 'todo') {
  const newTask = {
    id: Date.now().toString(), // Simple ID generation
    title: title,
    status: status
  };

  appState.tasks.push(newTask);
  StorageService.saveState(appState);
  renderTasks();
}

function deleteTask(id) {
  if (confirm('Вы уверены, что хотите удалить эту задачу?')) {
    appState.tasks = appState.tasks.filter(task => task.id !== id);
    StorageService.saveState(appState);
    renderTasks();
  }
}

function updateTaskStatus(id, newStatus) {
  const task = appState.tasks.find(t => t.id === id);
  if (task) {
    task.status = newStatus;
    StorageService.saveState(appState);
    // Re-rendering is optional here if DnD moved the DOM element physically,
    // but it ensures the data model and UI are perfectly consistent.
    renderTasks(); 
  }
}

// --- Rendering ---

function renderTasks() {
  // Clear all columns
  Object.values(columns).forEach(column => {
    if(column) column.innerHTML = ''; 
  });

  // Populate columns based on state
  appState.tasks.forEach(task => {
    const taskElement = createTaskElement(task);
    const column = columns[task.status];
    if (column) {
      column.appendChild(taskElement);
    }
  });
}

function createTaskElement(task) {
  const div = document.createElement('div');
  div.className = 'task-card';
  div.draggable = true;
  div.dataset.id = task.id;
  div.dataset.status = task.status;
  
  // Content
  div.innerHTML = `
    <div class="task-content">${escapeHtml(task.title)}</div>
    <button class="delete-btn" aria-label="Удалить задачу">&times;</button>
  `;

  // Drag Events (Basic re-attachment if needed, assuming HTML might have global handlers)
  div.addEventListener('dragstart', handleDragStart);
  
  return div;
}

// --- Event Handlers & UI Interaction ---

function setupAddTaskListeners() {
  // Assuming inputs with IDs like 'input-todo', 'input-in-progress', etc.
  // Or a generic handler if inputs are inside column headers.
  
  // Example: Find all input fields with class 'new-task-input'
  const inputs = document.querySelectorAll('.new-task-input');
  inputs.forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && input.value.trim() !== '') {
        // Determine status based on closest column ID or specific attribute
        const columnId = input.closest('[id^="column-"]').id; // e.g., "column-todo"
        const status = columnId.replace('column-', '');
        
        createTask(input.value.trim(), status);
        input.value = ''; // Clear input
      }
    });
  });
}

function setupDeleteListeners() {
  // Event Delegation for delete buttons
  document.body.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
      const taskCard = e.target.closest('.task-card');
      if (taskCard) {
        const id = taskCard.dataset.id;
        deleteTask(id);
      }
    }
  });
}

function setupDragAndDropSync() {
  // Ensure Drop Zones update the data model
  const dropZones = document.querySelectorAll('.column-body'); // Assuming class .column-body for drop area
  
  dropZones.forEach(zone => {
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      // Determine new status based on the drop zone parent ID
      const newStatus = zone.id.replace('column-', '');
      
      if (id && newStatus) {
        updateTaskStatus(id, newStatus);
      }
    });
    
    zone.addEventListener('dragover', (e) => {
      e.preventDefault(); // Necessary to allow dropping
    });
  });
}

function handleDragStart(e) {
  e.dataTransfer.setData('text/plain', e.target.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
}

// Utility to prevent XSS
function escapeHtml(text) {
  if (!text) return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
