import axios from 'axios';

const api = axios.create({
  // Change 5000 to whatever port your backend terminal shows
  baseURL: 'http://localhost:5000/api', 
  timeout: 300000,
});

export default api;