import Dexie, { Table } from 'dexie';

export interface Task {
  id?: number;
  title: string;
  description?: string;
  projectId: number;
  status: 'todo' | 'in-progress' | 'done';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  timeSpent?: number;
  attachments?: string[];
  createdAt: string;
}

export interface Project {
  id?: number;
  name: string;
  color?: string;
  createdAt: string;
}

export class AppDB extends Dexie {
  tasks!: Table<Task>;
  projects!: Table<Project>;

  constructor() {
    super('FocusTaskDB');
    this.version(1).stores({
      tasks: '++id, projectId, status, dueDate, createdAt', 
      projects: '++id, name, createdAt'
    });
  }
}

export const db = new AppDB();
