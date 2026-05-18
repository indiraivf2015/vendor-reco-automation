import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import VendorMaster from './pages/VendorMaster';
import Exceptions from './pages/Exceptions';
import Vendors from './pages/Vendors';
import Runs from './pages/Runs';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/ledger" element={<VendorMaster />} />
        <Route path="/exceptions" element={<Exceptions />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
