import React from 'react';
import { BotState } from '../types';
import { cn } from '../lib/utils';
import { Shield, Zap, Flame, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../store';

const StatRing = ({ 
  value, 
  max, 
  color, 
  icon: Icon, 
  label 
}: { 
  value: number; 
  max: number; 
  color: string; 
  icon: any; 
  label: string 
}) => {
  const percentage = (value / max) * 100;
  const strokeDasharray = `${percentage} 100`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 w-full h-full -rotate-90">
          <path
            className="text-white/10"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <motion.path
            initial={{ strokeDasharray: "0 100" }}
            animate={{ strokeDasharray }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={color}
            strokeWidth="3"
          />
        </svg>
        <div className="z-10 flex flex-col items-center justify-center">
          <Icon size={16} className={cn("mb-0.5")} style={{ color }} />
          <span className="text-xs font-mono font-bold leading-none">{value}%</span>
        </div>
      </div>
      <span className="text-[10px] font-mono tracking-widest uppercase text-white/50">{label}</span>
    </div>
  );
};

export const HUD = ({ botState }: { botState: BotState }) => {
  const opponentState = useGameStore(s => s.opponentState);
  const opponentConfig = useGameStore(s => s.opponentConfig);
  const battleStatus = useGameStore(s => s.battleStatus);
  const playerDamageComponents = useGameStore(s => s.playerDamageComponents);
  const opponentDamageComponents = useGameStore(s => s.opponentDamageComponents);

  return (
    <>
      <div className="absolute top-0 left-0 w-full p-4 sm:p-6 pointer-events-none z-10 flex flex-col sm:flex-row justify-between items-start gap-4">
        {/* Player Bot Stats (Top Left) */}
        <div className="bg-[#121212]/95 border border-white/10 p-4 rounded-sm flex flex-col gap-3 pointer-events-auto w-full sm:w-auto sm:max-w-md">
          <div className="flex items-center gap-6">
            <div className="flex flex-col gap-1 pr-6 border-r border-white/10">
              <div className="flex items-center gap-2">
                <h1 className="font-sans font-bold text-xl uppercase tracking-wider">{botState.name}</h1>
                {botState.status === 'critical' && (
                  <span className="flex items-center gap-1 text-[10px] bg-[#D32F2F]/20 text-[#D32F2F] px-2 py-0.5 rounded-sm font-mono border border-[#D32F2F]/30">
                    <AlertTriangle size={10} /> CRITICAL
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-white/40 tracking-widest">ID: {botState.id} // SYS_ONLINE</span>
            </div>
            
            <div className="flex gap-4 sm:gap-6">
              <StatRing value={Math.round(botState.health)} max={100} color={botState.health > 20 ? "#4CAF50" : "#D32F2F"} icon={Shield} label="Integrity" />
              <StatRing value={Math.round(botState.energy)} max={100} color="#FBC02D" icon={Zap} label="Energy" />
              <StatRing value={Math.round(botState.heat)} max={100} color={botState.heat > 80 ? "#D32F2F" : "#FBC02D"} icon={Flame} label="Heat" />
            </div>
          </div>

          {/* Component Diagnostics Grid */}
          {playerDamageComponents && Object.keys(playerDamageComponents).length > 0 && (
            <div className="flex flex-col gap-2 mt-1 pt-2.5 border-t border-white/10 w-full">
              <div className="flex justify-between items-center">
                <span className="font-mono text-[9px] text-white/50 tracking-wider uppercase">Chassis Diagnostics</span>
                <span className="font-mono text-[8px] text-[#00E5FF] animate-pulse">SYSTEM MONITOR ACTIVE</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {['front', 'rear', 'left', 'right'].map((zone) => {
                  const comp = playerDamageComponents[zone];
                  if (!comp) return null;
                  const integrityPct = Math.max(0, Math.round(comp.mountIntegrity * 100));
                  const isDetached = comp.detached;
                  
                  let stateLabel = isDetached ? 'DESTROYED' : `${integrityPct}%`;
                  let stateColor = 'text-green-400';
                  let barColor = 'bg-green-500';
                  if (isDetached) {
                    stateColor = 'text-red-500 font-bold';
                    barColor = 'bg-red-950/40';
                  } else if (comp.visualState === 'loose') {
                    stateColor = 'text-orange-500 animate-pulse font-bold';
                    barColor = 'bg-orange-500';
                    stateLabel = 'LOOSE';
                  } else if (comp.visualState === 'exposed') {
                    stateColor = 'text-orange-400';
                    barColor = 'bg-orange-400';
                  } else if (comp.visualState === 'dented') {
                    stateColor = 'text-yellow-500';
                    barColor = 'bg-yellow-500';
                  } else if (comp.visualState === 'scuffed') {
                    stateColor = 'text-yellow-300';
                    barColor = 'bg-yellow-300';
                  }

                  return (
                    <div key={zone} className="flex flex-col gap-1 bg-white/5 p-1.5 rounded-sm border border-white/5">
                      <div className="flex justify-between text-[9px] font-mono leading-none">
                        <span className="capitalize text-white/70">{zone}</span>
                        <span className={stateColor}>{stateLabel}</span>
                      </div>
                      <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                        <div className={cn("h-full transition-all duration-300", barColor)} style={{ width: `${isDetached ? 100 : integrityPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Opponent Mini HUD (Top Right) */}
        {battleStatus !== 'menu' && (
          <div className="bg-[#121212]/95 border border-[#D32F2F]/30 p-4 rounded-sm flex flex-col gap-2 items-end pointer-events-auto w-full sm:w-auto sm:max-w-xs">
            <span className="font-mono text-[10px] text-white/40 tracking-widest uppercase">Target Locked</span>
            <h2 className="font-sans font-bold text-lg text-[#D32F2F] uppercase tracking-wider">{opponentConfig.name}</h2>
            <div className="w-full sm:w-48 bg-[#1f1f1f] h-2 rounded-sm overflow-hidden mt-1 border border-[#D32F2F]/20">
              <motion.div 
                className="h-full bg-[#D32F2F]" 
                initial={{ width: "100%" }}
                animate={{ width: `${opponentState.health}%` }}
                transition={{ ease: "easeOut", duration: 0.3 }}
              />
            </div>
            <span className="font-mono text-[10px] text-[#D32F2F] font-bold">INTEGRITY: {Math.round(opponentState.health)}%</span>

            {/* Opponent Component Diagnostics Grid */}
            {opponentDamageComponents && Object.keys(opponentDamageComponents).length > 0 && (
              <div className="flex flex-col gap-2 mt-1 pt-2.5 border-t border-white/10 w-full text-right">
                <div className="flex justify-between items-center gap-4">
                  <span className="font-mono text-[8px] text-[#D32F2F] animate-pulse">STRUCTURAL RECON ACTIVE</span>
                  <span className="font-mono text-[9px] text-white/50 tracking-wider uppercase">Target Armor</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {['front', 'rear', 'left', 'right'].map((zone) => {
                    const comp = opponentDamageComponents[zone];
                    if (!comp) return null;
                    const integrityPct = Math.max(0, Math.round(comp.mountIntegrity * 100));
                    const isDetached = comp.detached;
                    
                    let stateLabel = isDetached ? 'DESTROYED' : `${integrityPct}%`;
                    let stateColor = 'text-green-400';
                    let barColor = 'bg-green-500';
                    if (isDetached) {
                      stateColor = 'text-red-500 font-bold';
                      barColor = 'bg-red-950/40';
                    } else if (comp.visualState === 'loose') {
                      stateColor = 'text-orange-500 animate-pulse font-bold';
                      barColor = 'bg-orange-500';
                      stateLabel = 'LOOSE';
                    } else if (comp.visualState === 'exposed') {
                      stateColor = 'text-orange-400';
                      barColor = 'bg-orange-400';
                    } else if (comp.visualState === 'dented') {
                      stateColor = 'text-yellow-500';
                      barColor = 'bg-yellow-500';
                    } else if (comp.visualState === 'scuffed') {
                      stateColor = 'text-yellow-300';
                      barColor = 'bg-yellow-300';
                    }

                    return (
                      <div key={zone} className="flex flex-col gap-1 bg-white/5 p-1.5 rounded-sm border border-white/5 text-left">
                        <div className="flex justify-between text-[9px] font-mono leading-none">
                          <span className="capitalize text-white/70">{zone}</span>
                          <span className={stateColor}>{stateLabel}</span>
                        </div>
                        <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                          <div className={cn("h-full transition-all duration-300", barColor)} style={{ width: `${isDetached ? 100 : integrityPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Removed Cinematic Replay */}
    </>
  );
};
