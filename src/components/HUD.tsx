import React, { useState } from 'react';
import { BotState } from '../types';
import { cn } from '../lib/utils';
import { Shield, Zap, Flame, AlertTriangle, ChevronDown, ChevronUp, Cpu, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../store';

export const HUD = ({ botState }: { botState: BotState }) => {
  const opponentState = useGameStore(s => s.opponentState);
  const opponentConfig = useGameStore(s => s.opponentConfig);
  const battleStatus = useGameStore(s => s.battleStatus);
  const playerDamageComponents = useGameStore(s => s.playerDamageComponents);
  const opponentDamageComponents = useGameStore(s => s.opponentDamageComponents);

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  if (battleStatus === 'menu') return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[95%] sm:w-[90%] max-w-4xl z-30 pointer-events-none flex flex-col items-center gap-2">
      {/* 1. Sleek Consolidated Floating Combat Banner */}
      <div className="w-full bg-black/75 backdrop-blur-md border border-white/10 px-4 sm:px-6 py-2.5 rounded-xl sm:rounded-full flex items-center justify-between pointer-events-auto shadow-2xl">
        
        {/* Left Segment: Player Bot */}
        <div className="flex-1 flex flex-col gap-1 pr-3 sm:pr-6">
          <div className="flex items-center gap-2">
            <h2 className="font-sans font-bold text-sm sm:text-base text-white uppercase tracking-wider truncate max-w-[100px] sm:max-w-none">
              {botState.name}
            </h2>
            {botState.status === 'critical' && (
              <span className="flex items-center gap-0.5 text-[8px] bg-red-600/30 text-red-400 px-1.5 py-0.5 rounded font-mono border border-red-500/30 animate-pulse">
                <AlertTriangle size={8} /> CRIT
              </span>
            )}
          </div>
          
          {/* Integrity progress bar */}
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden relative border border-white/5">
            <motion.div 
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400" 
              initial={{ width: "100%" }}
              animate={{ width: `${botState.health}%` }}
              transition={{ ease: "easeOut", duration: 0.4 }}
              style={{
                boxShadow: botState.health < 30 ? "0 0 10px rgba(239, 68, 68, 0.5)" : "0 0 10px rgba(16, 185, 129, 0.3)"
              }}
            />
          </div>
          
          {/* Micro status meters */}
          <div className="flex gap-3 text-[9px] font-mono text-white/50">
            <span className="flex items-center gap-0.5 text-green-400">
              <Shield size={10} /> {Math.round(botState.health)}%
            </span>
            <span className="flex items-center gap-0.5 text-yellow-400">
              <Zap size={10} /> {Math.round(botState.energy)}%
            </span>
            <span className="flex items-center gap-0.5 text-red-400">
              <Flame size={10} /> {Math.round(botState.heat)}%
            </span>
          </div>
        </div>

        {/* Center Segment: Dynamic Combat Core */}
        <div className="flex flex-col items-center justify-center px-2 sm:px-6 border-l border-r border-white/10">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-red-600/10 border border-red-500/30 flex items-center justify-center text-red-500 font-sans font-black text-xs tracking-wider animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.1)]">
            VS
          </div>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-[8px] sm:text-[9px] font-mono text-white/70 hover:text-white transition-all pointer-events-auto"
          >
            <Cpu size={10} className="text-[#00E5FF]" />
            <span>DIAGS</span>
            {showDiagnostics ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
          </button>
        </div>

        {/* Right Segment: Opponent Bot */}
        <div className="flex-1 flex flex-col gap-1 pl-3 sm:pl-6 text-right items-end">
          <div className="flex items-center gap-2 flex-row-reverse">
            <h2 className="font-sans font-bold text-sm sm:text-base text-white uppercase tracking-wider truncate max-w-[100px] sm:max-w-none">
              {opponentConfig.name}
            </h2>
            {opponentState.health < 30 && (
              <span className="flex items-center gap-0.5 text-[8px] bg-red-600/30 text-red-400 px-1.5 py-0.5 rounded font-mono border border-red-500/30 animate-pulse">
                <Target size={8} /> LKD
              </span>
            )}
          </div>
          
          {/* Integrity progress bar */}
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden relative border border-white/5">
            <motion.div 
              className="h-full bg-gradient-to-l from-red-600 to-orange-500" 
              initial={{ width: "100%" }}
              animate={{ width: `${opponentState.health}%` }}
              transition={{ ease: "easeOut", duration: 0.4 }}
              style={{
                boxShadow: "0 0 10px rgba(239, 68, 68, 0.4)"
              }}
            />
          </div>
          
          {/* Micro status meters */}
          <div className="flex gap-3 text-[9px] font-mono text-white/50">
            <span className="flex items-center gap-0.5 text-red-400">
              <Shield size={10} /> {Math.round(opponentState.health)}%
            </span>
          </div>
        </div>

      </div>

      {/* 2. Slide-Down Diagnostics Drawer */}
      <AnimatePresence>
        {showDiagnostics && (
          <motion.div
            initial={{ opacity: 0, y: -15, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -15, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-full overflow-hidden pointer-events-auto"
          >
            <div className="w-full bg-black/85 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row gap-4 shadow-2xl">
              
              {/* Player Damage Components */}
              {playerDamageComponents && Object.keys(playerDamageComponents).length > 0 && (
                <div className="flex-1 flex flex-col gap-2 bg-white/5 p-3 rounded-lg border border-white/5">
                  <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
                    <span className="font-mono text-[10px] text-[#00E5FF] font-bold tracking-wider uppercase">Player Armor Integrity</span>
                    <span className="font-mono text-[8px] text-white/40">CHASSIS_MONITOR</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['front', 'rear', 'left', 'right', 'top', 'core'].map((zone) => {
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
                        <div key={zone} className="flex flex-col gap-1 bg-white/5 p-1.5 rounded border border-white/5">
                          <div className="flex justify-between text-[10px] font-mono leading-none">
                            <span className="capitalize text-white/70">{zone}</span>
                            <span className={cn("font-bold", stateColor)}>{stateLabel}</span>
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

              {/* Opponent Damage Components */}
              {opponentDamageComponents && Object.keys(opponentDamageComponents).length > 0 && (
                <div className="flex-1 flex flex-col gap-2 bg-white/5 p-3 rounded-lg border border-white/5">
                  <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
                    <span className="font-mono text-[10px] text-red-400 font-bold tracking-wider uppercase">Opponent Armor Integrity</span>
                    <span className="font-mono text-[8px] text-white/40">SCAN_MONITOR</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['front', 'rear', 'left', 'right', 'top', 'core'].map((zone) => {
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
                        <div key={zone} className="flex flex-col gap-1 bg-white/5 p-1.5 rounded border border-white/5">
                          <div className="flex justify-between text-[10px] font-mono leading-none">
                            <span className="capitalize text-white/70">{zone}</span>
                            <span className={cn("font-bold", stateColor)}>{stateLabel}</span>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
