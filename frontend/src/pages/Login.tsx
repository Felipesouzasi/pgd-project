import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import type { LoginResponse } from '../types';

type View = 'login' | 'forgot' | 'forgot-sent';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [view, setView]           = useState<View>('login');
  const [login, setLogin]         = useState('');
  const [password, setPassword]   = useState('');
  const [rememberMe, setRemember] = useState(false);
  const [forgotInput, setForgot]  = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', {
        login: login.trim().toLowerCase(),
        password,
      });
      setAuth(data.access_token, data.user);
      if (!rememberMe) localStorage.removeItem('pgd-auth');
      navigate(data.user.must_change_password ? '/definir-senha' : '/acoes');
    } catch {
      setError('Login ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { login: forgotInput.trim().toLowerCase() });
      setView('forgot-sent');
    } catch {
      setError('Erro ao enviar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Painel esquerdo — fundo ── */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        <img src="/bg_pgd.jpg" alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 30%' }} />
        <div className="absolute inset-0 bg-black/30" />

        {/* Logo PGD centralizada */}
        <div className="relative z-10 flex items-center justify-center w-full px-16 -mt-32">
          <img src="/logo_pgd.png" alt="PGD" className="h-28 drop-shadow-2xl"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>

        {/* Logo Adubos Real — canto inferior esquerdo */}
        <div className="absolute bottom-6 left-8 z-10">
          <img src="/logo_adb.png" alt="Adubos Real" className="h-14 opacity-85 drop-shadow-lg"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      </div>

      {/* ── Painel direito — formulário ── */}
      <div className="w-full lg:w-[420px] flex flex-col justify-center bg-[#0f1117] px-10 py-12 relative">

        {/* Logo mobile (só aparece em telas pequenas) */}
        <div className="lg:hidden flex justify-center mb-8">
          <img src="/logo_pgd.png" alt="PGD" className="h-16 drop-shadow-lg"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>

        {/* ── Login ── */}
        {view === 'login' && (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white">Bem-vindo</h1>
              <p className="text-white/40 text-sm mt-1">Acesse sua conta para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">Login</label>
                <input
                  type="text" value={login} onChange={e => setLogin(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                             placeholder-white/20 outline-none focus:border-green-500/50 focus:bg-white/8 transition-all"
                  placeholder="usuário ou e-mail" autoFocus required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">Senha</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                             placeholder-white/20 outline-none focus:border-green-500/50 focus:bg-white/8 transition-all"
                  placeholder="••••••••" required
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setRemember(v => !v)} className="flex items-center gap-2 group">
                  <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${rememberMe ? 'bg-green-500' : 'bg-white/15'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${rememberMe ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                  <span className="text-xs text-white/40 group-hover:text-white/70 transition-colors select-none">Lembrar de mim</span>
                </button>

                <button type="button" onClick={() => { setView('forgot'); setError(''); }}
                  className="text-xs text-white/40 hover:text-white/80 transition-colors underline underline-offset-2">
                  Esqueci minha senha
                </button>
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</p>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed
                           text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-green-900/30 mt-2">
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </>
        )}

        {/* ── Esqueci minha senha ── */}
        {view === 'forgot' && (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white">Recuperar senha</h1>
              <p className="text-white/40 text-sm mt-1">Informe seu login ou e-mail cadastrado</p>
            </div>

            <form onSubmit={handleForgot} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">Login ou e-mail</label>
                <input
                  type="text" value={forgotInput} onChange={e => setForgot(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                             placeholder-white/20 outline-none focus:border-green-500/50 focus:bg-white/8 transition-all"
                  placeholder="seu login ou e-mail" autoFocus required
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</p>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50
                           text-white font-semibold py-3 rounded-xl text-sm transition-all">
                {loading ? 'Enviando...' : 'Enviar link de redefinição'}
              </button>

              <button type="button" onClick={() => { setView('login'); setError(''); }}
                className="w-full text-white/40 hover:text-white/70 text-sm transition-colors py-1">
                ← Voltar ao login
              </button>
            </form>
          </>
        )}

        {/* ── E-mail enviado ── */}
        {view === 'forgot-sent' && (
          <div className="text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">E-mail enviado!</h2>
              <p className="text-white/40 text-sm mt-2 leading-relaxed">
                Se o login ou e-mail estiver cadastrado, você receberá um link para redefinir sua senha.
              </p>
            </div>
            <button onClick={() => { setView('login'); setForgot(''); }}
              className="w-full bg-white/8 hover:bg-white/12 text-white/70 hover:text-white font-medium py-3 rounded-xl text-sm transition-all">
              Voltar ao login
            </button>
          </div>
        )}

        {/* Rodapé */}
        <p className="absolute bottom-6 left-0 right-0 text-center text-xs text-white/20">
          © {new Date().getFullYear()} Adubos Real
        </p>
      </div>
    </div>
  );
}
