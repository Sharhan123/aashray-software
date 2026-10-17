import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { App } from './App';
import { FeedbackProvider } from './components/Feedback';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><FeedbackProvider><App /></FeedbackProvider></AuthProvider></BrowserRouter></QueryClientProvider></React.StrictMode>,
);
