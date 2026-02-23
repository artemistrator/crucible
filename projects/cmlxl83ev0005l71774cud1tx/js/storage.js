/**
 * StorageService - Handles LocalStorage operations
 */
const STORAGE_KEY = 'kanban-todo-app-state';

const StorageService = {
  /**
   * Loads the state from localStorage. Returns default state if empty.
   * @returns {Object} The application state object.
   */
  loadState() {
    try {
      const serializedState = localStorage.getItem(STORAGE_KEY);
      if (serializedState === null) {
        // Return default initial state
        return {
          tasks: [
            { id: '1', title: 'Изучить проект', description: 'Разобраться в структуре', status: 'todo' },
            { id: '2', title: 'Создать задачу', description: 'Протестировать добавление', status: 'in-progress' }
          ]
        };
      }
      return JSON.parse(serializedState);
    } catch (err) {
      console.error('Error loading state from localStorage:', err);
      return { tasks: [] };
    }
  },

  /**
   * Saves the state to localStorage.
   * @param {Object} state The application state object to save.
   */
  saveState(state) {
    try {
      const serializedState = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, serializedState);
    } catch (err) {
      console.error('Error saving state to localStorage:', err);
      // Handle quota exceeded or other errors if necessary
      alert('Не удалось сохранить изменения. Недостаточно места?');
    }
  }
};

// Export for use in other modules (if using modules) or global scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageService;
}
