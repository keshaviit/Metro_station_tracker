import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, sendOtpViaVercel } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('metro_auth_token'));
  const [loading, setLoading] = useState(true);

  // Synchronize auth state and validate token with backend
  const verifySession = useCallback(async (authToken) => {
    if (!authToken) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await authAPI.getMe();
      if (res.success && res.user) {
        setUser(res.user);
      } else {
        // Clear stale session
        logout();
      }
    } catch (err) {
      console.error('Session verification failed:', err.message);
      // Clear token if unauthorized, but keep offline state if network is down
      if (err.message.includes('authorized') || err.message.includes('expired') || err.message.includes('token')) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Check auth state on mount
  useEffect(() => {
    verifySession(token);
  }, [token, verifySession]);

  const login = async (email, password) => {
    try {
      const res = await authAPI.login({ email, password });
      if (res.success && res.token) {
        localStorage.setItem('metro_auth_token', res.token);
        setToken(res.token);
        setUser(res.user);
      }
      return res;
    } catch (err) {
      throw err;
    }
  };

  const signup = async (name, email, password) => {
    try {
      // Step 1: Register user on Render backend (creates user, no email sent)
      const res = await authAPI.register({ name, email, password });
      if (res.success && res.userId) {
        // Step 2: Send OTP email via Vercel serverless function (Vercel allows Gmail SMTP)
        await sendOtpViaVercel({ userId: res.userId, email, name: res.name || name || email.split('@')[0] });
      }
      return res;
    } catch (err) {
      throw err;
    }
  };

  const verifyOtp = async (userId, otp) => {
    try {
      const res = await authAPI.verifyOtp({ userId, otp });
      if (res.success && res.token) {
        localStorage.setItem('metro_auth_token', res.token);
        setToken(res.token);
        setUser(res.user);
      }
      return res;
    } catch (err) {
      throw err;
    }
  };

  const resendOtp = async (userId, email, name) => {
    try {
      // Re-send OTP via Vercel serverless function (same as initial send)
      return await sendOtpViaVercel({ userId, email, name });
    } catch (err) {
      throw err;
    }
  };

  const googleLogin = async (idToken) => {
    try {
      const res = await authAPI.googleLogin({ idToken });
      if (res.success && res.token) {
        localStorage.setItem('metro_auth_token', res.token);
        setToken(res.token);
        setUser(res.user);
      }
      return res;
    } catch (err) {
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('metro_auth_token');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    signup,
    verifyOtp,
    resendOtp,
    googleLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
