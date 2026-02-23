function appData() {
  return {
    tasks: [],
    newTaskTitle: '',
    draggedItem: null,
    draggedOverItem: null,

    init() {
      const stored = localStorage.getItem('kanban-tasks');
      if (stored) {
        this.tasks = JSON.parse(stored);
      }

      // Data Migration: Ensure new fields exist for old tasks
      this.tasks.forEach(t => {
        if (!t.timer) {
          t.timer = { elapsed: 0, lastTick: null, isRunning: false };
        } else if (t.timer.isRunning) {
          // Safe recovery for running timers on reload
          this.pauseTimer(t); 
        }
        if (!t.comments) {
          t.comments = [];
        }
      });

      // Global timer ticker
      setInterval(() => {
        this.$el.dispatchEvent(new Event('timer-tick'));
      }, 1000);
    },

    save() {
      localStorage.setItem('kanban-tasks', JSON.stringify(this.tasks));
    },

    addTask() {
      if (this.newTaskTitle.trim() === '') return;
      this.tasks.push({
        id: crypto.randomUUID(),
        title: this.newTaskTitle,
        description: '',
        status: 'todo',
        timer: { elapsed: 0, lastTick: null, isRunning: false },
        comments: []
      });
      this.newTaskTitle = '';
      this.save();
    },

    deleteTask(id) {
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.save();
    },

    // --- Timer Logic ---
    toggleTimer(task) {
      if (task.timer.isRunning) {
        this.pauseTimer(task);
      } else {
        this.startTimer(task);
      }
      this.save();
    },

    startTimer(task) {
      task.timer.isRunning = true;
      task.timer.lastTick = Date.now();
    },

    pauseTimer(task) {
      if (task.timer.isRunning) {
        const now = Date.now();
        const delta = Math.floor((now - task.timer.lastTick) / 1000);
        task.timer.elapsed += delta;
        task.timer.isRunning = false;
        task.timer.lastTick = null;
      }
    },

    resetTimer(task) {
      this.pauseTimer(task);
      task.timer.elapsed = 0;
      this.save();
    },

    getDisplayTime(task) {
      let total = task.timer.elapsed;
      if (task.timer.isRunning && task.timer.lastTick) {
        total += Math.floor((Date.now() - task.timer.lastTick) / 1000);
      }
      return this.formatTime(total);
    },

    formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    },

    // --- Comments Logic ---
    addComment(task, event) {
      const input = event.target;
      const text = input.value.trim();
      if (!text) return;

      task.comments.push({
        id: crypto.randomUUID(),
        text: text,
        timestamp: Date.now()
      });

      input.value = '';
      this.save();
    },

    formatDate(ts) {
      return new Date(ts).toLocaleString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    },

    // --- Drag & Drop (Existing) ---
    dragStart(task, event) {
      this.draggedItem = task;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', task.id);
    },
    dragOver(status) {
      this.draggedOverItem = status;
    },
    drop(status) {
      const task = this.tasks.find(t => t.id === this.draggedItem.id);
      if (task && task.status !== status) {
        task.status = status;
        this.save();
      }
      this.draggedItem = null;
      this.draggedOverItem = null;
    }
  }
}