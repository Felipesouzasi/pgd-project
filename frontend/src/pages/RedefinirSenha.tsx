import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';

export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    if (password.length < 8)  { setError('A senha deve ter no mínimo 8 caracteres.'); return; }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: password });
      setDone(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Link inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <img src="/bg_pgd.jpg" alt="" className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: 'center 30%' }} />
      <div className="absolute inset-0 bg-black/40" />

      <div className="absolute top-5 left-6 z-20">
        <img src="/logo_adb.png" alt="Adubos Real" className="h-14 drop-shadow-lg"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="flex justify-start mb-4">
          <img src="/logo_pgd.png" alt="PGD" className="h-20 drop-shadow-xl"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>

        <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Senha redefinida!</h2>
                <p className="text-white/60 text-sm mt-2">Sua senha foi alterada com sucesso.</p>
              </div>
              <button onClick={() => navigate('/login')}
                className="w-full bg-green-500 hover:bg-green-400 text-white font-semibold py-3 rounded-xl text-sm transition-all">
                Ir para o login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-7 text-center">
                <h1 className="text-xl font-bold text-white tracking-tight">Nova senha</h1>
                <p className="text-white/60 text-sm mt-1">Escolha uma nova senha para sua conta</p>
              </div>

              {!token && (
                <p className="text-red-300 text-sm bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-2.5 mb-4">
                  Link inválido. Solicite um novo e-mail de recuperação.
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1.5 uppercase tracking-wider">Nova senha</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm
                               placeholder-white/30 outline-none focus:border-green-400/60 focus:bg-white/15 transition-all"
                    placeholder="mínimo 8 caracteres" autoFocus required disabled={!token} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1.5 uppercase tracking-wider">Confirmar senha</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm
                               placeholder-white/30 outline-none focus:border-green-400/60 focus:bg-white/15 transition-all"
                    placeholder="repita a senha" required disabled={!token} />
                </div>

                {error && (
                  <p className="text-red-300 text-sm bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-2.5">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading || !token}
                  className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed
                             text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-green-900/40">
                  {loading ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
