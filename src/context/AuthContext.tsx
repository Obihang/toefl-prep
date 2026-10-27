import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { User as UserIcon, AlertTriangle, X } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  displayName: string;
  setDisplayName: (name: string) => void;
  authError?: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  displayName: '',
  setDisplayName: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [displayName, setDisplayNameState] = useState<string>(() => {
    return (localStorage.getItem('toefl_display_name') || '').trim();
  });
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      window.dispatchEvent(new CustomEvent('toefl_user_changed', { detail: { uid: currentUser?.uid || 'guest' } }));
      if (currentUser) {
        setUser(currentUser);
        setAuthError(null);
        setLoading(false);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (err: any) {
          const errStr = String(err?.message || err || '');
          console.warn('Firebase Auth token service notice:', errStr);

          // Fallback guest user so app is fully usable even before enabling Anonymous auth or Secure Token API in Firebase console
          const guestUid = localStorage.getItem('toefl_guest_uid') || (() => {
            const id = 'guest-' + Math.random().toString(36).substring(2, 9);
            localStorage.setItem('toefl_guest_uid', id);
            return id;
          })();
          const mockUser = {
            uid: guestUid,
            isAnonymous: true,
            email: null,
            displayName: null,
          } as unknown as User;
          setUser(mockUser);

          if (errStr.includes('token-service-api-has-not-been-used') || errStr.includes('securetoken.googleapis.com')) {
            setAuthError('Firebase Secure Token Service is initializing. The app is running smoothly in offline local storage mode.');
          } else {
            setAuthError('Firebase Anonymous Authentication is currently disabled. Running in offline local storage mode.');
          }
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && user && !displayName) {
      setShowNameModal(true);
    }
  }, [loading, user, displayName]);

  const setDisplayName = (name: string) => {
    const trimmed = name.trim();
    localStorage.setItem('toefl_display_name', trimmed);
    setDisplayNameState(trimmed);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (trimmed.length < 2 || trimmed.length > 30) {
      setNameError('Display name must be between 2 and 30 characters.');
      return;
    }
    setDisplayName(trimmed);
    setShowNameModal(false);
    setNameError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-teal-700 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Connecting to TOEFL Prep Studio...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, displayName, setDisplayName, authError }}>
      {authError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between gap-3 relative z-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{authError}</span>
          </div>
          <button
            onClick={() => setAuthError(null)}
            className="text-amber-700 hover:text-amber-900 p-1 rounded-md"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {children}

      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                <UserIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Choose Display Name</h3>
                <p className="text-xs text-slate-500">Used as the author label for shared questions</p>
              </div>
            </div>

            <form onSubmit={handleNameSubmit} className="space-y-4">
              <div>
                <label htmlFor="display-name-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Your Name or Nickname
                </label>
                <input
                  id="display-name-input"
                  type="text"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="e.g., Alex W., TOEFLScholar"
                  maxLength={30}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden"
                  autoFocus
                />
                <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1">
                  <span>2 to 30 characters</span>
                  <span>{nameInput.trim().length}/30</span>
                </div>
                {nameError && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{nameError}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors shadow-xs"
              >
                Continue to Practice
              </button>
            </form>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};
