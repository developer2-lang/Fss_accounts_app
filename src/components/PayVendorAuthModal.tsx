import React, { FormEvent, useState } from 'react';
import { SupabaseService } from '../lib/supabase';

export const PAY_VENDOR_AUTH_EMAIL = 'developer2@iuova.in';

interface PayVendorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PayVendorAuthModal: React.FC<PayVendorAuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [email, setEmail] = useState(PAY_VENDOR_AUTH_EMAIL);
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await SupabaseService.signInPayVendor(email.trim(), password);
      setPassword('');
      onSuccess();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not sign in to Supabase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="drawer-ov"
      onClick={() => !isSubmitting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-vendor-auth-title"
      style={{ zIndex: 1100 }}
    >
      <div className="modal" style={{ maxWidth: '440px', width: '92%' }} onClick={event => event.stopPropagation()}>
        <div className="modal-h" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 id="pay-vendor-auth-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              Sign in to save vendor payments
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>
              Use your authorized Supabase account. Your password is sent only to Supabase Auth.
            </div>
          </div>
          <button type="button" className="icon-btn xs" onClick={onClose} aria-label="Close sign-in" disabled={isSubmitting}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-b stack">
            {errorMessage && (
              <div className="notice" role="alert" style={{ background: 'var(--out-soft)', borderColor: '#EBC9C0', color: 'var(--out)' }}>
                {errorMessage}
              </div>
            )}
            <div className="field">
              <label htmlFor="pay-vendor-auth-email">Email</label>
              <input
                id="pay-vendor-auth-email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="field">
              <label htmlFor="pay-vendor-auth-password">Password</label>
              <input
                id="pay-vendor-auth-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="modal-f" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn btn-navy" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
