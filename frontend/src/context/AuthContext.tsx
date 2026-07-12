import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import toast from 'react-hot-toast';

// Configure Axios Defaults
axios.defaults.withCredentials = true;

// Interceptor to fetch and attach CSRF token if necessary
// In many modern stacks, the cookie-parser and csrf-csrf middleware
// will read the cookie and require a header. `csrf-csrf` expects 'x-csrf-token'.
// We will fetch it once on startup and attach it.
let csrfTokenPromise: Promise<string> | null = null;

const fetchCsrfToken = async () => {
  if (!csrfTokenPromise) {
    csrfTokenPromise = axios.get(`${API_BASE}/api/csrf-token`).then(res => {
      const token = res.data.token;
      axios.defaults.headers.common['x-csrf-token'] = token;
      return token;
    }).catch(err => {
      console.error('Failed to fetch CSRF token', err);
      csrfTokenPromise = null;
      return '';
    });
  }
  return csrfTokenPromise;
};

// Add interceptor to retry CSRF if failed (optional, keeping it simple for now)
axios.interceptors.request.use(async (config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    if (!axios.defaults.headers.common['x-csrf-token']) {
      await fetchCsrfToken();
    }
  }
  return config;
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  username: string;
  role: string;
}

export interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>(null as any);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await fetchCsrfToken();
        const res = await axios.get(`${API_BASE}/api/auth/me`);
        if (res.data.authenticated === true) {
           setUser(res.data.user);
        } else {
           setUser(null);
        }
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    initializeAuth();
  }, []);

  const login = (newUser: User) => {
    setUser(newUser);
  };

  const logout = async () => {
    try {
      await axios.post(`${API_BASE}/api/auth/logout`);
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      setUser(null);
      toast.success('Logged out successfully');
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
