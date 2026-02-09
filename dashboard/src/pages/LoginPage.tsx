import { useState } from 'react';
import { setAuthToken, setApiKey, auth } from '../lib/api';
import { Zap, LogIn, Key, UserPlus, Eye, EyeOff, Copy, Check } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

type Tab = 'login' | 'key' | 'register';

export default function LoginPage({ onLogin }: Props) {
  const [tab, setTab] = useState<Tab>('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // API Key state
  const [key, setKey] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registerResult, setRegisterResult] = useState<any>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const switchTab = (t: Tab) => {
    setTab(t);
    setError('');
    setRegisterResult(null);
  };

  // ── Email/Password Login ──
  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) return;
    setLoading(true);
    setError('');
    try {
      const result = await auth.login(loginEmail.trim(), loginPassword);
      setAuthToken(result.token, 'jwt');
      onLogin();
    } catch (e: any) {
      setError(e.message || 'Email o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  // ── API Key Login ──
  const handleKeyLogin = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      setApiKey(key.trim());
      await auth.getMe();
      onLogin();
    } catch (e: any) {
      setError('API key inválida');
      setApiKey('');
    } finally {
      setLoading(false);
    }
  };

  // ── Register ──
  const handleRegister = async () => {
    if (!regName.trim() || !regEmail.trim() || !regPassword) return;
    if (regPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await auth.register(regName.trim(), regEmail.trim(), regPassword);
      setRegisterResult(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const loginAfterRegister = () => {
    setAuthToken(registerResult.apiKeys.test.key, 'apikey');
    onLogin();
  };

  const loginWithCredentials = () => {
    setLoginEmail(regEmail);
    setLoginPassword(regPassword);
    switchTab('login');
    // Auto-login
    setTimeout(async () => {
      try {
        setLoading(true);
        const result = await auth.login(regEmail.trim(), regPassword);
        setAuthToken(result.token, 'jwt');
        onLogin();
      } catch {
        setError('Error al iniciar sesión automáticamente');
      } finally {
        setLoading(false);
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-brand-700 px-6 py-8 text-center text-white">
          <Zap className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <h1 className="text-2xl font-bold">ECF API</h1>
          <p className="text-blue-200 text-sm mt-1">Facturación Electrónica para República Dominicana</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => switchTab('login')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${
              tab === 'login' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-500'
            }`}
          >
            <LogIn className="w-4 h-4" /> Entrar
          </button>
          <button
            onClick={() => switchTab('key')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${
              tab === 'key' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-500'
            }`}
          >
            <Key className="w-4 h-4" /> API Key
          </button>
          <button
            onClick={() => switchTab('register')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${
              tab === 'register' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-400 hover:text-gray-500'
            }`}
          >
            <UserPlus className="w-4 h-4" /> Registro
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* ── TAB: Email/Password Login ── */}
          {tab === 'login' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="admin@miempresa.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                onClick={handleLogin}
                disabled={loading || !loginEmail.trim() || !loginPassword}
                className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </button>
              <p className="text-center text-xs text-gray-400">
                ¿No tienes cuenta?{' '}
                <button onClick={() => switchTab('register')} className="text-brand-600 hover:underline">
                  Regístrate
                </button>
              </p>
            </div>
          )}

          {/* ── TAB: API Key ── */}
          {tab === 'key' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Usa una API key para acceso programático o si prefieres no usar email/contraseña.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKeyLogin()}
                  placeholder="frd_test_xxxxxxxxxxxx"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-mono"
                />
              </div>
              <button
                onClick={handleKeyLogin}
                disabled={loading || !key.trim()}
                className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Verificando...' : 'Entrar'}
              </button>
            </div>
          )}

          {/* ── TAB: Register ── */}
          {tab === 'register' && !registerResult && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Empresa</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Mi Empresa SRL"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="admin@miempresa.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                onClick={handleRegister}
                disabled={loading || !regName.trim() || !regEmail.trim() || !regPassword}
                className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Registrando...' : 'Crear cuenta'}
              </button>
              <p className="text-center text-xs text-gray-400">
                ¿Ya tienes cuenta?{' '}
                <button onClick={() => switchTab('login')} className="text-brand-600 hover:underline">
                  Inicia sesión
                </button>
              </p>
            </div>
          )}

          {/* ── Register Success ── */}
          {tab === 'register' && registerResult && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                ✅ Cuenta creada exitosamente
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase">API Keys (para integración)</p>

                {/* Test Key */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500">Test Key</span>
                    <button
                      onClick={() => copyToClipboard(registerResult.apiKeys.test.key, 'test')}
                      className="text-gray-400 hover:text-brand-600"
                    >
                      {copiedKey === 'test' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <code className="block text-xs break-all font-mono text-gray-700">
                    {registerResult.apiKeys.test.key}
                  </code>
                </div>

                {/* Live Key */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500">Live Key</span>
                    <button
                      onClick={() => copyToClipboard(registerResult.apiKeys.live.key, 'live')}
                      className="text-gray-400 hover:text-brand-600"
                    >
                      {copiedKey === 'live' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <code className="block text-xs break-all font-mono text-gray-700">
                    {registerResult.apiKeys.live.key}
                  </code>
                </div>

                <p className="text-xs text-amber-600">
                  ⚠️ Copia estas claves. Son para integración por API y no se mostrarán de nuevo.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={loginWithCredentials}
                  className="flex-1 bg-brand-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors"
                >
                  Entrar al dashboard
                </button>
                <button
                  onClick={loginAfterRegister}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  title="Entrar con API Key de test"
                >
                  <Key className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
