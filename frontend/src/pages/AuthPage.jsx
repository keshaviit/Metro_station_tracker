import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, ArrowRight, ShieldCheck, RefreshCw, KeyRound, Sparkles } from 'lucide-react';

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, signup, verifyOtp, resendOtp, googleLogin, isAuthenticated } = useAuth();

  // Navigation check - if already logged in, redirect
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Tab State: 'login' | 'signup'
  const [activeTab, setActiveTab] = useState('login');

  // Form inputs
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OTP Screen State
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpUserId, setOtpUserId] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Status/Error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // OTP Ref for jumping inputs
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  // Timer for OTP resend
  useEffect(() => {
    let interval;
    if (showOtpScreen && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [showOtpScreen, resendTimer]);

  // Google OAuth button initializer
  useEffect(() => {
    // Only initialize if GIS script is loaded and we are not in the OTP screen
    if (window.google && !showOtpScreen) {
      try {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id.apps.googleusercontent.com',
          callback: handleGoogleCallback,
          cancel_on_tap_outside: true,
        });
        
        window.google.accounts.id.renderButton(
          document.getElementById('google-btn-container'),
          { 
            type: 'standard',
            theme: 'filled_dark', 
            size: 'large', 
            text: 'signin_with',
            shape: 'pill',
            width: '100%',
            logo_alignment: 'left'
          }
        );
      } catch (err) {
        console.error('Google Sign-In render failed:', err);
      }
    }
  }, [showOtpScreen, activeTab]);

  const handleGoogleCallback = async (response) => {
    setLoading(true);
    setError('');
    try {
      const res = await googleLogin(response.credential);
      if (res.success) {
        setSuccessMsg('Successfully signed in with Google!');
        setTimeout(() => navigate('/'), 1200);
      }
    } catch (err) {
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (activeTab === 'signup') {
      // Sign Up validation
      if (!name.trim() || !email.trim() || !password) {
        setError('Please fill in all fields.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }

      setLoading(true);
      try {
        const res = await signup(name, email, password);
        if (res.success) {
          setOtpUserId(res.userId);
          setSuccessMsg(res.message || 'Registration successful! Verification code sent.');
          // Delay screen swap slightly for visual ease
          setTimeout(() => {
            setShowOtpScreen(true);
            setResendTimer(60);
            setCanResend(false);
            setSuccessMsg('');
          }, 1500);
        }
      } catch (err) {
        setError(err.message || 'Registration failed');
      } finally {
        setLoading(false);
      }
    } else {
      // Login validation
      if (!email.trim() || !password) {
        setError('Please enter your email and password.');
        return;
      }

      setLoading(true);
      try {
        const res = await login(email, password);
        if (res.success) {
          setSuccessMsg('Logged in successfully!');
          setTimeout(() => navigate('/'), 1000);
        }
      } catch (err) {
        // If account exists but needs OTP verification
        if (err.message.includes('not verified') || err.needsVerification) {
          setOtpUserId(err.userId || err.response?.data?.userId);
          setError('');
          setSuccessMsg('Account needs verification. Sending a new code.');
          setTimeout(() => {
            setShowOtpScreen(true);
            setResendTimer(60);
            setCanResend(false);
            setSuccessMsg('');
          }, 1500);
        } else {
          setError(err.message || 'Login failed');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // OTP actions
  const handleOtpChange = (index, value) => {
    // Only accept numeric inputs
    if (value !== '' && !/^[0-9]$/.test(value)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);

    // Auto-focus next input box
    if (value !== '' && index < 5) {
      otpRefs[index + 1].current.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Backspace: clear current and jump back
    if (e.key === 'Backspace') {
      if (otpDigits[index] === '' && index > 0) {
        const newDigits = [...otpDigits];
        newDigits[index - 1] = '';
        setOtpDigits(newDigits);
        otpRefs[index - 1].current.focus();
      } else {
        const newDigits = [...otpDigits];
        newDigits[index] = '';
        setOtpDigits(newDigits);
      }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(pasteData)) return; // verify exactly 6 numbers

    const digits = pasteData.split('');
    setOtpDigits(digits);
    // Focus the last input box
    otpRefs[5].current.focus();
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    const fullOtp = otpDigits.join('');

    if (fullOtp.length < 6) {
      setError('Please enter all 6 digits of the OTP code.');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyOtp(otpUserId, fullOtp);
      if (res.success) {
        setSuccessMsg('Account verified & logged in!');
        setTimeout(() => navigate('/'), 1200);
      }
    } catch (err) {
      setError(err.message || 'Verification failed. Try again.');
      // Highlight boxes red by resetting digits if invalid
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs[0].current.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await resendOtp(otpUserId);
      if (res.success) {
        setSuccessMsg('New 6-digit OTP code sent successfully!');
        setResendTimer(60);
        setCanResend(false);
        setOtpDigits(['', '', '', '', '', '']);
        otpRefs[0].current.focus();
      }
    } catch (err) {
      setError(err.message || 'Could not resend OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] px-4 pt-16 pb-24 relative overflow-hidden flex flex-col justify-center">
      {/* Visual background lights matching HomePage style */}
      <div className="absolute top-10 left-1/4 w-[260px] h-[260px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[240px] h-[240px] bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Header and Branding */}
      <div className="text-center mb-8 relative z-10 animate-fade-in">
        <div className="inline-flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3.5 py-1 text-[11px] font-semibold text-indigo-300 mb-3.5 shadow-[0_0_15px_rgba(99,102,241,0.05)]">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          Commuter Telemetry Sync
        </div>
        <h2 className="text-3xl font-black text-white leading-none tracking-tight">
          Smart Metro
        </h2>
        <span className="text-sm font-semibold tracking-widest text-slate-400 uppercase mt-1.5 block">
          Telemetry & Navigation
        </span>
      </div>

      {/* Auth Main Card */}
      <div className="glass-card p-6 border border-white/5 bg-[#12141c]/50 backdrop-blur-2xl relative z-10 shadow-2xl rounded-2xl max-w-md mx-auto w-full transition-all duration-300">
        {!showOtpScreen ? (
          <>
            {/* Tabs selector */}
            <div className="grid grid-cols-2 p-1.5 bg-[#0a0b10] border border-white/5 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => { setActiveTab('login'); setError(''); setSuccessMsg(''); }}
                className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${
                  activeTab === 'login'
                    ? 'bg-indigo-600/90 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('signup'); setError(''); setSuccessMsg(''); }}
                className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${
                  activeTab === 'signup'
                    ? 'bg-indigo-600/90 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* General form submission */}
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {activeTab === 'signup' && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full bg-[#0a0b10] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-[#0a0b10] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0a0b10] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    required
                  />
                </div>
              </div>

              {activeTab === 'signup' && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#0a0b10] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Status and Error banners */}
              {error && (
                <div className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 animate-pulse text-center">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="text-[11px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5 text-center">
                  {successMsg}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-gradient text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider disabled:opacity-60 transition-all shadow-[0_4px_25px_rgba(99,102,241,0.2)] mt-2"
              >
                {loading ? (
                  <span className="flex gap-1.5 py-0.5">
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                  </span>
                ) : (
                  <>
                    <span>{activeTab === 'signup' ? 'Create Account' : 'Authenticate Session'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick divider */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <span className="relative px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-[#12141c]/50">
                OR LOGIN WITH
              </span>
            </div>

            {/* Google Sign In Area */}
            <div className="flex justify-center w-full min-h-[46px]">
              <div id="google-btn-container" className="w-full"></div>
            </div>
          </>
        ) : (
          /* OTP Screen Container */
          <form onSubmit={handleOtpSubmit} className="space-y-6 animate-slide-up">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(99,102,241,0.15)] text-indigo-400">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-lg font-black text-white">Email Verification</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto leading-normal">
                We sent a 6-digit OTP code to verify your credentials. Check your email.
              </p>
            </div>

            {/* Digits Grid */}
            <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={otpRefs[idx]}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  className="w-10 h-12 bg-[#0a0b10] border border-white/10 focus:border-indigo-500 rounded-lg text-center text-lg font-black text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono shadow-inner"
                  required
                />
              ))}
            </div>

            {/* Error and Success within OTP */}
            {error && (
              <div className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 animate-pulse text-center">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="text-[11px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5 text-center">
                {successMsg}
              </div>
            )}

            {/* Verify Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-gradient text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider disabled:opacity-60 transition-all shadow-[0_4px_25px_rgba(99,102,241,0.2)]"
            >
              {loading ? (
                <span className="flex gap-1.5 py-0.5">
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                </span>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 text-indigo-200" />
                  <span>Verify Passcode</span>
                </>
              )}
            </button>

            {/* Resend actions & timers */}
            <div className="flex flex-col items-center gap-2 text-center pt-2">
              {canResend ? (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold tracking-wide transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Resend Verification OTP
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">
                  Didn't receive? Resend OTP in{' '}
                  <span className="font-bold text-indigo-300 font-mono">{resendTimer}s</span>
                </span>
              )}
              
              <button
                type="button"
                onClick={() => { setShowOtpScreen(false); setError(''); setSuccessMsg(''); }}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wider font-bold mt-2"
              >
                Back to Authentication
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
