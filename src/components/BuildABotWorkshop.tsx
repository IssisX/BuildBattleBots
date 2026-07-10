
import React, { useState, useMemo, useEffect } from 'react';
import { useGameStore } from '../store';
import { PART_TEMPLATES, resolvePartTransformsV2, PartTemplate } from '../lib/partsCatalog';
import { CustomBotConfig, PlacedBotPart, SocketType } from '../types';
import { validateCustomBot, computePhysicsSummary } from '../lib/validation';
import { generateAutoBot, AutoBuildArchetype } from '../lib/auto-builder';
import { motion } from 'motion/react';
import { Wrench, Shield, Zap, Sparkles, Check, ChevronRight, Activity, Hammer, RotateCcw, AlertTriangle, Eye, Palette, Coins, Trash2, Dna } from 'lucide-react';
import { WorkshopCanvas } from './workshop/WorkshopCanvas';

const presetColors = [
  "#2a2d32", "#e65100", "#1976d2", "#fbc02d", 
  "#d32f2f", "#4caf50", "#9c27b0", "#ffffff"
];

export const BuildABotWorkshop = ({ onBack }: { onBack: () => void }) => {
  const customConfig = useGameStore(s => s.customBotConfig);
  const setCustomConfig = useGameStore(s => s.setCustomBotConfig);
  const saveCustomBot = useGameStore(s => s.saveCustomBot);
  const currency = useGameStore(s => s.currency);
  const addCurrency = useGameStore(s => s.addCurrency);

  const [selectedSocketId, setSelectedSocketId] = useState<string | null>(null);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [botName, setBotName] = useState<string>(customConfig.name || "Custom Gladiator");
  const [mirrorMode, setMirrorMode] = useState(false);
  const [showAutoBuild, setShowAutoBuild] = useState(false);
  const [diagnosticsMode, setDiagnosticsMode] = useState(false);
  const [autoBuildArchetype, setAutoBuildArchetype] = useState<AutoBuildArchetype>('balanced');
  const [lastManualConfig, setLastManualConfig] = useState<CustomBotConfig | null>(null);

  const handleAutoBuild = () => {
    // Save current as manual config if not already saved
    if (!lastManualConfig) {
      setLastManualConfig(customConfig);
    }
    const seed = Math.floor(Math.random() * 1000000);
    const newConfig = generateAutoBot({ archetype: autoBuildArchetype, seed, botName: `AutoBot ${autoBuildArchetype.substring(0,3).toUpperCase()}-${seed.toString().slice(0,3)}` });
    setCustomConfig(newConfig);
    setBotName(newConfig.name);
    setSelectedSocketId(null);
  };

  const handleRestoreManual = () => {
    if (lastManualConfig) {
      setCustomConfig(lastManualConfig);
      setBotName(lastManualConfig.name);
      setLastManualConfig(null);
    }
  };

  // Derive resolved transforms and physics
  const resolvedTransforms = useMemo(() => resolvePartTransformsV2(customConfig.parts, customConfig.rootPartId), [customConfig]);
  const physics = useMemo(() => computePhysicsSummary(customConfig, resolvedTransforms), [customConfig, resolvedTransforms]);
  const { isValid, issues } = useMemo(() => validateCustomBot(customConfig, resolvedTransforms), [customConfig, resolvedTransforms]);

  const corePart = useMemo(() => customConfig.parts.find(p => p.instanceId === customConfig.rootPartId), [customConfig]);
  const chassisOptions = PART_TEMPLATES.filter(t => t.type === 'chassis');


  const autoAddWheels = () => {
    const chassis = customConfig.parts.find(p => p.instanceId === customConfig.rootPartId);
    if (!chassis) return;
    const def = PART_TEMPLATES.find(t => t.templateId === chassis.definitionId);
    if (!def) return;
    
    const wheelSockets = def.connectionPoints.filter(cp => cp.socketType === 'wheel' || cp.id.includes('wheel'));
    const newParts = [...customConfig.parts];
    let cost = 0;
    
    wheelSockets.forEach(ws => {
      // Check if already occupied
      if (!newParts.some(p => p.parentInstanceId === chassis.instanceId && p.parentSocketId === ws.id)) {
         newParts.push({
            instanceId: 'auto_wheel_' + ws.id + Date.now(),
            definitionId: 'wheel_all_terrain',
            localPosition: [ws.x, ws.y, ws.z],
            localRotation: [0,0,0],
            parentInstanceId: chassis.instanceId,
            parentSocketId: ws.id,
            color: '#888'
         });
         cost += 100;
      }
    });
    
    // Ignore cost for auto-fix for now (or subtract if possible)
    setCustomConfig({ ...customConfig, parts: newParts });
  };

  const activeSocketInfo = useMemo(() => {
    if (!selectedSocketId || selectedSocketId === 'core_paint') return null;
    const [partId, socketId] = selectedSocketId.split(':');
    const parentPart = customConfig.parts.find(p => p.instanceId === partId);
    if (!parentPart) return null;
    
    // In phase 1, assume PartTemplate maps directly to BotPartDefinition
    const parentDef = PART_TEMPLATES.find(t => t.templateId === parentPart.definitionId);
    if (!parentDef) return null;
    
    const socket = parentDef.connectionPoints.find(cp => cp.id === socketId);
    if (!socket) return null;
    return { parentPart, socket, parentDef };
  }, [customConfig, selectedSocketId]);

  const handleInstallPart = (template: PartTemplate) => {
    if (!activeSocketInfo) return;
    const { parentPart, socket } = activeSocketInfo;
    
    let partsToKeep = [...customConfig.parts];
    let refunded = 0;

    const getChildrenRecursive = (pid: string): string[] => {
      const children = partsToKeep.filter(p => p.parentInstanceId === pid);
      let all = [...children.map(c => c.instanceId)];
      children.forEach(c => all = all.concat(getChildrenRecursive(c.instanceId)));
      return all;
    };

    const removeAttached = (sId: string) => {
      const attached = partsToKeep.find(p => p.parentInstanceId === parentPart.instanceId && p.parentSocketId === sId);
      if (attached) {
        const partsToRemove = [attached.instanceId, ...getChildrenRecursive(attached.instanceId)];
        partsToRemove.forEach(pid => {
          const p = partsToKeep.find(x => x.instanceId === pid);
          if (p) {
            const t = PART_TEMPLATES.find(x => x.templateId === p.definitionId);
            if (t) refunded += Math.floor(t.cost * 0.8);
          }
        });
        partsToKeep = partsToKeep.filter(p => !partsToRemove.includes(p.instanceId));
      }
    };

    // Remove anything currently on this socket
    removeAttached(socket.id);

    let cost = template.cost;

    let oppositeSocket: any = null;
    let oppositeSocketId: string | null = null;
    if (mirrorMode) {
      if (socket.id.includes('left')) oppositeSocketId = socket.id.replace('left', 'right');
      else if (socket.id.includes('right')) oppositeSocketId = socket.id.replace('right', 'left');
      
      if (oppositeSocketId) {
        const parentDef = PART_TEMPLATES.find(t => t.templateId === parentPart.definitionId);
        oppositeSocket = parentDef?.connectionPoints.find(cp => cp.id === oppositeSocketId);
        if (oppositeSocket) {
          removeAttached(oppositeSocketId);
          cost += template.cost;
        }
      }
    }

    if (currency + refunded < cost) return; // not enough money

    if (cost > 0) addCurrency(-cost);
    if (refunded > 0) addCurrency(refunded);

    const newParts = [...partsToKeep];

    const newPart: PlacedBotPart = {
      instanceId: 'part_' + Date.now() + Math.floor(Math.random()*1000),
      definitionId: template.templateId,
      localPosition: [socket.x, socket.y, socket.z],
      localRotation: [0, 0, 0],
      parentInstanceId: parentPart.instanceId,
      parentSocketId: socket.id,
      color: template.color
    };
    newParts.push(newPart);

    if (oppositeSocket) {
      const mirrorPart: PlacedBotPart = {
        instanceId: 'part_' + Date.now() + Math.floor(Math.random()*1000) + 1,
        definitionId: template.templateId,
        // Mirror position logic: negate x if we're mirroring across X axis (left/right)
        localPosition: [-socket.x, socket.y, socket.z],
        // Actually oppositeSocket might have its own x,y,z
        // Let's use oppositeSocket's coordinates
        localRotation: [0, 0, 0],
        parentInstanceId: parentPart.instanceId,
        parentSocketId: oppositeSocket.id,
        color: template.color
      };
      if (oppositeSocket.x !== undefined) {
         mirrorPart.localPosition = [oppositeSocket.x, oppositeSocket.y, oppositeSocket.z];
      }
      newParts.push(mirrorPart);
    }

    setCustomConfig({
      ...customConfig,
      parts: newParts
    });
  };
  const attachedPart = useMemo(() => {
    if (!activeSocketInfo) return null;
    return customConfig.parts.find(p => p.parentInstanceId === activeSocketInfo.parentPart.instanceId && p.parentSocketId === activeSocketInfo.socket.id) || null;
  }, [customConfig, activeSocketInfo]);

  const handleSelectChassis = (template: PartTemplate) => {
    setCustomConfig({
      ...customConfig,
      rootPartId: 'core_0',
      parts: [{
        instanceId: 'core_0',
        definitionId: template.templateId,
        localPosition: [0, 0, 0],
        localRotation: [0, 0, 0],
        color: template.color
      }]
    });
    setSelectedSocketId(null);
  };

  const compatibleTemplates = useMemo(() => {
    if (!activeSocketInfo) return [];
    const stype = activeSocketInfo.socket.socketType;
    let available = PART_TEMPLATES.filter(t => t.type === stype || stype === 'any' || (stype === 'armor' && t.type === 'wedge'));
    
    // Smart Snap Ranking: Prioritize structural frame/mounts over external armor
    available.sort((a, b) => {
      const getRank = (t) => {
        if (t.type === 'frame' || t.type === 'mount') return 3;
        if (t.type === 'weapon') return 2;
        if (t.type === 'wheel') return 2;
        if (t.type === 'armor' || t.type === 'wedge') return 1;
        return 0;
      };
      return getRank(b) - getRank(a);
    });
    return available;
  }, [activeSocketInfo]);

  const handleUninstallPart = () => {
    if (!attachedPart) return;
    let partsToKeep = [...customConfig.parts];
    let refunded = 0;

    const getChildrenRecursive = (pid: string): string[] => {
      const children = partsToKeep.filter(p => p.parentInstanceId === pid);
      let all = [...children.map(c => c.instanceId)];
      children.forEach(c => all = all.concat(getChildrenRecursive(c.instanceId)));
      return all;
    };

    const partsToRemove = [attachedPart.instanceId, ...getChildrenRecursive(attachedPart.instanceId)];
    partsToRemove.forEach(pid => {
      const p = partsToKeep.find(x => x.instanceId === pid);
      if (p) {
        const t = PART_TEMPLATES.find(x => x.templateId === p.definitionId);
        if (t) refunded += Math.floor(t.cost * 0.8);
      }
    });

    partsToKeep = partsToKeep.filter(p => !partsToRemove.includes(p.instanceId));
    if (refunded > 0) addCurrency(refunded);

    setCustomConfig({ ...customConfig, parts: partsToKeep });
  };

  const handlePaintCore = (color: string) => {
    setCustomConfig({
      ...customConfig,
      parts: customConfig.parts.map(p => 
        p.instanceId === customConfig.rootPartId ? { ...p, color } : p
      )
    });
  };

  const handlePaintPart = (color: string) => {
    if (!attachedPart) return;
    setCustomConfig({
      ...customConfig,
      parts: customConfig.parts.map(p => 
        p.instanceId === attachedPart.instanceId ? { ...p, color } : p
      )
    });
  };

  const handleSaveAndDeploy = () => {
    if (!isValid) return;
    setCustomConfig({ ...customConfig, name: botName });
    saveCustomBot(botName);
    onBack(); // Deploy back to arena
  };

  // Phase 1 Viewport Layout: Expand into available unused space
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-[#0A0A0A] z-40 flex flex-col font-sans overflow-hidden"
    >
      {/* Header */}
      <div className="flex-none p-4 md:p-6 bg-[#0A0A0A] border-b border-[#222] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => setDiagnosticsMode(!diagnosticsMode)} className={`px-3 py-1 font-mono text-[10px] rounded ${diagnosticsMode ? 'bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/50' : 'bg-black text-white/50 border border-white/10'}`}>DIAGNOSTICS</button>
          <button onClick={onBack}
            className="flex items-center justify-center p-2 rounded-sm bg-[#1A1A1A] border border-[#333] hover:border-white/40 text-white/70 hover:text-white transition-all cursor-pointer"
          >
            <ChevronRight className="rotate-180" size={16} />
          </button>
          <div>
            <h1 className="font-mono text-xl md:text-2xl font-bold tracking-tighter text-white uppercase flex items-center gap-2">
              <Wrench className="text-[#FF5500]" /> 
              BUILD-A-BOT <span className="font-sans font-light text-white/30 text-sm md:text-xl tracking-normal">PHASE 1</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[#FF5500]/10 text-[#FF5500] border border-[#FF5500]/30 rounded uppercase tracking-wider">
                EXPERIMENTAL WORKSHOP
              </span>
              <span className="font-sans text-xs text-white/40">Custom Vehicle Assembly</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 shrink-0 bg-[#121212] p-2 border border-[#222] rounded-sm">
          <div className="flex items-center gap-1.5 px-2">
            <Coins size={14} className="text-[#FBC02D]" />
            <span className="font-mono text-sm font-bold text-[#FBC02D]">{currency.toLocaleString()} CR</span>
          </div>
          <div className="w-px h-6 bg-[#333]"></div>
          <input 
            type="text" 
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            className="bg-black/50 border border-[#333] px-3 py-1.5 text-sm text-white font-mono uppercase tracking-wider outline-none focus:border-[#FF5500]/50 w-48 rounded-sm"
            placeholder="BOT DESIGNATION"
            maxLength={18}
          />
          <button 
            onClick={handleSaveAndDeploy}
            disabled={!isValid}
            className={`px-6 py-2 rounded-sm flex items-center gap-2 font-mono text-sm font-bold tracking-wider uppercase transition-all ${
              isValid 
                ? "bg-[#FF5500] hover:bg-[#FF7722] text-white cursor-pointer shadow-[0_0_15px_rgba(255,85,0,0.3)]"
                : "bg-[#222] border border-[#333] text-white/20 cursor-not-allowed"
            }`}
          >
            <Check size={16} /> 
            DEPLOY 
          </button>
        </div>
      </div>

      {/* Main Workspace Body - Takes up remaining height */}
      <div className="flex-1 relative overflow-hidden">
        {/* Full-bleed 3D Assembly Viewport in Background */}
        <div className="absolute inset-0 bg-[#050505] z-0">
           <WorkshopCanvas 
              parts={customConfig.parts} 
              selectedSocketId={selectedSocketId} 
              onSelectSocket={setSelectedSocketId} 
              onSelectPart={(instanceId) => {
                const part = customConfig.parts.find(p => p.instanceId === instanceId);
                if (part) {
                  if (part.parentInstanceId && part.parentSocketId) {
                    setSelectedSocketId(`${part.parentInstanceId}:${part.parentSocketId}`);
                  } else {
                    setSelectedSocketId('core_paint');
                  }
                }
              }}
              resolvedTransforms={resolvedTransforms}
            />
        </div>

        {/* LEFT PANEL: Floating Core stats & validation */}
        <div className={`absolute left-4 top-4 bottom-4 w-80 bg-black/85 border border-[#222] backdrop-blur-md rounded-sm shadow-2xl flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-[#333] z-10 transition-all duration-300 ease-in-out ${
          isLeftPanelCollapsed ? "-translate-x-[120%] opacity-0 pointer-events-none" : "translate-x-0 opacity-100"
        }`}>
          <div className="p-5 flex flex-col gap-5">
            {/* Validation Panel */}
            <div className="bg-[#121212]/90 border border-[#222] p-4 rounded-sm flex flex-col gap-3">
              <h3 className="font-mono text-[10px] font-bold tracking-widest text-white/50 uppercase flex items-center gap-1.5 border-b border-[#222] pb-2">
                <AlertTriangle size={12} className="text-[#FBC02D]" /> SYSTEM VALIDATION
              </h3>
              
              <div className="flex flex-col gap-2">
                {issues.map(issue => (
                  <div key={issue.id} className={`p-2 text-[10px] font-mono leading-relaxed rounded-sm border flex justify-between items-center ${issue.severity === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/30' : 'bg-yellow-950/20 text-yellow-500 border-yellow-900/30'}`}>
                    <span>• {issue.message}</span>
                    {issue.code === 'missing_locomotion' && (
                      <button onClick={autoAddWheels} className="px-2 py-1 bg-red-900/50 hover:bg-red-800/80 rounded border border-red-500/50 text-[9px] uppercase font-bold transition-colors">
                        Auto-Fix
                      </button>
                    )}
                  </div>
                ))}
                {issues.length === 0 && (
                  <div className="text-[10px] text-[#00E676] font-mono p-2 bg-emerald-950/20 border border-emerald-900/30 rounded-sm">
                    • CONFIGURATION OPTIMAL. READY TO DEPLOY.
                  </div>
                )}
              </div>
            </div>

            {/* Live Physics Stats */}
            <div className="bg-[#121212]/90 border border-[#222] p-4 rounded-sm flex flex-col gap-3">
              <h3 className="font-mono text-[10px] font-bold tracking-widest text-white/50 uppercase flex items-center gap-1.5 border-b border-[#222] pb-2">
                <Activity size={12} className="text-[#00E5FF]" /> LIVE KINETIC STATS
              </h3>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-white/40">Total Mass</span>
                  <span className="text-white">{physics.totalMass} kg</span>
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-white/40">CoM (Y)</span>
                  <span className="text-white">{physics.centerOfMass[1].toFixed(2)} m</span>
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-white/40">Stability Score</span>
                  <span className={physics.stabilityScore > 80 ? "text-[#00E676]" : "text-[#FBC02D]"}>{physics.stabilityScore.toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-white/40">Colliders</span>
                  <span className="text-white">{physics.colliderCount} active</span>
                </div>
              </div>
            </div>

            {/* Auto Build System */}
            <div className="bg-[#121212]/90 border border-[#222] p-4 rounded-sm flex flex-col gap-3">
              <h3 className="font-mono text-[10px] font-bold tracking-widest text-[#00E5FF] uppercase border-b border-[#222] pb-2 flex items-center gap-2">
                <Dna size={12} /> AUTO-BUILD GENERATOR
              </h3>
              
              <div className="flex flex-col gap-2">
                <p className="text-[9px] text-white/50 leading-relaxed font-sans mb-1">
                  Instantly construct a combat-ready vehicle utilizing available parts.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['balanced', 'armoredRammer', 'spinner', 'speed'] as AutoBuildArchetype[]).map(arch => (
                    <button
                      key={arch}
                      onClick={() => setAutoBuildArchetype(arch)}
                      className={`py-1.5 px-2 text-[9px] font-mono border rounded-sm uppercase transition-all ${
                        autoBuildArchetype === arch
                          ? "bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/50"
                          : "bg-[#181818] text-white/50 border-[#333] hover:border-white/20"
                      }`}
                    >
                      {arch === 'armoredRammer' ? 'Rammer' : arch}
                    </button>
                  ))}
                </div>
                
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAutoBuild}
                    className="flex-1 py-2 bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] font-mono text-[10px] font-bold tracking-wider uppercase rounded-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Hammer size={12} /> GENERATE BOT
                  </button>
                  
                  {lastManualConfig && (
                    <button
                      onClick={handleRestoreManual}
                      className="py-2 px-3 bg-[#222] hover:bg-[#333] border border-[#444] text-white/70 font-mono text-[10px] font-bold uppercase rounded-sm transition-colors"
                      title="Restore Manual Build"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Core chassis selection */}
            <div className="bg-[#121212]/90 border border-[#222] p-4 rounded-sm flex flex-col gap-3">
              <h3 className="font-mono text-[10px] font-bold tracking-widest text-white/50 uppercase border-b border-[#222] pb-2">
                1. SELECT BASE CHASSIS
              </h3>
              <div className="flex flex-col gap-2">
                {chassisOptions.map(chassis => {
                  const isActive = corePart?.definitionId === chassis.templateId;
                  return (
                    <button
                      key={chassis.templateId}
                      onClick={() => handleSelectChassis(chassis)}
                      className={`p-3 border rounded-sm flex flex-col items-start gap-1 transition-all text-left ${
                        isActive
                          ? "bg-[#FF5500]/10 border-[#FF5500]/50"
                          : "bg-[#181818] border-[#333] hover:border-white/20"
                      }`}
                    >
                      <div className="flex justify-between w-full items-center">
                        <span className="font-sans font-bold text-xs text-white uppercase">{chassis.label}</span>
                        {isActive && <Check size={14} className="text-[#FF5500]" />}
                      </div>
                      <span className="font-mono text-[9px] text-white/40 uppercase">Mass: {chassis.mass}kg • Slots: {chassis.connectionPoints.length}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* HUD Controls Overlay on 3D Viewport */}
        <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none z-20">
          <div className="pointer-events-auto flex items-center gap-2">
            <button 
              onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
              className="font-mono text-[9px] bg-black/60 hover:bg-black/95 text-white/70 px-2.5 py-1.5 border border-white/20 uppercase flex items-center gap-1 cursor-pointer transition-colors backdrop-blur-sm rounded-sm"
              title={isLeftPanelCollapsed ? "Show Stats & Selection Panel" : "Hide Stats & Selection Panel"}
            >
              {isLeftPanelCollapsed ? "→ SHOW STATS" : "← HIDE STATS"}
            </button>
            <h3 className="font-mono text-xs font-bold tracking-widest text-white/50 uppercase flex items-center gap-2 drop-shadow-md hidden md:flex font-mono">
              <Eye size={14} className="text-[#FF5500]" /> 2. Tactical Assembly Schematic
            </h3>
          </div>
          <div className="pointer-events-auto">
            {corePart && (
              <button 
                onClick={() => setSelectedSocketId('core_paint')}
                className="font-mono text-[9px] bg-black/60 hover:bg-black/90 text-white/70 px-3 py-1.5 border border-white/20 uppercase flex items-center gap-1 cursor-pointer transition-colors backdrop-blur-sm rounded-sm"
              >
                <Palette size={10} /> PAINT CORE
              </button>
            )}
          </div>
        </div>

        {/* Thin bottom control guide, replaces the large floating "awaiting socket" tooltip */}
        <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-1.5 pointer-events-none z-20">
          <div className="bg-black/75 border border-white/10 px-4 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-sm shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5500] animate-ping" />
            <span className="font-mono text-[9px] text-white/80 tracking-widest uppercase">
              {selectedSocketId 
                ? "Active Socket Loaded • Customize Hardware"
                : "Select a glowing node on the gladiator blueprint to install weapons & armor"}
            </span>
          </div>
          <p className="text-[9px] font-mono text-white/40 text-center leading-none uppercase tracking-wider drop-shadow-md">
            ▲ DRAG TO ROTATE • SCROLL TO ZOOM • CLICK GLOWING SOCKETS TO MOUNT
          </p>
        </div>

        {/* RIGHT PANEL: Floating Parts catalog & Module Configuration */}
        {selectedSocketId !== null && (
          <div className="absolute right-4 top-4 bottom-4 w-80 bg-black/85 border border-[#222] backdrop-blur-md rounded-sm shadow-2xl flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-[#333] z-10 animate-in slide-in-from-right duration-300">
            <div className="p-5 flex flex-col gap-5">
              <div className="flex justify-between items-center border-b border-[#222] pb-2">
                <h3 className="font-mono text-[10px] font-bold tracking-widest text-white/50 uppercase">
                    3. MODULE CONFIGURATION
                </h3>
                <button 
                  onClick={() => setSelectedSocketId(null)}
                  className="text-white/40 hover:text-white font-mono text-[9px] border border-white/10 hover:border-white/30 px-1.5 py-0.5 rounded uppercase cursor-pointer transition-colors"
                >
                  CLOSE [X]
                </button>
              </div>
              
              {selectedSocketId === 'core_paint' ? (
                <div className="bg-[#121212]/90 border border-[#222] p-4 rounded-sm space-y-4">
                  <div>
                    <h4 className="font-sans font-bold text-sm text-white uppercase">PAINT CORE PLATING</h4>
                    <p className="text-[11px] text-white/50 mt-1">Select a solid industrial finish for the main structural core.</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 bg-[#181818] p-3 border border-[#222] rounded-sm">
                    {presetColors.map(color => (
                      <button
                        key={color}
                        onClick={() => handlePaintCore(color)}
                        className={`h-8 rounded-sm border hover:scale-105 transition-transform ${
                          corePart?.color === color ? "border-white border-2" : "border-white/10"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setSelectedSocketId(null)}
                    className="w-full py-2 bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-white font-mono text-[10px] uppercase tracking-wider rounded-sm cursor-pointer"
                  >
                    CLOSE COLOR PALETTE
                  </button>
                </div>
              ) : activeSocketInfo?.socket ? (
                <div className="bg-[#121212]/90 border border-[#222] p-4 rounded-sm flex flex-col gap-4">
                  <div>
                    <span className="font-mono text-[8px] text-[#FF5500] font-bold tracking-widest uppercase font-mono">SOCKET DESCRIPTOR</span>
                    <h4 className="font-sans font-bold text-sm text-white uppercase mt-0.5">
                      {activeSocketInfo.socket.id.replace("_", " ")}
                    </h4>
                    <div className="flex items-center gap-1 text-[9px] text-white/40 mt-1 font-mono uppercase">
                      <span>REQUIRES TYPE:</span>
                      <span className="text-[#00E5FF] font-bold">{activeSocketInfo.socket.socketType}</span>
                    </div>
                  </div>

                  {attachedPart ? (
                    <div className="bg-[#181818]/90 border border-[#2c2d33] p-3 rounded-sm flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-mono text-[8px] text-[#00E676] font-bold uppercase tracking-wider">ATTACHED INTERLOCK</span>
                          <h5 className="font-sans font-bold text-xs text-white uppercase mt-0.5">
                            {PART_TEMPLATES.find(t => t.templateId === attachedPart.definitionId)?.label}
                          </h5>
                        </div>
                        <button 
                          onClick={handleUninstallPart}
                          className="p-1.5 bg-red-950/20 text-red-400 hover:text-red-300 hover:bg-red-900/30 border border-red-900/40 rounded-sm cursor-pointer"
                          title="Dismantle Part"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      
                      <div className="border-t border-[#222] pt-2 mt-1">
                        <span className="font-mono text-[8px] text-white/40 uppercase block mb-1">MODULE PAINT</span>
                        <div className="flex flex-wrap gap-1.5">
                          {presetColors.map(color => (
                            <button
                              key={color}
                              onClick={() => handlePaintPart(color)}
                              className={`w-5 h-5 rounded-sm border ${
                                attachedPart.color === color ? "border-white border-2" : "border-white/10 hover:border-white/30"
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#181818]/50 border border-dashed border-[#333] p-4 rounded-sm text-center">
                      <Wrench className="mx-auto text-white/20 mb-2" size={20} />
                      <p className="font-sans text-[10px] text-white/40 leading-relaxed">
                        This connector node is vacant. Select an industrial component to mount it.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t border-[#222] pt-4">
                    <span className="font-mono text-[9px] text-white/40 tracking-wider uppercase block">COMPATIBLE HARDWARE</span>
                    <div className="flex flex-col gap-2">
                      {compatibleTemplates.map((template) => {
                        const isInstalled = attachedPart?.definitionId === template.templateId;
                        const hasEnoughCr = currency >= template.cost;
                        
                        return (
                          <div 
                            key={template.templateId}
                            className={`p-3 border rounded-sm flex flex-col gap-2 ${
                              isInstalled ? "bg-[#1976D2]/10 border-[#1976D2]/40" : "bg-[#151515] border-[#222]"
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <span className="font-sans text-[11px] font-bold text-white uppercase">{template.label}</span>
                              {template.cost > 0 && (
                                <span className="font-mono text-[8px] text-[#FBC02D] font-bold">{template.cost} CR</span>
                              )}
                            </div>
                            <p className="text-[9px] text-white/40 leading-tight">{template.description}</p>
                            
                            <div className="mt-1 flex justify-end">
                              {isInstalled ? (
                                <span className="font-mono text-[8px] text-[#448AFF] uppercase font-bold">INSTALLED</span>
                              ) : (
                                <button
                                  disabled={!hasEnoughCr}
                                  onClick={() => handleInstallPart(template)}
                                  className={`px-3 py-1.5 rounded-sm font-mono font-bold text-[8px] uppercase ${
                                    hasEnoughCr
                                      ? "bg-[#FF5500] hover:bg-[#FF7722] text-white cursor-pointer"
                                      : "bg-[#222] border border-[#333] text-white/25 cursor-not-allowed"
                                  }`}
                                >
                                  MOUNT
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
