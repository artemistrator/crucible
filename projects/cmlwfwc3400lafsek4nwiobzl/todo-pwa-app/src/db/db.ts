import Dexie, { Table } from 'dexie';

// Предварительное определение интерфейсов (будет расширено в следующих задачах)
export interface Task {
  id?: number;
  title: string;
  description?: string;
  isCompleted: boolean;
  dueDate?: Date;
}

export class AppDB extends Dexie {
  tasks!: Table<Task>;

  constructor() {
    super('TodoPWA-Database');
    // Версия 1 базы данных
    this.version(1).stores({
      tasks: '++id, title, isCompleted, dueDate' 
    });
  }
}

export const db = new AppDB();
