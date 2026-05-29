import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, ArrowRight, ShieldCheck, RefreshCw, KeyRound, Sparkles, Navigation2 } from 'lucide-react';

export default function AuthPage() {
  const navigate = useNavigate();
  const { signup, verifyOtp, resendOtp, googleLogin, isAuthenticated } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Form states
  const [email, setEmail] = useState('');
  
  // OTP Verification Screen
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpUserId, setOtpUserId] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // loading/error status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  // OTP Countdown Timer
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

  // Initialize Google Sign-in button
  useEffect(() => {
    if (window.google && !showOtpScreen) {
      try {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '8647e74b-8524-4315-81f2-472ce4f65d52.apps.googleusercontent.com',
          callback: handleGoogleCallback,
          cancel_on_tap_outside: true,
        });
        
        window.google.accounts.id.renderButton(
          document.getElementById('google-signin-target'),
          { 
            type: 'standard',
            theme: 'filled_dark', 
            size: 'large', 
            text: 'continue_with',
            shape: 'pill',
            width: '100%',
            logo_alignment: 'left'
          }
        );
      } catch (err) {
        console.error('Google Sign-In render error:', err);
      }
    }
  }, [showOtpScreen]);

  const handleGoogleCallback = async (response) => {
    setLoading(true);
    setError('');
    try {
      const res = await googleLogin(response.credential);
      if (res.success) {
        setSuccessMsg('Successfully signed in with Google!');
        setTimeout(() => navigate('/'), 1000);
      }
    } catch (err) {
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      // Calls the sign-up register endpoint (which generates & emails OTP passwordlessly)
      const res = await signup('', email, '');
      if (res.success) {
        setOtpUserId(res.userId || res.data?.userId);
        setSuccessMsg('Passcode sent! Check your inbox.');
        setTimeout(() => {
          setShowOtpScreen(true);
          setResendTimer(60);
          setCanResend(false);
          setSuccessMsg('');
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Could not send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value !== '' && !/^[0-9]$/.test(value)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);

    if (value !== '' && index < 5) {
      otpRefs[index + 1].current.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
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
    if (!/^\d{6}$/.test(pasteData)) return;

    const digits = pasteData.split('');
    setOtpDigits(digits);
    otpRefs[5].current.focus();
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    const fullOtp = otpDigits.join('');

    if (fullOtp.length < 6) {
      setError('Please enter all 6 digits.');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyOtp(otpUserId, fullOtp);
      if (res.success) {
        setSuccessMsg('Account verified successfully!');
        setTimeout(() => navigate('/'), 1000);
      }
    } catch (err) {
      setError(err.message || 'Invalid passcode. Please try again.');
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
        setSuccessMsg('A new verification code has been sent!');
        setResendTimer(60);
        setCanResend(false);
        setOtpDigits(['', '', '', '', '', '']);
        otpRefs[0].current.focus();
      }
    } catch (err) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = () => {
    localStorage.setItem('metro_guest', 'true');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#07080d] px-4 pt-16 pb-24 relative overflow-hidden flex flex-col justify-center">
      {/* Lights background layer */}
      <div className="absolute top-10 left-1/4 w-[260px] h-[260px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[240px] h-[240px] bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Brand Header */}
      <div className="text-center mb-8 relative z-10 animate-fade-in">
        <div className="inline-flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3.5 py-1 text-[11px] font-semibold text-indigo-300 mb-3 shadow-[0_0_15px_rgba(99,102,241,0.05)]">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          Delhi Transit Guide
        </div>
        <h2 className="text-3xl font-black text-white leading-none tracking-tight">
          Delhi MetroPulse
        </h2>
        <span className="text-xs font-bold tracking-widest text-slate-400 uppercase mt-2.5 block">
          One-Stop Commuter Solution
        </span>
      </div>

      {/* Main Glass Card Form Container */}
      <div className="glass-card p-6 border border-white/5 bg-[#12141c]/50 backdrop-blur-2xl relative z-10 shadow-2xl rounded-2xl max-w-md mx-auto w-full transition-all duration-300">
        {!showOtpScreen ? (
          <div className="space-y-6">
            {/* Action 1: Google login (placed prominently at top as requested) */}
            <div className="space-y-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                Fast Sign-In Options
              </span>
              <div className="flex justify-center w-full min-h-[46px]">
                <div id="google-signin-target" className="w-full"></div>
              </div>
            </div>

            {/* Visual Divider */}
            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <span className="relative px-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-[#12141c]/50">
                OR PASSWORDLESS EMAIL OTP
              </span>
            </div>

            {/* Action 3: Passwordless Email Login */}
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
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

              {error && (
                <div className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-center animate-pulse">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="text-[11px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5 text-center">
                  {successMsg}
                </div>
              )}

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
                    <span>Send Verification Passcode</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Visual Divider */}
            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <span className="relative px-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-[#12141c]/50">
                GUEST COMMUTER BYPASS
              </span>
            </div>

            {/* Action 2: Skip Sign Up / Guest Mode */}
            <button
              onClick={handleGuestMode}
              className="w-full bg-[#1A1D27]/50 border border-white/5 hover:border-white/10 text-slate-300 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all"
            >
              <Navigation2 className="w-4 h-4 text-slate-400 rotate-45" />
              Skip Registration & Continue
            </button>
          </div>
        ) : (
          /* OTP Screen */
          <form onSubmit={handleOtpSubmit} className="space-y-6 animate-slide-up">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(99,102,241,0.15)] text-indigo-400">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-lg font-black text-white">Email Verification</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto leading-normal">
                A 6-digit login code has been sent to <span className="font-semibold text-white">{email}</span>.
              </p>
            </div>

            {/* Passcode Digits Inputs */}
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

            {error && (
              <div className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-center animate-pulse">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="text-[11px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5 text-center">
                {successMsg}
              </div>
            )}

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
                  <span>Verify Login Passcode</span>
                </>
              )}
            </button>

            <div className="flex flex-col items-center gap-2 text-center pt-2">
              {canResend ? (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold tracking-wide transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Resend Login Passcode
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">
                  Didn't receive? Resend in{' '}
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
