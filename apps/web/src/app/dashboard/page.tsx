/**
 * Zenith AI OS — Control Center Dashboard
 * Main operator dashboard: system health, AI OS score, recent activity,
 * module status cards, and quick actions.
 */

'use client';

import { useState, useEffect } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ModuleCard {
  id: string;
  name: string;
  score: number;
  status: 'operational' | 'degraded' | 'offline';
  icon: string;
  activeRuns: number;
  lastEventAt: string;
}

interface RecentEvent {
  id: string;
  type: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────

const MODULES: ModuleCard[] = [
  { id: 'identity', name: 'Identity & Context', score: 78, status: 'operational', icon: '◈', activeRuns: 12, lastEventAt: '2m ago' },
  { id: 'memory', name: 'Memory Fabric', score: 65, status: 'operational', icon: '◎', activeRuns: 5, lastEventAt: '30s ago' },
  { id: 'agents', name: 'Agent Orchestration', score: 72, status: 'operational', icon: '◇', activeRuns: 8, lastEventAt: '5s ago' },
  { id: 'tools', name: 'Tool / Action Bus', score: 68, status: 'operational', icon: '⬡', activeRuns: 15, lastEventAt: '1m ago' },
  { id: 'workflows', name: 'Workflow Engine', score: 55, status: 'degraded', icon: '↺', activeRuns: 3, lastEventAt: '10m ago' },
  { id: 'knowledge', name: 'Knowledge Retrieval', score: 60, status: 'operational', icon: '◉', activeRuns: 7, lastEventAt: '3m ago' },
  { id: 'policy', name: 'Policy Engine', score: 70, status: 'operational', icon: '⬟', activeRuns: 0, lastEventAt: '8m ago' },
  { id: 'security', name: 'Security & Trust', score: 82, status: 'operational', icon: '⊕', activeRuns: 2, lastEventAt: '45s ago' },
  { id: 'observability', name: 'Observability', score: 48, status: 'degraded', icon: '⋈', activeRuns: 1, lastEventAt: '15m ago' },
  { id: 'plugins', name: 'Extensibility', score: 30, status: 'operational', icon: '⬢', activeRuns: 0, lastEventAt: '1h ago' },
  { id: 'audit', name: 'Audit Engine', score: 62, status: 'operational', icon: '⊞', activeRuns: 1, lastEventAt: '2h ago' },
  { id: 'deployment', name: 'Deployment', score: 55, status: 'operational', icon: '⊙', activeRuns: 0, lastEventAt: '5h ago' },
];

const EVENTS: RecentEvent[] = [
  { id: '1', type: 'AGENT_RUN', description: 'Orchestrator agent completed lead intake workflow', severity: 'success', timestamp: '5s ago' },
  { id: '2', type: 'SECURITY', description: 'Prompt injection attempt detected and blocked', severity: 'error', timestamp: '2m ago' },
  { id: '3', type: 'TOOL_CALL', description: 'send_email tool executed — 3 messages delivered', severity: 'info', timestamp: '4m ago' },
  { id: '4', type: 'AUDIT', description: 'AI OS audit run completed — Score: 62.4/100', severity: 'info', timestamp: '2h ago' },
  { id: '5', type: 'WORKFLOW', description: 'Document review workflow paused — awaiting approval', severity: 'warning', timestamp: '10m ago' },
  { id: '6', type: 'MEMORY', description: 'Memory pruning complete — 247 expired items removed', severity: 'info', timestamp: '30m ago' },
];

// ─── Sub-components ────────────────────────────────────────────────────────

function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? '#00E5A0' : score >= 60 ? '#F5C842' : score >= 40 ? '#FF7B3A' : '#FF4D4D';

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1A1D24" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

function ModuleStatusCard({ module }: { module: ModuleCard }) {
  const statusColor = module.status === 'operational' ? '#00E5A0' : module.status === 'degraded' ? '#F5C842' : '#FF4D4D';

  return (
    <div className="group relative bg-[#111318] border border-[#1E2129] rounded-xl p-4 hover:border-[#2D3140] transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-2xl mb-1" style={{ color: statusColor }}>{module.icon}</div>
          <div className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">{module.name}</div>
        </div>
        <div className="relative">
          <ScoreRing score={module.score} size={56} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-white" style={{ color: module.score >= 70 ? '#00E5A0' : '#F5C842' }}>
              {module.score}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-[#6B7280]">
        <span style={{ color: statusColor }}>● {module.status}</span>
        <span>{module.activeRuns} active</span>
        <span>{module.lastEventAt}</span>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: RecentEvent }) {
  const colors = { info: '#6B9FFF', warning: '#F5C842', error: '#FF4D4D', success: '#00E5A0' };
  const color = colors[event.severity];
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#1A1D24] last:border-0">
      <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono text-[#6B7280]">{event.type}</span>
          <span className="text-xs text-[#4B5263]">{event.timestamp}</span>
        </div>
        <p className="text-sm text-[#C8C8C8] truncate">{event.description}</p>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [overallScore] = useState(62.4);
  const [maturityBand] = useState('Functional AI OS');
  const [certLevel] = useState('AIOS-L3');

  return (
    <div className="min-h-screen bg-[#0A0B0E] p-6 space-y-6">

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-6 h-6 bg-gradient-to-br from-[#00E5A0] to-[#0099FF] rounded" />
            <span className="text-lg font-bold tracking-tight">Zenith AI OS</span>
            <span className="text-xs bg-[#1A1D24] text-[#6B7280] px-2 py-0.5 rounded font-mono">v1.0.0</span>
          </div>
          <p className="text-xs text-[#4B5263]">Multi-Tenant AI Operating System · Control Center</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-xs bg-[#111318] border border-[#1E2129] text-[#C8C8C8] px-3 py-1.5 rounded hover:border-[#2D3140]">
            New Audit Run
          </button>
          <button className="text-xs bg-[#00E5A0] text-[#0A0B0E] px-3 py-1.5 rounded font-semibold hover:bg-[#00CC8E]">
            + New Workflow
          </button>
        </div>
      </div>

      {/* Score header */}
      <div className="grid grid-cols-4 gap-4">
        {/* AI OS Score */}
        <div className="col-span-1 bg-[#111318] border border-[#1E2129] rounded-xl p-5 flex items-center gap-5">
          <div className="relative">
            <ScoreRing score={overallScore} size={88} />
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-xl font-bold text-[#00E5A0]">{overallScore}</span>
              <span className="text-[9px] text-[#6B7280]">/ 100</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-[#6B7280] mb-1">AI OS Score</div>
            <div className="text-sm font-semibold text-white">{maturityBand}</div>
            <div className="text-xs font-mono text-[#00E5A0] mt-1">{certLevel} Certified</div>
          </div>
        </div>

        {/* Quick stats */}
        {[
          { label: 'Active Agents', value: '8', sub: '2 pending approval', color: '#6B9FFF' },
          { label: 'Workflow Runs', value: '143', sub: 'Today · 3 paused', color: '#F5C842' },
          { label: 'Security Events', value: '4', sub: '1 critical blocked', color: '#FF4D4D' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#111318] border border-[#1E2129] rounded-xl p-5">
            <div className="text-xs text-[#6B7280] mb-2">{stat.label}</div>
            <div className="text-2xl font-bold mb-1" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs text-[#4B5263]">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Module grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#C8C8C8]">Module Status</h2>
          <span className="text-xs text-[#4B5263] font-mono">12 modules · 2 degraded</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {MODULES.map((m) => <ModuleStatusCard key={m.id} module={m} />)}
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Recent events */}
        <div className="col-span-2 bg-[#111318] border border-[#1E2129] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#C8C8C8]">Recent Events</h3>
            <button className="text-xs text-[#6B7280] hover:text-white">View all →</button>
          </div>
          <div>
            {EVENTS.map((e) => <EventRow key={e.id} event={e} />)}
          </div>
        </div>

        {/* Certification panel */}
        <div className="bg-[#111318] border border-[#1E2129] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#C8C8C8] mb-4">Certification Status</h3>
          <div className="space-y-2">
            {['AIOS-L1', 'AIOS-L2', 'AIOS-L3', 'AIOS-L4', 'AIOS-L5'].map((level, i) => {
              const achieved = i <= 2;
              const current = i === 2;
              return (
                <div key={level} className={`flex items-center gap-3 p-2.5 rounded-lg ${current ? 'bg-[#0D1F17] border border-[#00E5A0]/20' : ''}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${achieved ? 'bg-[#00E5A0]' : 'bg-[#1E2129]'}`} />
                  <div className="flex-1">
                    <div className={`text-xs font-mono ${achieved ? 'text-[#E8E8E8]' : 'text-[#4B5263]'}`}>{level}</div>
                    <div className="text-[10px] text-[#4B5263]">
                      {i === 0 ? 'AI Enabled' : i === 1 ? 'Workflow AI Platform' : i === 2 ? 'Operational AI OS' : i === 3 ? 'Enterprise AI OS' : 'Open Standard Ref'}
                    </div>
                  </div>
                  {current && <span className="text-[10px] text-[#00E5A0] font-mono">ACTIVE</span>}
                </div>
              );
            })}
          </div>
          <button className="w-full mt-4 text-xs bg-[#0D1F17] border border-[#00E5A0]/20 text-[#00E5A0] py-2 rounded hover:bg-[#112B1F] transition-colors">
            Run New Audit →
          </button>
        </div>
      </div>

    </div>
  );
}
