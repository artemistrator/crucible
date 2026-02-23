// --- Notification Manager Module ---
const NotificationManager = {
  async init() {
    // Проверяем статус при загрузке
    const enableBtn = document.getElementById('enable-notifications');
    const statusText = document.getElementById('notification-status');

    if (!('Notification' in window)) {
        if (statusText) statusText.textContent = 'Notifications not supported in this browser.';
        if (enableBtn) enableBtn.style.display = 'none';
        return;
    }

    if (Notification.permission === 'default') {
      // Показываем UI кнопку для запроса
      if (enableBtn) {
        enableBtn.style.display = 'block';
        enableBtn.addEventListener('click', () => this.requestPermission());
      }
    } else if (Notification.permission === 'granted') {
      if (enableBtn) enableBtn.style.display = 'none';
      if (statusText) statusText.textContent = 'Notifications enabled';
      // Проверяем задачи при запуске
      this.checkPendingTasks();
    } else if (Notification.permission === 'denied') {
        if (enableBtn) enableBtn.style.display = 'none';
        if (statusText) statusText.textContent = 'Notifications blocked. Please enable in settings.';
    }
  },

  async requestPermission() {
    if (!('Notification' in window)) {
      console.error('This browser does not support desktop notification');
      return;
    }

    const permission = await Notification.requestPermission();
    const statusText = document.getElementById('notification-status');
    const enableBtn = document.getElementById('enable-notifications');

    if (permission === 'granted') {
      localStorage.setItem('notificationsEnabled', 'true');
      console.log('Notification permission granted.');
      if (enableBtn) enableBtn.style.display = 'none';
      if (statusText) statusText.textContent = 'Notifications enabled!';
      this.checkPendingTasks();
    } else {
        if (statusText) statusText.textContent = 'Permission denied. Check system settings.';
    }
  },

  async sendNotification(title, body) {
    // Используем Service Worker для более надежной доставки в iOS PWA
    if ('serviceWorker' in navigator && 'showNotification' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          body: body,
          icon: '/icons/icon-192x192.png',
          vibrate: [200, 100, 200],
          tag: 'todo-reminder',
          requireInteraction: true
        });
        return;
      }
    }

    // Fallback для старых браузеров или если SW не готов
    if (Notification.permission === 'granted') {
      new Notification(title, { body: body });
    }
  },

  checkPendingTasks() {
    const todos = JSON.parse(localStorage.getItem('todos')) || [];
    const now = new Date();
    const todayString = now.toISOString().split('T')[0];
    
    // Простая логика: найти задачи на сегодня или просроченные
    const pendingTodos = todos.filter(t => {
        if (t.completed) return false;
        if (!t.dueDate) return false; // Только задачи с датой
        return t.dueDate <= todayString;
    });

    if (pendingTodos.length > 0) {
      // Проверяем, не напоминали ли мы сегодня (защита от спама)
      const lastReminder = localStorage.getItem('lastReminderDate');
      const todayDate = now.toDateString();

      if (lastReminder !== todayDate) {
        this.sendNotification(
          'У вас есть невыполненные задачи!', 
          `У вас осталось ${pendingTodos.length} задач.`
        );
        localStorage.setItem('lastReminderDate', todayDate);
      }
    }
  }
};

// --- Todo App Logic ---

const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoDate = document.getElementById('todo-date');
const todoList = document.getElementById('todo-list');

let todos = JSON.parse(localStorage.getItem('todos')) || [];

function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
    // Trigger check whenever todos change (e.g., a task is added)
    // Note: We might want to debouce this or only check on specific actions to avoid spam
    // NotificationManager.checkPendingTasks(); 
}

function renderTodos() {
    todoList.innerHTML = '';
    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = todo.completed ? 'completed' : '';
        
        const span = document.createElement('span');
        span.textContent = todo.text;
        if(todo.dueDate) {
            const dateSpan = document.createElement('small');
            dateSpan.textContent = ` (Due: ${todo.dueDate})`;
            span.appendChild(dateSpan);
        }

        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = todo.completed ? 'Undo' : 'Complete';
        toggleBtn.onclick = () => toggleTodo(index);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteTodo(index);

        li.appendChild(span);
        li.appendChild(toggleBtn);
        li.appendChild(deleteBtn);
        todoList.appendChild(li);
    });
}

function addTodo(text, date) {
    todos.push({ text, completed: false, dueDate: date });
    saveTodos();
    renderTodos();
    
    // Check tasks after adding a new one
    NotificationManager.checkPendingTasks();
}

function toggleTodo(index) {
    todos[index].completed = !todos[index].completed;
    saveTodos();
    renderTodos();
}

function deleteTodo(index) {
    todos.splice(index, 1);
    saveTodos();
    renderTodos();
}

todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    const date = todoDate.value;
    if (text) {
        addTodo(text, date);
        todoInput.value = '';
        todoDate.value = '';
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    NotificationManager.init();
    renderTodos();
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
