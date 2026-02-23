document.addEventListener('alpine:init', () => {
    Alpine.store('tasks', {
        tasks: [],
        storageKey: 'simple_todo_app_v1',

        init() {
            // Загрузка из LocalStorage при старте
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                try {
                    this.tasks = JSON.parse(saved);
                } catch (e) {
                    console.error('Failed to parse tasks from LocalStorage', e);
                    this.tasks = [];
                }
            }
        },

        // Метод для сохранения
        save() {
            localStorage.setItem(this.storageKey, JSON.stringify(this.tasks));
        },

        // CRUD: Create
        add(title, description, dueDate, column = 'todo') {
            const newTask = {
                id: Date.now().toString(), // Генерация ID
                title,
                description,
                status: 'todo', // default status
                dueDate,
                column
            };
            
            this.tasks.push(newTask);
            this.save();
        },

        // CRUD: Update
        update(id, updates) {
            const index = this.tasks.findIndex(t => t.id === id);
            if (index !== -1) {
                this.tasks[index] = { ...this.tasks[index], ...updates };
                this.save();
            }
        },

        // CRUD: Delete
        delete(id) {
            this.tasks = this.tasks.filter(t => t.id !== id);
            this.save();
        },

        // Helper: Получить задачи для конкретной колонки
        getTasksByColumn(columnId) {
            return this.tasks.filter(t => t.column === columnId);
        }
    });
});