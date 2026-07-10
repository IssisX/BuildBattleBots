import React, { useState, useMemo, useEffect } from 'react';
import { useGameStore, compileCustomBotStatsV2 } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { WorkshopCanvas } from './workshop/WorkshopCanvas';
import { PART_TEMPLATES, resolvePartTransformsV2 } from '../lib/partsCatalog';
import { generateAutoBot, AutoBuildArchetype } from '../lib/auto-builder';
import { validateCustomBot, computePhysicsSummary } from '../lib/validation';
import { BOT_PRESETS } from '../lib/presets';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

import { 
  Play, Shield, Zap, Activity, Wrench, 
  Settings, Crosshair, Cpu, Check, X,
  ChevronRight, PaintBucket, Lock, Unlock, 
  Trash2, RotateCcw, Sliders, Dna,
  Save, Copy, MonitorPlay, Rocket,
  Info, Database, UploadCloud, Plus, AlertTriangle, Cloud, User, History, Download, Sparkles, CloudOff, RefreshCw
} from 'lucide-react';
import { CustomBotConfig } from '../types';

export type FleetWorkbenchMode = 'overview' | 'customize' | 'build' | 'loadout' | 'operator' | 'deploy';

export const FleetWorkbench = () => {
  const [mode, setMode] = useState<FleetWorkbenchMode>('overview');
  
  const botConfig = useGameStore(s => s.botConfig);
  const customConfig = useGameStore(s => s.customBotConfig);
  const setBotConfig = useGameStore(s => s.setBotConfig);
  const setCustomConfig = useGameStore(s => s.setCustomBotConfig);
  const setPaintScheme = useGameStore(s => s.setPaintScheme);
  const paintScheme = useGameStore(s => s.paintScheme);
  
  const startBattle = useGameStore(s => s.startBattle);
  const savedCustomBots = useGameStore(s => s.savedCustomBots);
  const loadBotFromGarage = useGameStore(s => s.loadBotFromGarage);
  const saveCustomBot = useGameStore(s => s.saveCustomBot);
  const saveCurrentBotToGarage = useGameStore(s => s.saveCurrentBotToGarage);
  
  const user = useGameStore(s => s.user);
  const isSyncing = useGameStore(s => s.isSyncing);
  const currency = useGameStore(s => s.currency);
  const matchHistory = useGameStore(s => s.matchHistory);
  const exportFullBackup = useGameStore(s => s.exportFullBackup);
  const importFullBackup = useGameStore(s => s.importFullBackup);

  const [selectedSocketId, setSelectedSocketId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [backupStatus, setBackupStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const isCustom = botConfig.isCustom;

  // Derived build properties
  const resolvedTransforms = useMemo(() => resolvePartTransformsV2(customConfig.parts, customConfig.rootPartId), [customConfig]);
  const physics = useMemo(() => computePhysicsSummary(customConfig, resolvedTransforms), [customConfig, resolvedTransforms]);
  const { isValid, issues } = useMemo(() => validateCustomBot(customConfig, resolvedTransforms), [customConfig, resolvedTransforms]);

  // Handlers
  const handleSelectPreset = (preset: typeof BOT_PRESETS[0]) => {
    let archetype: AutoBuildArchetype = 'balanced';
    if (preset.weapon.type === 'spinner' || preset.weapon.type === 'drum') archetype = 'spinner';
    if (preset.weapon.type === 'hammer' || preset.weapon.type === 'crusher') archetype = 'armoredRammer';
    if (preset.weapon.type === 'flipper') archetype = 'speed';
    
    // Use a fixed seed for each preset so it always looks consistent
    const seed = preset.name.length * 1000 + preset.armor.weight;
    const newConfig = generateAutoBot({ archetype, seed, botName: preset.name, weaponType: preset.weapon.type });
    
    setCustomConfig(newConfig);
    setSelectedSocketId(null);
    setPaintScheme(preset.color);
    setBotConfig(compileCustomBotStatsV2(newConfig));
  };

  const handleSelectSaved = (botId: string) => {
    loadBotFromGarage(botId);
  };

  const handleAutoBuild = () => {
    const seed = Math.floor(Math.random() * 1000000);
    const newConfig = generateAutoBot({ archetype: 'balanced', seed, botName: `AutoBot-${seed.toString().slice(0,3)}` });
    setCustomConfig(newConfig);
    setSelectedSocketId(null);
    setBotConfig(compileCustomBotStatsV2(newConfig));
  };

  const handleSelectColor = (color: string) => {
    setPaintScheme(color);
    if (isCustom && customConfig?.parts) {
      const updatedParts = customConfig.parts.map(p => ({
        ...p,
        color: color
      }));
      const updatedConfig = {
        ...customConfig,
        parts: updatedParts
      };
      setCustomConfig(updatedConfig);
      setBotConfig({
        ...botConfig,
        parts: updatedParts as any,
        customConfig: updatedConfig
      });
    }
  };

  const handleDeploy = () => {
    if (isCustom && !isValid) return;
    if (isCustom) {
      setBotConfig(compileCustomBotStatsV2(customConfig));
    }
    startBattle();
  };

  // Render sub-panels
  const renderLeftPanel = () => {
    if (mode === 'overview') {
      return (
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-white/50 text-[10px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2"><Database size={12} /> Saved Blueprints</h2>
            <div className="space-y-2">
              {savedCustomBots.map((b, idx) => (
                <button 
                  key={b.id || `bot-${idx}`} 
                  onClick={() => handleSelectSaved(b.id)}
                  className={`w-full text-left p-3 border rounded transition-all ${botConfig.name === b.name ? 'bg-[#FF5500]/10 border-[#FF5500]' : 'bg-[#151515] border-[#333] hover:border-white/30'}`}
                >
                  <div className="text-white font-bold text-sm tracking-wide">{b.name}</div>
                  <div className="text-white/40 text-[9px] uppercase font-mono mt-1">{b.parts.length} Parts</div>
                </button>
              ))}
              <button 
                onClick={handleAutoBuild}
                className="w-full text-left p-3 border border-dashed border-[#FF5500]/50 rounded bg-[#FF5500]/5 hover:bg-[#FF5500]/10 transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Plus size={14} className="text-[#FF5500]" />
                <span className="text-[#FF5500] text-[10px] font-bold uppercase tracking-widest">Generate New</span>
              </button>
            </div>
          </div>
          <div>
            <h2 className="text-white/50 text-[10px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2"><Activity size={12} /> Factory Prefabs</h2>
            <div className="space-y-2">
              {BOT_PRESETS.map((p, idx) => (
                <button 
                  key={p.id || p.name || `preset-${idx}`} 
                  onClick={() => handleSelectPreset(p)}
                  className={`w-full text-left p-3 border rounded transition-all ${botConfig.name === p.name ? 'bg-white/10 border-white' : 'bg-[#151515] border-[#333] hover:border-white/30'}`}
                >
                  <div className="font-bold text-sm tracking-wide" style={{ color: p.color }}>{p.name}</div>
                  <div className="text-white/40 text-[9px] uppercase font-mono mt-1">{p.weapon.type}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }
    
    if (mode === 'customize') {
      return (
        <div className="p-6 space-y-6">
          <h2 className="text-white/50 text-[10px] font-bold tracking-widest uppercase flex items-center gap-2"><Settings size={12} /> Identity</h2>
          <div>
            <label className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Bot Name</label>
            <input 
              type="text" 
              value={botConfig.name}
              onChange={(e) => {
                 setBotConfig({ ...botConfig, name: e.target.value });
                 if (isCustom) setCustomConfig({ ...customConfig, name: e.target.value });
              }}
              className="w-full bg-[#1A1A1A] border border-[#333] p-3 text-white font-bold mt-1.5 rounded focus:border-[#FF5500] outline-none transition-all"
            />
          </div>
          <div>
             <h2 className="text-white/50 text-[10px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2"><PaintBucket size={12} /> Paint Scheme</h2>
             <div className="flex gap-2 flex-wrap bg-[#1A1A1A] p-3 rounded border border-[#333]">
                {["#2a2d32", "#e65100", "#1976d2", "#fbc02d", "#d32f2f", "#4caf50", "#9c27b0", "#ffffff"].map((c, idx) => (
                  <button 
                    key={c || idx}
                    onClick={() => {
                       handleSelectColor(c);
                    }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${paintScheme === c ? 'scale-110 border-white' : 'border-transparent hover:scale-105 shadow-sm'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
             </div>
          </div>
          {!isCustom && (
            <div className="mt-4 p-4 bg-[#FF5500]/5 border border-[#FF5500]/20 rounded">
               <p className="text-[#FF5500] text-[10px] leading-relaxed font-mono uppercase tracking-wide">Prefab chassis customization is limited to identity and paint.</p>
            </div>
          )}
        </div>
      );
    }

    if (mode === 'build') {
      if (!isCustom) {
        return (
          <div className="p-6 flex flex-col items-center justify-center h-full text-center">
             <AlertTriangle className="text-[#FF5500] mb-4 opacity-80" size={40} />
             <h3 className="text-white font-bold mb-2 uppercase tracking-wider text-sm">Builder Offline</h3>
             <p className="text-white/50 text-[11px] mb-6 leading-relaxed">Prefabricated bots cannot be structurally modified.</p>
             <button onClick={handleAutoBuild} className="px-5 py-2.5 border border-[#FF5500] bg-[#FF5500]/10 text-[#FF5500] font-bold uppercase tracking-widest text-[10px] rounded hover:bg-[#FF5500] hover:text-white transition-all">
               Generate Custom Chassis
             </button>
          </div>
        );
      }

      // Hierarchical builder palette for the unified UI
      const availableParts = PART_TEMPLATES.filter(p => p.type !== 'chassis');
      
      const partGroups = [
        { title: 'Weapons & Spinners', items: availableParts.filter(p => ['spinner', 'hammer', 'flipper', 'drum', 'crusher', 'saw', 'weapon'].includes(p.type)) },
        { title: 'Armor & Defense', items: availableParts.filter(p => ['wedge', 'armor', 'plating', 'shield', 'spike'].includes(p.type)) },
        { title: 'Locomotion & Tracks', items: availableParts.filter(p => ['wheel', 'tread', 'leg'].includes(p.type)) },
        { title: 'Sensors, Mounts & Adapters', items: availableParts.filter(p => !['spinner', 'hammer', 'flipper', 'drum', 'crusher', 'saw', 'weapon', 'wedge', 'armor', 'plating', 'shield', 'spike', 'wheel', 'tread', 'leg'].includes(p.type)) }
      ];

      // Deep socket type compatibility checker
      const isPartCompatibleWithSocket = (partType: string, socketType: string): boolean => {
        if (socketType === 'any') {
          return partType !== 'chassis';
        }
        if (socketType === 'wheel') {
          return ['wheel', 'tread', 'leg'].includes(partType) || partType === 'mount';
        }
        if (socketType === 'weapon') {
          return ['spinner', 'hammer', 'flipper', 'drum', 'crusher', 'saw', 'weapon'].includes(partType) || partType === 'mount';
        }
        if (socketType === 'armor') {
          return ['wedge', 'armor', 'plating', 'shield', 'spike'].includes(partType) || partType === 'mount';
        }
        return false;
      };

      // Extract details about the selected socket node
      const socketDetails = (() => {
        if (!selectedSocketId) return null;
        try {
          const [partId, socketId] = selectedSocketId.split(':');
          const part = customConfig.parts.find(p => p.instanceId === partId);
          if (!part) return null;
          const def = PART_TEMPLATES.find(t => t.templateId === part.definitionId);
          if (!def) return null;
          const socket = def.connectionPoints.find(cp => cp.id === socketId);
          if (!socket) return null;
          return {
            partId,
            partLabel: def.label,
            socketId,
            socketType: socket.socketType,
          };
        } catch (e) {
          return null;
        }
      })();

      // Extract details about the selected part
      const selectedPartData = customConfig.parts.find(p => p.instanceId === selectedPartId);
      const selectedPartDef = selectedPartData ? PART_TEMPLATES.find(t => t.templateId === selectedPartData.definitionId) : null;
      
      return (
        <div className="p-6 flex flex-col h-full overflow-hidden">
           <h2 className="text-white/50 text-[10px] font-bold tracking-widest uppercase mb-4 flex items-center gap-2"><Wrench size={12} /> Part Palette</h2>
           
           {selectedPartId ? (
              <div className="p-4 mb-4 bg-[#1976D2]/10 border border-[#1976D2]/30 rounded flex flex-col gap-2">
                 <div className="flex justify-between items-start">
                    <div>
                       <div className="text-[#1976D2] text-[10px] font-bold uppercase tracking-widest">Part Selected</div>
                       <div className="text-white font-bold text-xs mt-0.5">{selectedPartDef?.label || selectedPartId}</div>
                       {selectedPartDef && (
                          <div className="text-white/60 text-[9px] leading-normal mt-1 uppercase font-mono">{selectedPartDef.description}</div>
                       )}
                    </div>
                    <button onClick={() => setSelectedPartId(null)} className="text-white/40 hover:text-white p-1 bg-black/20 rounded">
                       <X size={12} />
                    </button>
                 </div>

                 {selectedPartDef && (
                    <div className="grid grid-cols-2 gap-2 my-2 border-t border-b border-white/5 py-2">
                       <div className="bg-black/20 p-1.5 rounded">
                          <div className="text-white/40 text-[8px] uppercase font-mono">Mass</div>
                          <div className="text-white text-xs font-bold font-mono">{selectedPartDef.mass} kg</div>
                       </div>
                       <div className="bg-black/20 p-1.5 rounded">
                          <div className="text-white/40 text-[8px] uppercase font-mono">Durability</div>
                          <div className="text-[#00E676] text-xs font-bold font-mono">100%</div>
                       </div>
                    </div>
                 )}

                 {selectedPartData && (
                    <div className="mt-2 border-t border-white/5 pt-3">
                       <div className="text-white/60 text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-1">
                          <PaintBucket size={11} className="text-[#FF5500]" /> Paint Part
                       </div>
                       <div className="flex gap-2 flex-wrap bg-black/45 p-2 rounded border border-white/5">
                          {["#2a2d32", "#e65100", "#1976d2", "#fbc02d", "#d32f2f", "#4caf50", "#9c27b0", "#ffffff"].map((c, idx) => (
                            <button 
                              key={c || idx}
                              onClick={() => {
                                 const updatedParts = customConfig.parts.map(p => {
                                    if (p.instanceId === selectedPartId) {
                                       return { ...p, color: c };
                                    }
                                    return p;
                                 });
                                 const updatedConfig = { ...customConfig, parts: updatedParts };
                                 setCustomConfig(updatedConfig);
                                 setBotConfig({
                                    ...botConfig,
                                    parts: updatedParts as any,
                                    customConfig: updatedConfig
                                 });
                              }}
                              className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedPartData.color === c ? 'scale-110 border-white' : 'border-transparent hover:scale-105 shadow-sm'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                       </div>
                    </div>
                 )}

                 {selectedPartId !== 'core_0' && (
                    <button 
                       onClick={() => {
                          const newParts = customConfig.parts.filter(p => !p.instanceId.startsWith(selectedPartId) && p.instanceId !== selectedPartId);
                          // We need to recursively delete parts attached to this one
                          const idsToDelete = new Set([selectedPartId]);
                          let changed = true;
                          while(changed) {
                             changed = false;
                             for (const p of customConfig.parts) {
                                if (p.parentInstanceId && idsToDelete.has(p.parentInstanceId) && !idsToDelete.has(p.instanceId)) {
                                   idsToDelete.add(p.instanceId);
                                   changed = true;
                                }
                             }
                          }
                          setCustomConfig({ ...customConfig, parts: customConfig.parts.filter(p => !idsToDelete.has(p.instanceId)) });
                          setSelectedPartId(null);
                       }}
                       className="mt-4 w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 rounded text-[10px] uppercase font-bold transition-all"
                    >
                       <Trash2 size={12} /> Remove Part
                    </button>
                 )}
                 {selectedPartId === 'core_0' && (
                    <div className="mt-2 text-white/40 text-[9px] font-mono uppercase text-center border border-white/5 p-1 rounded">Core chassis cannot be removed.</div>
                 )}
              </div>
           ) : !selectedSocketId ? (
              <div className="p-4 mb-4 bg-[#FF5500]/10 border border-[#FF5500]/30 rounded-lg text-center shadow-[0_0_15px_rgba(255,85,0,0.05)]">
                 <p className="text-[#FF5500] text-[10px] font-bold uppercase tracking-widest leading-relaxed flex items-center justify-center gap-1.5">
                   <span className="w-1.5 h-1.5 rounded-full bg-[#FF5500] animate-ping" />
                   STEP 1: Select a Socket node
                 </p>
                 <p className="text-white/60 text-[9.5px] mt-1.5 uppercase leading-normal">
                   Click any glowing colored node on the 3D model above to open and unlock compatible parts.
                 </p>
              </div>
           ) : (
              <div className="p-4 mb-4 bg-[#00E5FF]/10 border border-[#00E5FF]/40 rounded-lg flex flex-col gap-2 shadow-[0_0_15px_rgba(0,229,255,0.15)] animate-pulse">
                 <div className="flex justify-between items-start">
                    <div>
                       <div className="text-[#00E5FF] text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-ping" />
                          Socket Connected
                       </div>
                       <div className="text-white font-bold text-xs uppercase mt-1">
                          {socketDetails ? `${socketDetails.socketType.toUpperCase()} SOCKET` : 'Active Socket'}
                       </div>
                       <div className="text-white/40 text-[9px] font-mono mt-0.5 uppercase">
                          ID: {socketDetails ? socketDetails.socketId.replace(/_/g, ' ') : selectedSocketId}
                       </div>
                       {socketDetails && (
                         <div className="text-white/60 text-[9px] mt-1">
                            Mount Location: <span className="text-white font-semibold">{socketDetails.partLabel}</span>
                         </div>
                       )}
                    </div>
                    <button onClick={() => setSelectedSocketId(null)} className="text-white/40 hover:text-white p-1 bg-black/20 rounded border border-white/5">
                       <X size={12} />
                    </button>
                 </div>
                 <div className="mt-2 text-white/50 text-[9px] border-t border-white/10 pt-2 leading-relaxed uppercase">
                    👉 <span className="text-[#00E5FF] font-bold">Compatible parts are highlighted in green</span> below. Click any highlighted part to fit it!
                 </div>
              </div>
           )}

           <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
              {partGroups.filter(g => g.items.length > 0).map((group, groupIdx) => (
                 <div key={groupIdx}>
                    <h3 className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-[#222] pb-1 flex items-center justify-between">
                      <span>{group.title}</span>
                      <span className="text-white/30 text-[8px] font-mono font-normal">({group.items.length} items)</span>
                    </h3>
                    <div className="space-y-2.5">
                       {group.items.map((part, idx) => {
                          const isCompatible = socketDetails 
                             ? isPartCompatibleWithSocket(part.type, socketDetails.socketType)
                             : false;
                             
                          const isCardEnabled = !!selectedSocketId && isCompatible;

                          return (
                             <div 
                                key={part.templateId || `part-${idx}`} 
                                className={`p-3 border rounded-lg transition-all duration-200 relative overflow-hidden group ${
                                   !selectedSocketId 
                                      ? 'bg-[#141414] border-white/5 opacity-50 hover:opacity-85 cursor-not-allowed' 
                                      : isCompatible
                                         ? 'bg-[#00E676]/5 border-[#00E676]/30 hover:border-[#00E676] cursor-pointer shadow-[0_0_10px_rgba(0,230,118,0.05)] hover:shadow-[0_0_15px_rgba(0,230,118,0.15)] hover:bg-[#00E676]/10' 
                                         : 'bg-black/40 border-white/5 opacity-15 grayscale cursor-not-allowed'
                                }`}
                                onClick={() => {
                                   if (!isCardEnabled) return;
                                   const [partId, socketId] = selectedSocketId.split(':');
                                   const newParts = [...customConfig.parts];
                                   newParts.push({
                                      instanceId: `part_${Date.now()}`,
                                      definitionId: part.templateId,
                                      parentInstanceId: partId,
                                      parentSocketId: socketId,
                                      localPosition: [0,0,0],
                                      localRotation: [0,0,0],
                                      color: paintScheme || '#888'
                                   });
                                   setCustomConfig({ ...customConfig, parts: newParts });
                                   setSelectedSocketId(null);
                                }}
                             >
                                <div className="flex justify-between items-start gap-2">
                                   <div>
                                      <div className={`font-bold text-[11px] uppercase tracking-wide transition-colors ${
                                         isCompatible ? 'text-white group-hover:text-[#00E676]' : 'text-white/80'
                                      }`}>
                                         {part.label}
                                      </div>
                                      <div className="text-white/40 text-[8px] mt-0.5 uppercase font-mono tracking-wider">
                                         Type: {part.type} | Weight: {part.mass} KG
                                      </div>
                                      <div className="text-white/50 text-[9px] mt-1.5 leading-normal normal-case line-clamp-2 pr-12">
                                         {part.description}
                                      </div>
                                   </div>
                                   <div className="text-right flex-none">
                                      <div className="text-[#FBC02D] text-[10px] font-mono font-bold">{part.cost} CR</div>
                                   </div>
                                </div>

                                {/* Guidance Badges at bottom */}
                                <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2">
                                   <div className="flex items-center gap-1.5">
                                      {/* Required Socket badge */}
                                      <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[7.5px] font-mono text-white/50 uppercase tracking-widest">
                                         🔧 Fit Type: {
                                            ['spinner', 'hammer', 'flipper', 'drum', 'crusher', 'saw', 'weapon'].includes(part.type) ? 'Weapon' :
                                            ['wheel', 'tread', 'leg'].includes(part.type) ? 'Wheel' :
                                            ['wedge', 'armor', 'plating', 'shield', 'spike'].includes(part.type) ? 'Armor' : 'Any'
                                         }
                                      </span>
                                   </div>

                                   {/* Status badge */}
                                   <div>
                                      {!selectedSocketId ? (
                                         <span className="text-white/30 text-[7px] uppercase font-mono font-semibold">
                                            Select Socket to Mount
                                         </span>
                                      ) : isCompatible ? (
                                         <span className="text-[#00E676] text-[8px] uppercase font-mono font-extrabold flex items-center gap-1 animate-pulse bg-[#00E676]/10 border border-[#00E676]/30 px-1.5 py-0.5 rounded">
                                            ⚡ Ready to Fit
                                         </span>
                                      ) : (
                                         <span className="text-white/30 text-[7.5px] uppercase font-mono flex items-center gap-1 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded">
                                            <Lock size={8} /> Locked
                                         </span>
                                      )}
                                   </div>
                                </div>
                             </div>
                          );
                       })}
                    </div>
                 </div>
              ))}
           </div>
        </div>
      );
    }

    if (mode === 'loadout') {
      return (
        <div className="p-6 space-y-4">
           <h2 className="text-white/50 text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 mb-2"><Crosshair size={12} /> Combat Loadout</h2>
           <div className="p-4 bg-[#1A1A1A] border border-[#333] rounded">
              <div className="text-white/40 text-[9px] uppercase font-mono mb-1.5 tracking-widest">Primary Weapon</div>
              <div className="text-white font-bold capitalize text-sm tracking-wide">{botConfig.weapon.type}</div>
              <div className="text-[#FF5500] text-[10px] font-mono mt-2 tracking-wide">RPM: {botConfig.weapon.rpm} | DMG: {botConfig.weapon.damage}</div>
           </div>
           <div className="p-4 bg-[#1A1A1A] border border-[#333] rounded">
              <div className="text-white/40 text-[9px] uppercase font-mono mb-1.5 tracking-widest">Armor Plating</div>
              <div className="text-white font-bold capitalize text-sm tracking-wide">{botConfig.armor.type}</div>
              <div className="text-[#1976D2] text-[10px] font-mono mt-2 tracking-wide">INT: {botConfig.armor.integrity} | WGT: {botConfig.armor.weight}</div>
           </div>
           <div className="p-4 bg-[#1A1A1A] border border-[#333] rounded">
              <div className="text-white/40 text-[9px] uppercase font-mono mb-1.5 tracking-widest">Drive Motor</div>
              <div className="text-[#4CAF50] text-[10px] font-mono mt-2 tracking-wide">TRQ: {botConfig.motor.torque} | SPD: {botConfig.motor.maxSpeed}</div>
           </div>
        </div>
      );
    }

    if (mode === 'operator') {
      return (
        <div className="p-6 space-y-6 flex flex-col h-full overflow-y-auto">
           <h2 className="text-white/50 text-[10px] font-bold tracking-widest uppercase flex items-center gap-2"><User size={12} /> Operator Profile</h2>
           
           {/* Sync Station */}
           <div className="bg-[#1f1f1f] border border-[#FF5500]/30 rounded p-4 flex flex-col gap-3 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#FF5500]/10 to-transparent pointer-events-none rounded-full blur-xl" />
             <h4 className="font-mono text-[9px] font-bold tracking-widest text-[#FF5500] uppercase flex items-center justify-between border-b border-white/5 pb-2">
               <span className="flex items-center gap-1.5"><Cloud size={12} /> FIRESTORE SYNC</span>
               <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#FF5500]/10 font-normal">NOSQL</span>
             </h4>

             {!user ? (
               <div className="flex flex-col gap-3">
                 <p className="text-[9px] text-white/60 leading-relaxed font-sans mt-1">
                   Persist your custom blueprints and match telemetry directly to Cloud Firestore.
                 </p>
                 <button
                   onClick={async () => {
                     try { await signInWithPopup(auth, googleAuthProvider); } 
                     catch (e) { console.error("Sign-in error", e); }
                   }}
                   className="w-full bg-[#E65100] hover:bg-[#F57C00] text-white font-mono font-bold text-[9px] tracking-wider py-2.5 rounded border border-[#FF5500]/40 uppercase transition-all shadow-md flex items-center justify-center gap-2 mt-1"
                 >
                   <User size={12} /> SIGN IN WITH GOOGLE
                 </button>
               </div>
             ) : (
               <div className="flex flex-col gap-3 mt-1">
                 <div className="flex items-center gap-3 bg-[#121212] p-2 rounded border border-white/5">
                   {user.photoURL && <img src={user.photoURL} alt="Avatar" className="w-7 h-7 rounded-full border border-[#FF5500]/30" />}
                   <div className="flex flex-col min-w-0 flex-1">
                     <span className="font-bold text-white text-[10px] truncate leading-tight">{user.displayName || "Operator"}</span>
                     <span className="font-mono text-white/40 text-[8px] truncate leading-tight">{user.email}</span>
                   </div>
                   <button onClick={() => signOut(auth)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-1.5 rounded transition-colors"><Trash2 size={12} /></button>
                 </div>
               </div>
             )}
           </div>

           {/* Local Storage Actions */}
           <div className="bg-[#1f1f1f] border border-white/10 rounded p-4 flex flex-col gap-3">
             <h4 className="font-mono text-[9px] font-bold tracking-widest text-white/50 uppercase flex items-center gap-1.5 border-b border-white/5 pb-2">
               <Database size={12} /> Local Archives
             </h4>
             <div className="flex gap-2">
               <button
                 onClick={() => {
                   const dataStr = exportFullBackup();
                   const blob = new Blob([dataStr], { type: 'application/json' });
                   const url = URL.createObjectURL(blob);
                   const link = document.createElement('a');
                   link.href = url;
                   link.download = `battlebot-backup.json`;
                   link.click();
                 }}
                 className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-2 rounded text-[9px] font-mono font-bold uppercase transition-all flex items-center justify-center gap-1"
               >
                 <Download size={10} /> Backup
               </button>
             </div>
             <div className="flex gap-1.5 mt-1">
               <input type="text" placeholder="Paste JSON backup..." value={importText} onChange={(e) => setImportText(e.target.value)} className="flex-1 bg-[#121212] border border-white/15 px-2 py-1 rounded text-[9px] text-white focus:outline-none focus:border-[#E65100] font-mono" />
               <button
                 onClick={() => {
                   if (importFullBackup(importText)) {
                     setBackupStatus('success'); setImportText('');
                   } else {
                     setBackupStatus('error');
                   }
                   setTimeout(() => setBackupStatus('idle'), 2500);
                 }}
                 className="bg-[#E65100] hover:bg-[#F57C00] px-3 rounded text-[9px] font-mono font-bold uppercase text-white"
               >
                 Sync
               </button>
             </div>
           </div>

           {/* Battle Log History */}
           <div className="bg-[#1f1f1f] border border-white/10 rounded p-4 flex flex-col gap-3 flex-1 min-h-0">
             <h4 className="font-mono text-[9px] font-bold tracking-widest text-white/50 uppercase flex items-center gap-1.5 border-b border-white/5 pb-2">
               <History size={12} /> Battle Logs
             </h4>
             {matchHistory.length === 0 ? (
               <div className="text-center text-white/30 text-[9px] font-mono uppercase mt-4">Archive Empty</div>
             ) : (
               <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                 {matchHistory.map((m, idx) => (
                   <div key={m.id || `match-${idx}`} className="p-2 bg-[#121212] border border-white/5 rounded flex flex-col gap-1">
                     <div className="flex justify-between items-center text-[9px] font-mono">
                        <span className={`uppercase font-bold ${m.outcome === 'victory' ? 'text-green-400' : 'text-red-400'}`}>{m.outcome}</span>
                        <span className="text-white/40">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                     </div>
                     <div className="text-[10px] text-white/80">{m.playerBotName} vs {m.opponentName}</div>
                   </div>
                 ))}
               </div>
             )}
           </div>
        </div>
      );
    }

    if (mode === 'deploy') {
      return (
        <div className="p-6 space-y-6">
           <h2 className="text-white/50 text-[10px] font-bold tracking-widest uppercase flex items-center gap-2"><Rocket size={12} /> Launch Readiness</h2>
           <div className={`p-4 border rounded ${isCustom && !isValid ? 'bg-[#D32F2F]/5 border-[#D32F2F]/50' : 'bg-[#4CAF50]/5 border-[#4CAF50]/50'}`}>
              <div className={`font-bold uppercase text-[11px] tracking-wide ${isCustom && !isValid ? 'text-[#D32F2F]' : 'text-[#4CAF50]'}`}>
                 {isCustom && !isValid ? 'Systems Offline - Errors Detected' : 'All Systems Nominal - Ready for Drop'}
              </div>
           </div>
           {isCustom && issues.length > 0 && (
             <div className="space-y-2 mt-4 bg-[#1A1A1A] p-3 rounded border border-[#333]">
               {issues.map((iss, i) => (
                 <div key={i} className="text-[10px] text-[#D32F2F] font-mono flex items-start gap-2 leading-relaxed">
                    <span className="mt-0.5 opacity-50">!</span> {iss.message}
                 </div>
               ))}
             </div>
           )}
           <button 
             onClick={handleDeploy}
             disabled={isCustom && !isValid}
             className={`w-full py-4 mt-8 font-bold uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2 text-[11px] ${isCustom && !isValid ? 'bg-[#333] text-white/30 cursor-not-allowed border border-[#444]' : 'bg-[#E65100] text-white hover:bg-[#F57C00] shadow-[0_0_20px_rgba(230,81,0,0.3)] border border-[#FFB74D]'}`}
           >
             <Play size={14} fill="currentColor" /> Deploy to Arena
           </button>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="absolute inset-0 bg-[#0A0A0A] z-40 flex flex-col font-sans overflow-hidden">
      {/* Header & Tabs */}
      <div className="flex-none h-16 flex items-center justify-between px-6 border-b border-[#222] bg-[#111] relative z-20 shadow-xl">
         <div className="flex items-center gap-4">
           <h1 className="font-mono text-lg md:text-xl font-bold tracking-tighter text-white uppercase flex items-center gap-2">
             <Wrench className="text-[#FF5500]" /> FLEET WORKBENCH
           </h1>
           {/* Global Currency Display */}
           <div className="hidden sm:flex items-center gap-2 bg-[#1A1A1A] border border-[#333] px-3 py-1.5 rounded ml-4">
             <div className="w-2 h-2 rounded-full bg-[#FBC02D] animate-pulse" />
             <span className="font-mono font-bold text-[10px] tracking-widest text-[#FBC02D]">{currency} CR</span>
           </div>
         </div>
         <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {(['overview', 'customize', 'build', 'loadout', 'operator', 'deploy'] as FleetWorkbenchMode[]).map((m, idx) => (
              <button 
                key={m || idx}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded font-bold text-[9px] md:text-[10px] uppercase tracking-widest transition-all ${mode === m ? 'bg-[#FF5500] text-white shadow-[0_0_15px_rgba(255,85,0,0.3)]' : 'bg-transparent text-white/40 hover:text-white hover:bg-[#222]'}`}
              >
                 {m}
              </button>
            ))}
         </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
         {/* Left Context Panel */}
         <div className="w-72 md:w-80 bg-[#121212] border-r border-[#222] overflow-y-auto flex flex-col z-10 shadow-2xl shrink-0 custom-scrollbar relative">
            <AnimatePresence mode="wait">
               <motion.div
                 key={mode}
                 initial={{ opacity: 0, x: -10 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, x: 10 }}
                 transition={{ duration: 0.15 }}
                 className="absolute inset-0"
               >
                 {renderLeftPanel()}
               </motion.div>
            </AnimatePresence>
         </div>
         
         {/* Main Viewport */}
         <div className="flex-1 relative bg-gradient-to-br from-[#111] to-[#000]">
             <div className="absolute inset-0">
               {isCustom ? (
                 <WorkshopCanvas 
                   parts={customConfig.parts} 
                   selectedSocketId={selectedSocketId} 
                   onSelectSocket={(id) => { setSelectedSocketId(id); if(id) setSelectedPartId(null); }} 
                   onSelectPart={(id) => { setSelectedPartId(id); if(id) setSelectedSocketId(null); }}
                   resolvedTransforms={resolvedTransforms} 
                   showSockets={mode === 'build'}
                 />
               ) : (
                 <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none opacity-50">
                    <div className="w-80 h-80 border-2 border-dashed border-[#FF5500]/20 rounded-full flex items-center justify-center relative animate-spin-slow">
                       <div className="absolute inset-0 bg-[#FF5500] opacity-5 rounded-full blur-3xl" />
                       <div className="w-64 h-64 border border-[#FF5500]/10 rounded-full flex items-center justify-center relative">
                          <Activity className="text-[#FF5500]/30 absolute animate-pulse" size={48} />
                       </div>
                    </div>
                    <div className="absolute mt-12 flex flex-col items-center">
                       <h2 className="text-[#FF5500]/80 font-mono text-xl font-bold uppercase tracking-[0.5em]">{botConfig.name}</h2>
                       <p className="text-white/30 mt-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-3 py-1 rounded bg-white/5 backdrop-blur">Factory Configuration Active</p>
                    </div>
                 </div>
               )}
             </div>
             
             {/* Bottom Action Rail */}
             <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center pointer-events-none z-20">
                <div className="bg-[#111]/95 backdrop-blur-md border border-[#333] rounded p-2 flex gap-2 pointer-events-auto shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
                   <button onClick={() => saveCustomBot(botConfig.name)} className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#222] border border-[#333] hover:border-[#4CAF50]/50 text-white/70 hover:text-white rounded transition-all flex items-center gap-2 group">
                      <Save size={14} className="group-hover:text-[#4CAF50]" />
                      <span className="text-[9px] font-bold uppercase tracking-widest">Save</span>
                   </button>
                   <button onClick={handleAutoBuild} className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#222] border border-[#333] hover:border-[#1976D2]/50 text-white/70 hover:text-white rounded transition-all flex items-center gap-2 group">
                      <Dna size={14} className="group-hover:text-[#1976D2]" />
                      <span className="text-[9px] font-bold uppercase tracking-widest">Auto Build</span>
                   </button>
                   <div className="w-px h-6 bg-[#333] mx-2 self-center" />
                   <button onClick={handleDeploy} disabled={isCustom && !isValid} className={`px-8 py-2 rounded font-bold uppercase tracking-widest transition-all flex items-center gap-2 text-[10px] border ${isCustom && !isValid ? 'bg-[#222] border-[#444] text-white/30 cursor-not-allowed' : 'bg-[#E65100] border-[#FFB74D] text-white hover:bg-[#F57C00] hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(230,81,0,0.4)]'}`}>
                      <Rocket size={14} />
                      Deploy
                   </button>
                </div>
             </div>
             
             {/* Right Validation/Stats Overlay */}
             <div className="absolute top-6 right-6 w-64 pointer-events-none space-y-4 z-20">
                <div className="bg-[#111]/90 backdrop-blur-md border border-[#333] rounded p-4 shadow-2xl pointer-events-auto">
                   <h3 className="text-white/40 text-[9px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2"><Activity size={10} /> Live Telemetry</h3>
                   <div className="space-y-2.5">
                     <div className="flex justify-between items-center text-[10px]">
                        <span className="text-white/40 uppercase font-mono tracking-wider">Mass</span>
                        <span className="text-white font-mono font-bold bg-[#222] px-2 py-0.5 rounded border border-[#333]">{isCustom ? Math.round(physics.totalMass) : botConfig.armor.weight} kg</span>
                     </div>
                     <div className="flex justify-between items-center text-[10px]">
                        <span className="text-white/40 uppercase font-mono tracking-wider">Parts</span>
                        <span className="text-white font-mono font-bold bg-[#222] px-2 py-0.5 rounded border border-[#333]">{isCustom ? customConfig.parts.length : 1}</span>
                     </div>
                     <div className="flex justify-between items-center text-[10px]">
                        <span className="text-white/40 uppercase font-mono tracking-wider">Power</span>
                        <span className="text-[#FF5500] font-mono font-bold bg-[#FF5500]/10 px-2 py-0.5 rounded border border-[#FF5500]/30">{botConfig.weapon.damage}</span>
                     </div>
                   </div>
                </div>
             </div>
         </div>
      </div>
    </div>
  );
};
