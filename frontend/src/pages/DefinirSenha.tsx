import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import type { LoginResponse } from '../types';

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 pr-10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-600 placeholder-gray-600"
          required
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Letra maiúscula', ok: /[A-Z]/.test(password) },
    { label: 'Letra minúscula', ok: /[a-z]/.test(password) },
    { label: 'Número', ok: /\d/.test(password) },
  ];
  if (!password) return null;
  return (
    <ul className="space-y-1 mt-2">
      {checks.map((c) => (
        <li key={c.label} className={`flex items-center gap-2 text-xs ${c.ok ? 'text-emerald-400' : 'text-gray-500'}`}>
          <CheckCircle2 size={12} className={c.ok ? 'text-emerald-400' : 'text-gray-600'} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

export default function DefinirSenha() {
  const navigate = useNavigate();
  const { token, setAuth } = useAuthStore();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (newPassword.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.patch<LoginResponse>('/auth/change-password', {
        new_password: newPassword,
        confirm_password: confirmPassword,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAuth(data.access_token, data.user);
      navigate('/acoes');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Erro ao definir senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-600/15 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
            <KeyRound size={22} className="text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Defina sua senha</h1>
          <p className="text-gray-400 text-sm mt-1.5">
            É o seu primeiro acesso. Crie uma senha pessoal para continuar.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 rounded-xl p-8 space-y-5 border border-gray-800"
        >
          <PasswordInput
            label="Nova senha"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="mínimo 8 caracteres"
          />

          <PasswordStrength password={newPassword} />

          <PasswordInput
            label="Confirmar senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />

          {error && (
            <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Salvando...' : 'Definir senha e entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
