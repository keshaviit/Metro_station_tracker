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
  const [showCredForm, setShowCredForm] = useState(false);
  
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
    <div className="bg-gradient-to-b from-[#eefaf5] via-[#fcf8ff] to-[#f4f7fc] font-body-lg text-on-background min-h-screen flex items-center justify-center p-md relative w-full overflow-y-auto">
      
      {/* Main Auth Canvas */}
      <main className="w-full max-w-[420px] flex flex-col items-center py-8">
        
        {/* Authentication Card */}
        <div className="w-full bg-white border border-gray-100 rounded-[28px] p-8 shadow-[0_8px_30px_rgba(0,0,0,0.03)] relative">
          
          {/* Back Button for Credentials Form or OTP Screen */}
          {(showCredForm || showOtpScreen) && (
            <button 
              onClick={() => {
                if (showOtpScreen) {
                  setShowOtpScreen(false);
                  setShowCredForm(true);
                } else {
                  setShowCredForm(false);
                }
                setError('');
                setSuccessMsg('');
              }}
              className="absolute left-6 top-6 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
            </button>
          )}

          {/* Central Logo / Shield Section */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-[#00ab82] flex items-center justify-center text-white mb-6 shadow-[0_4px_12px_rgba(0,171,130,0.15)]">
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M12 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="currentColor" />
                <path d="M12 12v3" />
              </svg>
            </div>
            
            <h2 className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight">
              {showOtpScreen 
                ? "Verify your email" 
                : showCredForm 
                  ? "Sign in with Email" 
                  : "Sign in to your account"}
            </h2>
            <p className="text-gray-500 text-sm mt-2 max-w-[280px]">
              {showOtpScreen 
                ? `Enter the 6-digit verification code sent to ${email}`
                : showCredForm 
                  ? "Enter your email to receive a secure sign-in passcode."
                  : "Sign in to see your saved stations and trip history."}
            </p>
          </div>

          {/* Conditional form bodies */}
          {!showCredForm && !showOtpScreen ? (
            /* Mockup landing screen: Sign In & Continue as Guest */
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => setShowCredForm(true)}
                className="w-full h-12 bg-[#00664e] hover:bg-[#00523f] text-white rounded-full font-bold text-[15px] shadow-sm hover:shadow transition-all active:scale-[0.98] flex items-center justify-center"
              >
                Sign In
              </button>
              
              <button 
                onClick={handleGuestMode}
                className="w-full h-12 bg-white border border-gray-200 hover:border-gray-300 text-[#00664e] rounded-full font-bold text-[15px] transition-all active:scale-[0.98] flex items-center justify-center"
              >
                Continue as Guest
              </button>
            </div>
          ) : showOtpScreen ? (
            /* OTP Screen */
            <form onSubmit={handleOtpSubmit} className="flex flex-col gap-6">
              {/* OTP Digits inputs */}
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
                    className="w-11 h-12 bg-gray-50 border border-gray-200 focus:border-[#00ab82] focus:ring-2 focus:ring-[#00ab82]/20 rounded-xl text-center text-[18px] font-bold text-gray-800 outline-none transition-all font-mono"
                    required
                  />
                ))}
              </div>

              {error && (
                <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-center font-medium">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="text-[12px] text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 text-center font-medium">
                  {successMsg}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full h-12 bg-[#00664e] hover:bg-[#00523f] text-white rounded-full font-bold text-[15px] shadow-sm transition-all active:scale-[0.98] flex items-center justify-center"
              >
                {loading ? (
                  <span className="flex gap-1.5">
                    <span className="loading-dot bg-white" />
                    <span className="loading-dot bg-white" />
                    <span className="loading-dot bg-white" />
                  </span>
                ) : (
                  "Verify Passcode"
                )}
              </button>

              <div className="flex flex-col items-center gap-2 pt-2 text-center">
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-xs font-bold text-[#00664e] hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">refresh</span>
                    Resend code
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">
                    Resend passcode in <span className="font-bold text-[#00664e]">{resendTimer}s</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => { setShowOtpScreen(false); setShowCredForm(true); setError(''); setSuccessMsg(''); }}
                  className="text-xs font-bold text-gray-400 hover:text-gray-600 uppercase tracking-wider mt-2"
                >
                  Change Email Address
                </button>
              </div>
            </form>
          ) : (
            /* Email Form */
            <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
              {/* Google Sign-in */}
              {!Capacitor.isNativePlatform() && (
                <>
                  <div className="flex flex-col items-center gap-sm">
                    <div id="google-signin-target" className="flex justify-center w-full min-h-[44px]"></div>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-sm my-1">
                    <div className="h-[1px] flex-1 bg-gray-100"></div>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">or</span>
                    <div className="h-[1px] flex-1 bg-gray-100"></div>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1" htmlFor="email">Email Address</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#00ab82] transition-colors text-[20px]">mail</span>
                  <input 
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full h-12 pl-12 pr-4 bg-gray-50 border border-gray-200 focus:border-[#00ab82] focus:ring-2 focus:ring-[#00ab82]/20 rounded-xl outline-none transition-all text-[15px] text-gray-800"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-center font-medium">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="text-[12px] text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 text-center font-medium">
                  {successMsg}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full h-12 bg-[#00664e] hover:bg-[#00523f] text-white rounded-full font-bold text-[15px] shadow-sm transition-all active:scale-[0.98] flex items-center justify-center"
              >
                {loading ? (
                  <span className="flex gap-1.5">
                    <span className="loading-dot bg-white" />
                    <span className="loading-dot bg-white" />
                    <span className="loading-dot bg-white" />
                  </span>
                ) : (
                  "Continue with Email"
                )}
              </button>
            </form>
          )}

          {/* Card Footer Links */}
          <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-gray-100 text-xs font-bold text-gray-400">
            <a href="#" className="hover:text-gray-600 transition-colors">Privacy Policy</a>
            <span className="text-gray-200">|</span>
            <a href="#" className="hover:text-gray-600 transition-colors">Help Center</a>
          </div>

        </div>
      </main>
    </div>
  );
}
