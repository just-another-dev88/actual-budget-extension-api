import express from 'express';
import { requestLogger, errorHandler } from './middleware';
import routes from './routes';

const app = express();

app.use(express.json());
app.use(requestLogger);

app.use(routes);

// Global Error Handler must be last
app.use(errorHandler);

export default app;
