import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { readBooks, writeBooks } from '../services/bookService';

const router = Router();

// Zod Schema for validation
const createBookSchema = z.object({
  title: z.string().min(1, "Title is required"),
  author: z.string().min(1, "Author is required"),
  year: z.number().optional()
});

// GET /books - Retrieve all books
router.get('/', async (req: Request, res: Response) => {
  try {
    const books = await readBooks();
    res.json(books);
  } catch (error) {
    console.error('Error reading books:', error);
    res.status(500).json({ message: 'Error reading books' });
  }
});

// POST /books - Create a new book
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate input using Zod
    const validatedData = createBookSchema.parse(req.body);
    
    const books = await readBooks();
    const newBook = { 
      id: Date.now().toString(), 
      ...validatedData 
    };
    
    books.push(newBook);
    await writeBooks(books);
    
    res.status(201).json(newBook);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Error saving book:', error);
    res.status(500).json({ message: 'Error saving book' });
  }
});

// DELETE /books/:id - Delete a book by ID
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let books = await readBooks();
    
    const initialLength = books.length;
    books = books.filter(book => book.id !== id);
    
    if (books.length === initialLength) {
      return res.status(404).json({ message: 'Book not found' });
    }
    
    await writeBooks(books);
    res.status(200).json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ message: 'Error deleting book' });
  }
});

export default router;