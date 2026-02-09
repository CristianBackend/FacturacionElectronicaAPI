import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getApiKey } from './lib/api';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import CompaniesPage from './pages/CompaniesPage';
import CompanyDetailPage from './pages/CompanyDetailPage';
import BuyersPage from './pages/BuyersPage';
import SequencesPage from './pages/SequencesPage';
import CertificatesPage from './pages/CertificatesPage';
import ApiKeysPage from './pages/ApiKeysPage';
import WebhooksPage from './pages/WebhooksPage';
import ContingencyPage from './pages/ContingencyPage';

export default function App() {
  const [isAuth, setIsAuth] = useState(!!getApiKey());

  useEffect(() => {
    setIsAuth(!!getApiKey());
  }, []);

  if (!isAuth) {
    return <LoginPage onLogin={() => setIsAuth(true)} />;
  }

  return (
    <Layout onLogout={() => setIsAuth(false)}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/companies/:id" element={<CompanyDetailPage />} />
        <Route path="/buyers" element={<BuyersPage />} />
        <Route path="/sequences" element={<SequencesPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/webhooks" element={<WebhooksPage />} />
        <Route path="/contingency" element={<ContingencyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
