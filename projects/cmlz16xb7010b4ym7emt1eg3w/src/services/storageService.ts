import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

const FILE_PATH = resolve(process.cwd(), 'books.json');

export interface Book {
  id: string;
  title: string;
  author: string;
}

export type BooksData = Book[];

export async function getBooks(): Promise<BooksData> {
  try {
    const content = await readFile(FILE_PATH, 'utf-8');
    const data = JSON.parse(content);
    // Basic validation to ensure data is an array
    if (!Array.isArray(data)) {
      throw new Error('Invalid data format: expected an array');
    }
    return data;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File does not exist - create it with an empty array
      await writeFile(FILE_PATH, '[]', 'utf-8');
      return [];
    }
    throw error;
  }
}

export async function saveBooks(books: BooksData): Promise<void> {
  await writeFile(FILE_PATH, JSON.stringify(books, null, 2), 'utf-8');
}