import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Capacitor } from '@capacitor/core';

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
  const [otpUserName, setOtpUserName] = useState('');
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
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '858891357145-qb9rkst3hfe5kn73br91u4k73b1ooojo.apps.googleusercontent.com',
          callback: handleGoogleCallback,
          cancel_on_tap_outside: true,
        });
        
        window.google.accounts.id.renderButton(
          document.getElementById('google-signin-target'),
          { 
            type: 'standard',
            theme: 'outline', 
            size: 'large', 
            text: 'continue_with',
            shape: 'rectangular',
            width: '280',
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
      const res = await signup('', email, '');
      if (res.success) {
        setOtpUserId(res.userId || res.data?.userId);
        setOtpUserName(res.name || email.split('@')[0]);
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
      const res = await resendOtp(otpUserId, email, otpUserName);
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
    <div className="bg-background font-body-lg text-on-background min-h-screen flex items-center justify-center p-md relative w-full overflow-y-auto">
      {/* Decorative Background Elements for Modern UI Depth */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]"></div>
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-tertiary/5 blur-[120px]"></div>
      </div>

      {/* Main Auth Canvas */}
      <main className="w-full max-w-[440px] flex flex-col items-center py-8">
        {/* Brand Identity Section */}
        <header className="text-center mb-xl">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-xl mb-md soft-shadow inner-glow text-white">
            <span className="material-symbols-outlined text-[32px]">subway</span>
          </div>
          <h1 className="font-display-lg text-display-lg text-primary tracking-tight mb-xs">
            METROPULSE
          </h1>
          <p className="font-title-md text-title-md text-on-surface-variant/80 tracking-wide uppercase text-[12px]">
            Delhi Transit Node Solution
          </p>
        </header>

        {/* Authentication Card */}
        <div className="w-full glass-panel border border-outline-variant/30 rounded-xl p-xl soft-shadow">
          {!showOtpScreen ? (
            <div className="flex flex-col gap-lg">
              {/* Google Sign-in */}
              {!Capacitor.isNativePlatform() && (
                <>
                  <div className="flex flex-col items-center gap-sm">
                    <div id="google-signin-target" className="flex justify-center w-full min-h-[44px]"></div>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-sm">
                    <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
                    <span className="font-label-md text-label-md text-on-surface-variant/60">OR</span>
                    <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
                  </div>
                </>
              )}

              {/* Email Form */}
              <form onSubmit={handleSendOtp} className="flex flex-col gap-md">
                <div className="flex flex-col gap-xs">
                  <label className="font-label-md text-label-md text-on-surface-variant ml-xs" htmlFor="email">Email Address</label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">mail</span>
                    <input 
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full h-12 pl-[48px] pr-md bg-surface-container-low border border-outline-variant/50 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body-sm text-body-sm text-on-surface"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-red-600 bg-red-100 border border-red-200 rounded-lg px-3 py-2 text-center animate-pulse">
                    {error}
                  </div>
                )}
                {successMsg && (
                  <div className="text-xs text-green-700 bg-green-100 border border-green-200 rounded-lg px-3 py-2 text-center">
                    {successMsg}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-12 bg-primary text-on-primary rounded-lg font-label-md text-label-md inner-glow hover:bg-primary-container transition-all active:scale-[0.98] soft-shadow flex items-center justify-center"
                >
                  {loading ? (
                    <span className="flex gap-1">
                      <span className="loading-dot bg-white" />
                      <span className="loading-dot bg-white" />
                      <span className="loading-dot bg-white" />
                    </span>
                  ) : (
                    "Continue with Email"
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-sm">
                <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
                <span className="font-label-md text-label-md text-on-surface-variant/60">DIRECT ACCESS</span>
                <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
              </div>

              {/* Guest Login */}
              <button 
                onClick={handleGuestMode}
                className="w-full h-12 flex items-center justify-center gap-sm bg-surface-container-lowest border border-outline-variant/50 rounded-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">explore_nearby</span>
                Continue as Guest
              </button>

              <p className="font-body-sm text-body-sm text-center text-on-surface-variant/70 mt-sm">
                By continuing, you agree to our <a className="text-primary hover:underline" href="#">Terms of Service</a> and <a class="text-primary hover:underline" href="#">Privacy Policy</a>.
              </p>
            </div>
          ) : (
            /* OTP Screen */
            <form onSubmit={handleOtpSubmit} className="flex flex-col gap-lg">
              <div className="text-center">
                <span className="material-symbols-outlined text-primary text-[48px] animate-pulse">verified_user</span>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mt-xs font-extrabold">Email Verification</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant/80 mt-sm">
                  We've sent a 6-digit login code to <br /><span className="font-bold text-on-surface">{email}</span>.
                </p>
              </div>

              {/* OTP Digits inputs */}
              <div className="flex justify-center gap-sm" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={otpRefs[idx]}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-10 h-12 bg-surface-container-low border border-outline-variant/50 rounded-lg text-center text-lg font-black text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                    required
                  />
                ))}
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-100 border border-red-200 rounded-lg px-3 py-2 text-center animate-pulse">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="text-xs text-green-700 bg-green-100 border border-green-200 rounded-lg px-3 py-2 text-center">
                  {successMsg}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full h-12 bg-primary text-on-primary rounded-lg font-label-md text-label-md inner-glow hover:bg-primary-container transition-all active:scale-[0.98] soft-shadow flex items-center justify-center"
              >
                {loading ? (
                  <span className="flex gap-1">
                    <span className="loading-dot bg-white" />
                    <span className="loading-dot bg-white" />
                    <span className="loading-dot bg-white" />
                  </span>
                ) : (
                  "Verify Passcode"
                )}
              </button>

              <div className="flex flex-col items-center gap-sm pt-sm text-center">
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="font-label-md text-label-md text-primary hover:underline flex items-center gap-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                    Resend verification code
                  </button>
                ) : (
                  <span className="font-body-sm text-body-sm text-on-surface-variant/80">
                    Resend passcode in <span className="font-bold text-primary">{resendTimer}s</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => { setShowOtpScreen(false); setError(''); setSuccessMsg(''); }}
                  className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface uppercase tracking-wider mt-sm"
                >
                  Change Email Address
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Secondary Information / Footer */}
        <footer className="mt-xl text-center">
          <div className="flex items-center justify-center gap-md">
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">verified_user</span>
              <span className="font-label-md text-label-md text-on-surface-variant/60">Secure SSL Transit</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-outline-variant/50"></div>
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">public</span>
              <span className="font-label-md text-label-md text-on-surface-variant/60">v4.2.0-stable</span>
            </div>
          </div>
        </footer>
      </main>

      {/* Contextual Visual - Background Card Decor */}
      <div className="hidden lg:block fixed right-[10%] top-1/2 -translate-y-1/2 w-[380px] h-[520px] glass-panel border border-outline-variant/20 rounded-[32px] overflow-hidden soft-shadow opacity-40 rotate-3 translate-x-12 -z-20">
        <img 
          alt="Futuristic transit hub" 
          className="w-full h-full object-cover grayscale brightness-110" 
          src="https://lh3.googleusercontent.com/aida/AP1WRLsjPoEkej0dTcKU8_WoFejAO3wJac9uZXzH0-pwXZMzZ5Vy3GfDfSO-BdRrkfypnwf8Jp4Ty-WaMPmk45G5KJzEOtdZNGBLhn9046kuvR2m94KbDjjYh4D_2ezJQo9iWSdShQjbDY51BXAu74I1iZXo7_reEHFpuKm325pd-WL6YOBC6Bd0TKNlllWL1BqLD01ngKB7YA9T_0jlfxWjqtqT5ywQeH2mC_1uvhi1l-oLvZauiUQb8RdAsIA"
        />
      </div>
    </div>
  );
}
