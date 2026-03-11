import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.errors ?? err.message ?? 'Unknown error';
    return Promise.reject(new Error(message));
  },
);

export default client;
