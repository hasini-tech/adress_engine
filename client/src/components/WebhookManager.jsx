// src/pages/AddressEngineImportUI.jsx
import React, { useState } from "react";
import {
  Database,
  Key,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  Globe,
  BarChart3,
} from "lucide-react";

const ADDRESS_ENGINE_URL = "http://localhost:5000";
const ADDRESS_ENGINE_API_KEY = "ae_live_your_address_engine_key";

export default function AddressEngineImportUI() {
  const [saasUrl, setSaasUrl] = useState("http://localhost:8000");
  const [saasApiKey, setSaasApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    customers: 0,
    imported: 0,
    scored: 0,
  });

  const addLog = (message, type = "info") => {
    setLogs((prev) => [
      ...prev,
      {
        message,
        type,
        time: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const handleImport = async () => {
    if (!saasApiKey) {
      alert("Please enter the SaaS API key");
      return;
    }

    setLoading(true);
    setLogs([]);

    try {
      // Step 1: Fetch external data
      addLog("Fetching data from external SaaS platform...");

      const exportRes = await fetch(`${saasUrl}/api/customers/export`, {
        headers: {
          Authorization: `Bearer ${saasApiKey}`,
          Accept: "application/json",
        },
      });

      if (!exportRes.ok) {
        throw new Error("Unable to fetch customer data");
      }

      const exportData = await exportRes.json();
      const customerCount = exportData.customers?.length || 0;

      setStats((prev) => ({
        ...prev,
        customers: customerCount,
      }));

      addLog(`${customerCount} customers fetched successfully`, "success");

      // Step 2: Import to Address Engine
      addLog("Importing data into Address Engine...");

      const importRes = await fetch(
        `${ADDRESS_ENGINE_URL}/api/v1/import/customers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ADDRESS_ENGINE_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(exportData),
        }
      );

      if (!importRes.ok) {
        throw new Error("Import failed");
      }

      addLog("Data imported successfully", "success");

      setStats((prev) => ({
        ...prev,
        imported: customerCount,
      }));

      // Step 3: Run scoring
      addLog("Running scoring engine...");

      const scoringRes = await fetch(
        `${ADDRESS_ENGINE_URL}/api/v1/scoring/run`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ADDRESS_ENGINE_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      if (!scoringRes.ok) {
        throw new Error("Scoring failed");
      }

      addLog("Scoring completed successfully", "success");

      setStats((prev) => ({
        ...prev,
        scored: customerCount,
      }));
    } catch (error) {
      addLog(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const logIcon = (type) => {
    switch (type) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Loader2 className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-sm border p-8 mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Address Engine Import Center
          </h1>
          <p className="text-slate-500 mt-2">
            Fetch historical customer data from another SaaS platform and score
            it inside Address Engine.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <StatCard
            icon={<Database className="w-6 h-6 text-blue-600" />}
            title="Customers Found"
            value={stats.customers}
          />
          <StatCard
            icon={<Download className="w-6 h-6 text-green-600" />}
            title="Imported"
            value={stats.imported}
          />
          <StatCard
            icon={<BarChart3 className="w-6 h-6 text-purple-600" />}
            title="Scored"
            value={stats.scored}
          />
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* Form */}
          <div className="bg-white rounded-3xl shadow-sm border p-8">
            <h2 className="text-xl font-semibold mb-6">Connect SaaS Platform</h2>

            <InputField
              icon={<Globe className="w-5 h-5 text-slate-400" />}
              label="SaaS Base URL"
              value={saasUrl}
              onChange={setSaasUrl}
              placeholder="http://localhost:8000"
            />

            <InputField
              icon={<Key className="w-5 h-5 text-slate-400" />}
              label="SaaS API Key"
              value={saasApiKey}
              onChange={setSaasApiKey}
              placeholder="Enter external SaaS API key"
            />

            <button
              onClick={handleImport}
              disabled={loading}
              className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-medium transition"
            >
              {loading ? "Importing..." : "Fetch & Score Data"}
            </button>
          </div>

          {/* Logs */}
          <div className="bg-white rounded-3xl shadow-sm border p-8">
            <h2 className="text-xl font-semibold mb-6">Activity Logs</h2>

            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {logs.length === 0 && (
                <p className="text-slate-400">No logs yet.</p>
              )}

              {logs.map((log, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 border-b pb-3"
                >
                  {logIcon(log.type)}
                  <div>
                    <p className="text-sm text-slate-800">{log.message}</p>
                    <p className="text-xs text-slate-400">{log.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value }) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border p-6">
      <div className="flex items-center justify-between">
        {icon}
        <span className="text-3xl font-bold text-slate-900">{value}</span>
      </div>
      <p className="text-slate-500 mt-3">{title}</p>
    </div>
  );
}

function InputField({ icon, label, value, onChange, placeholder }) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-slate-700 mb-2">
        {label}
      </label>
      <div className="flex items-center border rounded-xl px-4 py-3 bg-slate-50">
        {icon}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="ml-3 w-full bg-transparent outline-none"
        />
      </div>
    </div>
  );
}