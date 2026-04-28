import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('Bitespeed Identity Reconciliation API is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});