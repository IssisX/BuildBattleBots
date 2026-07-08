/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Arena3D } from './components/Arena3D';
import { HUD } from './components/HUD';
import { Telemetry } from './components/Telemetry';
import { Controls } from './components/Controls';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { TouchControls } from './components/TouchControls';
import { BuildABotWorkshop } from './components/BuildABotWorkshop';
import { initAudio } from './lib/audio';
import { useGameStore } from './store';
import { KeyboardControls } from '@react-three/drei';
import { Play, RotateCcw, Shield, Trophy, Skull, Coins, Zap, Activity, Info, User, Wrench, Trash2, History, Award, Sparkles, Download, Upload, Plus, LogOut, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

export default function App() {
  const botState = useGameStore(s => s.botState);
  const setBotState = useGameStore(s => s.setBotState);
  const botConfig = useGameStore(s => s.botConfig);
  const setBotConfig = useGameStore(s => s.setBotConfig);
  const paintScheme = useGameStore(s => s.paintScheme);
  const setPaintScheme = useGameStore(s => s.setPaintScheme);

  const battleStatus = useGameStore(s => s.battleStatus);
  const countdown = useGameStore(s => s.countdown);
  const winner = useGameStore(s => s.winner);
  const startBattle = useGameStore(s => s.startBattle);
  const resetBattle = useGameStore(s => s.resetBattle);
  const logs = useGameStore(s => s.logs);
  const currency = useGameStore(s => s.currency);

  const savedCustomBots = useGameStore(s => s.savedCustomBots);
  const careerStats = useGameStore(s => s.careerStats);
  const matchHistory = useGameStore(s => s.matchHistory);
  const saveCurrentBotToGarage = useGameStore(s => s.saveCurrentBotToGarage);
  const loadBotFromGarage = useGameStore(s => s.loadBotFromGarage);
  const deleteBotFromGarage = useGameStore(s => s.deleteBotFromGarage);
  const exportFullBackup = useGameStore(s => s.exportFullBackup);
  const importFullBackup = useGameStore(s => s.importFullBackup);

  const user = useGameStore(s => s.user);
  const setUser = useGameStore(s => s.setUser);
  const isSyncing = useGameStore(s => s.isSyncing);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isWorkshopOpen, setIsWorkshopOpen] = useState(false);

  const [menuTab, setMenuTab] = useState<'fleet' | 'garage' | 'profile'>('fleet');
  const [newSaveName, setNewSaveName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [backupStatus, setBackupStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Preset Configurations
  const botPresets = [
    {
      name: "Mk. I Striker",
      color: "#D32F2F",
      weapon: { type: "spinner" as const, rpm: 4200, damage: 65 },
      armor: { type: "titanium" as const, integrity: 90, weight: 120 },
      motor: { torque: 450, maxSpeed: 25 },
      description: "Fast-spinning kinetic weapon with highly responsive agile chassis."
    },
    {
      name: "Titan Heavy",
      color: "#FBC02D",
      weapon: { type: "hammer" as const, rpm: 1800, damage: 85 },
      armor: { type: "steel" as const, integrity: 100, weight: 180 },
      motor: { torque: 750, maxSpeed: 14 },
      description: "Devastating top-down impact hammer with heavy armored steel plating."
    },
    {
      name: "Viper Launcher",
      color: "#1976D2",
      weapon: { type: "flipper" as const, rpm: 1000, damage: 50 },
      armor: { type: "carbon-fiber" as const, integrity: 80, weight: 90 },
      motor: { torque: 500, maxSpeed: 32 },
      description: "High-velocity flipper system designed to overturn and launch opponents."
    },
    {
      name: "Beast Drum",
      color: "#FF5500",
      weapon: { type: "drum" as const, rpm: 5500, damage: 75 },
      armor: { type: "titanium" as const, integrity: 95, weight: 135 },
      motor: { torque: 550, maxSpeed: 20 },
      description: "Thick armored drum spinner that delivers massive continuous vertical impacts."
    },
    {
      name: "Iron Crab",
      color: "#8E24AA",
      weapon: { type: "crusher" as const, rpm: 800, damage: 100 },
      armor: { type: "steel" as const, integrity: 100, weight: 190 },
      motor: { torque: 800, maxSpeed: 12 },
      description: "Powerful hydraulic crusher capable of pinning and piercing thick armor plating."
    }
  ];

  // Firebase Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          setUser(currentUser, token);
        } catch (e) {
          console.error("Failed to fetch Firebase auth token", e);
          setUser(currentUser, null);
        }
      } else {
        setUser(null, null);
      }
    });
    return () => unsubscribe();
  }, [setUser]);

  // Dynamic status updates for active game state
  useEffect(() => {
    if (battleStatus !== 'battle') return;

    const interval = setInterval(() => {
      setBotState(prev => {
        let newHeat = prev.heat;
        let newEnergy = prev.energy;
        
        if (prev.weaponActive) {
          newHeat = Math.min(100, prev.heat + Math.random() * 4);
          newEnergy = Math.max(0, prev.energy - Math.random() * 2);
        } else {
          newHeat = Math.max(20, prev.heat - Math.random() * 3);
          newEnergy = Math.min(100, prev.energy + Math.random() * 1.5);
        }

        let newStatus = prev.status;
        if (newHeat > 85 || prev.health < 25) newStatus = 'critical';
        else if (newHeat > 60 || prev.health < 50) newStatus = 'warning';
        else newStatus = 'nominal';

        return {
          ...prev,
          heat: newHeat,
          energy: newEnergy,
          status: newStatus
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [battleStatus, setBotState]);

  const toggleWeapon = () => {
    const isContinuous = botConfig.weapon.type === 'spinner' || botConfig.weapon.type === 'saw';
    if (isContinuous) {
      setBotState(prev => {
        const active = !prev.weaponActive;
        return { ...prev, weaponActive: active };
      });
    } else {
      useGameStore.getState().setVirtualInput({ action: true });
      setTimeout(() => {
        useGameStore.getState().setVirtualInput({ action: false });
      }, 100);
    }
  };

  const handleSelectPreset = (preset: typeof botPresets[0]) => {
    setBotConfig({
      id: "PLAYER-1",
      name: preset.name,
      weapon: preset.weapon,
      armor: preset.armor,
      motor: preset.motor
    });
    setPaintScheme(preset.color);
  };

  return (
    <KeyboardControls
      map={[
        { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
        { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
        { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
        { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
        { name: 'jump', keys: ['Space'] },
      ]}
    >
      <div className="relative w-full h-screen overflow-hidden bg-[#121212] select-none text-white font-sans">
        
        {/* Fullscale 3D Battleground Environment */}
        <Arena3D activeWeapon={botState.weaponActive} />

        {/* Dynamic Screens depending on Game Status */}
        <AnimatePresence mode="wait">
          
          {/* SCREEN 1: Main Menu & Setup Dashboard */}
          {battleStatus === 'menu' && !isWorkshopOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-between p-6 bg-black/60 backdrop-blur-sm overflow-y-auto"
            >
              {/* Header */}
              <div className="w-full max-w-5xl flex justify-between items-center py-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-[#E65100]" />
                  <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-widest text-white">
                    SYSTEM // CONFIG
                  </h1>
                </div>
                <div className="flex items-center gap-3">
                  {/* Cloud Sync Status Pill */}
                  <div 
                    onClick={() => setMenuTab('profile')}
                    className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono font-bold cursor-pointer hover:bg-white/10 transition-all select-none"
                    title={user ? `Logged in as ${user.email}. Synchronized with Cloud Firestore` : "Click to sign in and back up to Cloud Firestore"}
                  >
                    {user ? (
                      <>
                        <Cloud size={13} className="text-emerald-400" />
                        <span className="text-emerald-400 uppercase tracking-wide">SYNCED</span>
                        {isSyncing && <RefreshCw size={10} className="animate-spin text-emerald-400" />}
                      </>
                    ) : (
                      <>
                        <CloudOff size={13} className="text-orange-400" />
                        <span className="text-orange-400 uppercase tracking-wide">OFFLINE MODE</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 bg-[#2a2a2a] border border-[#444] px-4 py-2 rounded-sm">
                    <Coins size={16} className="text-[#FBC02D]" />
                    <span className="font-mono font-bold text-xs sm:text-sm tracking-wider text-[#FBC02D]">
                      {currency} CR
                    </span>
                  </div>
                </div>
              </div>

              {/* Sub Header Tab Navigation */}
              <div className="w-full max-w-5xl flex gap-1 bg-[#1a1a1a]/80 p-1 border border-white/5 rounded mt-4 shrink-0">
                <button
                  onClick={() => setMenuTab('fleet')}
                  className={`flex-1 py-2 px-3 rounded text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    menuTab === 'fleet'
                      ? "bg-[#E65100] text-white shadow"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Activity size={14} />
                  Fleet Dispatch
                </button>
                <button
                  onClick={() => setMenuTab('garage')}
                  className={`flex-1 py-2 px-3 rounded text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    menuTab === 'garage'
                      ? "bg-[#E65100] text-white shadow"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Wrench size={14} />
                  Custom Garage
                </button>
                <button
                  onClick={() => setMenuTab('profile')}
                  className={`flex-1 py-2 px-3 rounded text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    menuTab === 'profile'
                      ? "bg-[#E65100] text-white shadow"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <User size={14} />
                  Operator Profile
                </button>
              </div>

              {/* Central Area: Bot Customization & Choice / Garage Blueprints / Operator Stats */}
              <div className="w-full max-w-5xl flex-1 flex flex-col items-center justify-center min-h-0">
                <AnimatePresence mode="wait">
                  {menuTab === 'fleet' && (
                    <motion.div
                      key="fleet"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="w-full flex-1 flex flex-col lg:flex-row gap-6 items-stretch justify-center my-4 min-h-0"
                    >
                      {/* Left Side: Preset Bots Selector */}
                      <div className="w-full lg:w-1/2 flex flex-col gap-3 min-h-0">
                        <h3 className="font-mono text-xs font-bold tracking-widest uppercase text-white/50 flex items-center gap-2 shrink-0">
                          <Activity size={12} /> SELECT CHAMPION CHASSIS
                        </h3>
                        <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[380px] pr-1">
                          {botPresets.map((preset) => {
                            const isSelected = botConfig.name === preset.name;
                            return (
                              <button
                                key={preset.name}
                                onClick={() => handleSelectPreset(preset)}
                                className={`w-full text-left p-3.5 rounded-sm border transition-all cursor-pointer flex flex-col gap-1 ${
                                  isSelected
                                    ? "bg-[#2a2a2a] border-[#E65100]"
                                    : "bg-[#1f1f1f] border-white/10 hover:border-white/30"
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-sm tracking-wider" style={{ color: preset.color }}>
                                    {preset.name}
                                  </span>
                                  <span className="font-mono text-[9px] bg-white/5 text-white/40 px-2 py-0.5 rounded border border-white/5 uppercase">
                                    {preset.weapon.type}
                                  </span>
                                </div>
                                <p className="text-xs text-white/60 leading-relaxed font-sans">{preset.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Side: Active Configuration summary */}
                      <div className="w-full lg:w-1/2 bg-[#1f1f1f] border border-white/10 rounded-sm p-5 flex flex-col justify-between gap-4">
                        <div className="flex flex-col gap-4">
                          <div className="border-b border-white/10 pb-2.5 flex justify-between items-center">
                            <div>
                              <span className="font-mono text-[9px] text-white/40 uppercase">ACTIVE SCHEMATIC</span>
                              <h4 className="font-sans font-bold text-base text-white uppercase tracking-wider">
                                {botConfig.name}
                              </h4>
                            </div>
                            <button
                              onClick={() => setIsConfigOpen(true)}
                              className="px-3.5 py-1.5 bg-[#2a2a2a] hover:bg-[#333] text-white text-xs font-mono font-bold uppercase rounded-sm border border-[#444] transition-all cursor-pointer"
                            >
                              🔧 CUSTOMIZE
                            </button>
                          </div>

                          {/* Config Stats */}
                          <div className="grid grid-cols-2 gap-3.5">
                            <div className="bg-[#121212] p-2.5 rounded-sm border border-white/5">
                              <span className="font-mono text-[9px] text-white/40 uppercase">WEAPON DAMAGE</span>
                              <p className="font-sans font-bold text-base text-[#FBC02D]">{botConfig.weapon.damage}%</p>
                            </div>
                            <div className="bg-[#121212] p-2.5 rounded-sm border border-white/5">
                              <span className="font-mono text-[9px] text-white/40 uppercase">SPEED OUTPUT</span>
                              <p className="font-sans font-bold text-base text-white">{botConfig.motor.maxSpeed} m/s</p>
                            </div>
                            <div className="bg-[#121212] p-2.5 rounded-sm border border-white/5 col-span-2">
                              <span className="font-mono text-[9px] text-white/40 uppercase">ARMOR MATERIAL</span>
                              <p className="font-sans font-bold text-xs text-white uppercase mt-0.5">
                                {botConfig.armor.type} Alloy ({botConfig.armor.weight} kg)
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2.5 mt-2">
                          <button
                            onClick={() => setIsWorkshopOpen(true)}
                            className="w-full py-2.5 bg-[#E65100]/15 hover:bg-[#E65100]/30 text-[#FF5500] hover:text-white border border-[#E65100]/40 hover:border-[#FF5500] text-xs font-mono font-bold uppercase rounded-sm tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,85,0,0.1)] hover:shadow-[0_0_20px_rgba(255,85,0,0.2)]"
                          >
                            🛠️ BUILD-A-BOT WORKBENCH
                          </button>

                          <p className="font-mono text-[9px] text-white/30 text-center flex items-center justify-center gap-1">
                            <Info size={9} /> Keyboard (WASD/Arrows) and full touch gestures supported.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {menuTab === 'garage' && (
                    <motion.div
                      key="garage"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="w-full flex-1 flex flex-col gap-4 my-4 min-h-0"
                    >
                      {/* Save Current Build Block */}
                      <div className="bg-[#1f1f1f] border border-white/10 rounded-sm p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-sm bg-[#E65100]/10 border border-[#E65100]/30 flex items-center justify-center text-[#E65100]">
                            <Wrench size={18} />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Save Current Schematic</h4>
                            <p className="text-[10px] text-white/50">Store your custom parts layout into a persistent blueprint slot.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <input
                            type="text"
                            placeholder="Gladiator Name..."
                            value={newSaveName}
                            onChange={(e) => setNewSaveName(e.target.value.slice(0, 24))}
                            className="bg-[#121212] border border-white/15 px-3 py-1.5 rounded text-xs text-white focus:outline-none focus:border-[#E65100] font-mono w-full md:w-44"
                          />
                          <button
                            onClick={() => {
                              saveCurrentBotToGarage(newSaveName);
                              setNewSaveName('');
                            }}
                            className="bg-[#E65100] hover:bg-[#F57C00] text-white px-3 py-1.5 rounded text-xs font-mono font-bold uppercase cursor-pointer transition-all shrink-0 flex items-center gap-1"
                          >
                            <Plus size={12} /> Save Slot
                          </button>
                        </div>
                      </div>

                      {/* Blueprint Slots Header */}
                      <div className="flex items-center justify-between shrink-0">
                        <h3 className="font-mono text-xs font-bold tracking-widest uppercase text-white/50 flex items-center gap-2">
                          <Sparkles size={12} className="text-[#FF5500]" /> SAVED BLUEPRINT SCHEMATICS ({savedCustomBots.length} / 6)
                        </h3>
                      </div>

                      {/* Slots Grid */}
                      {savedCustomBots.length === 0 ? (
                        <div className="flex-1 bg-[#1a1a1a]/40 border border-dashed border-white/15 rounded p-6 flex flex-col items-center justify-center gap-2 text-center min-h-[220px]">
                          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                            <Wrench size={18} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white/80">No Blueprints Saved</p>
                            <p className="text-[10px] text-white/50 max-w-xs mt-0.5">Design a custom bot in the Build-A-Bot Workbench and save it above to manage your fleet!</p>
                          </div>
                          <button
                            onClick={() => setIsWorkshopOpen(true)}
                            className="text-[10px] font-mono text-[#E65100] hover:underline"
                          >
                            Go to Workbench &rarr;
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 overflow-y-auto max-h-[350px] pr-1">
                          {savedCustomBots.map((bot) => {
                            const isLoaded = botConfig.name === bot.name;
                            return (
                              <div
                                key={bot.id}
                                className={`p-3.5 rounded-sm border flex flex-col justify-between gap-3 transition-all bg-[#1f1f1f] ${
                                  isLoaded ? "border-[#E65100] shadow-[0_0_10px_rgba(230,81,0,0.15)]" : "border-white/15"
                                }`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="min-w-0">
                                    <span className="text-[9px] text-white/40 font-mono block">BLUEPRINT SLOT</span>
                                    <h4 className="font-bold text-sm text-white tracking-wide uppercase mt-0.5 truncate">{bot.name}</h4>
                                    <span className="text-[9px] text-white/50 font-mono block mt-0.5">
                                      Saved: {new Date(bot.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <span className="bg-white/5 text-white/60 font-mono text-[9px] px-1.5 py-0.5 border border-white/10 rounded shrink-0">
                                    {(bot.parts || []).length} PARTS
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <button
                                    onClick={() => loadBotFromGarage(bot.id)}
                                    className={`flex-1 py-1 rounded text-[10px] font-mono font-bold uppercase cursor-pointer transition-all border ${
                                      isLoaded
                                        ? "bg-[#E65100]/25 text-[#FF5500] border-[#E65100]/40"
                                        : "bg-white/5 hover:bg-white/10 text-white border-white/10"
                                    }`}
                                  >
                                    {isLoaded ? "Loaded" : "Load Schematic"}
                                  </button>
                                  
                                  {confirmDeleteId === bot.id ? (
                                    <div className="flex gap-1 shrink-0">
                                      <button
                                        onClick={() => {
                                          deleteBotFromGarage(bot.id);
                                          setConfirmDeleteId(null);
                                        }}
                                        className="bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-700/50 px-2 py-1 rounded text-[9px] font-mono font-bold uppercase cursor-pointer transition-all"
                                      >
                                        YES
                                      </button>
                                      <button
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="bg-white/5 hover:bg-white/10 text-white px-2 py-1 border border-white/10 rounded text-[9px] font-mono font-bold uppercase cursor-pointer transition-all"
                                      >
                                        NO
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDeleteId(bot.id)}
                                      className="p-1 rounded bg-white/5 hover:bg-red-950 hover:text-red-400 text-white/40 border border-white/10 hover:border-red-900/50 cursor-pointer transition-all shrink-0"
                                      title="Delete slot"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {menuTab === 'profile' && (
                    <motion.div
                      key="profile"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="w-full flex-1 flex flex-col lg:flex-row gap-5 my-4 items-stretch min-h-0"
                    >
                      {/* Left Column: Stats & Backup & Cloud Firestore Connection */}
                      <div className="w-full lg:w-1/2 flex flex-col gap-4 shrink-0 justify-center">
                        
                        {/* Cloud Firestore Sync Station */}
                        <div className="bg-[#1f1f1f] border border-[#FF5500]/30 rounded p-3.5 flex flex-col gap-3 relative overflow-hidden text-left">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#FF5500]/10 to-transparent pointer-events-none rounded-full blur-xl" />
                          
                          <h4 className="font-mono text-xs font-bold tracking-widest text-[#FF5500] uppercase flex items-center justify-between border-b border-white/5 pb-1.5 shrink-0">
                            <span className="flex items-center gap-1.5">
                              <Cloud size={13} /> CLOUD FIRESTORE SYNC STATION
                            </span>
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#FF5500]/10 text-[#FF5500] font-mono tracking-normal">
                              NOSQL // FIREBASE
                            </span>
                          </h4>

                          {!user ? (
                            <div className="flex flex-col gap-3">
                              <p className="text-[10px] text-white/70 leading-relaxed font-sans">
                                Persist your custom garage vehicle blueprints, combat archives, and match telemetry directly to our secure **Cloud Firestore** instance in <span className="text-orange-400 font-mono">us-east1</span>.
                              </p>
                              <button
                                onClick={async () => {
                                  try {
                                    await signInWithPopup(auth, googleAuthProvider);
                                  } catch (e) {
                                    console.error("Sign-in error", e);
                                  }
                                }}
                                className="w-full bg-[#E65100] hover:bg-[#F57C00] text-white font-mono font-bold text-[10px] tracking-wider py-2.5 px-4 rounded border border-[#FF5500]/40 uppercase transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                              >
                                <User size={13} /> SIGN IN WITH GOOGLE
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2.5">
                              <div className="flex items-center gap-3 bg-[#121212] p-2.5 rounded border border-white/5">
                                {user.photoURL ? (
                                  <img 
                                    src={user.photoURL} 
                                    alt="Avatar" 
                                    className="w-8 h-8 rounded-full border border-[#FF5500]/30 shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-[#E65100]/20 flex items-center justify-center border border-[#FF5500]/30 shrink-0 text-[#FF5500]">
                                    <User size={14} />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="text-[10px] font-bold text-white block truncate">{user.displayName || 'Authorized Pilot'}</span>
                                  <span className="text-[9px] font-mono text-white/50 block truncate">{user.email}</span>
                                </div>
                                <div className="flex items-center gap-1 font-mono text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  LIVE
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-white/50 bg-[#151515] p-2 rounded border border-white/5">
                                <div>
                                  <span className="text-[8px] text-white/30 block">GCP PROJECT ID:</span>
                                  <span className="text-white font-bold block truncate">scriptforge-5-26-8138</span>
                                </div>
                                <div>
                                  <span className="text-[8px] text-white/30 block">CLOUD REGION:</span>
                                  <span className="text-white font-bold block">us-east1</span>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => signOut(auth)}
                                  className="flex-1 bg-white/5 hover:bg-red-950 hover:text-red-400 hover:border-red-900/50 text-white/70 border border-white/10 py-1.5 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <LogOut size={12} /> Sign Out
                                </button>
                                <button
                                  onClick={useGameStore.getState().syncProfileData}
                                  disabled={isSyncing}
                                  className="flex-1 bg-[#E65100]/10 hover:bg-[#E65100]/20 border border-[#E65100]/30 text-[#FF5500] py-1.5 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                  <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} /> Force Sync
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Career Stats Grid */}
                        <div className="bg-[#1f1f1f] border border-white/10 rounded p-3.5 flex flex-col gap-3">
                          <h4 className="font-mono text-xs font-bold tracking-widest text-[#FBC02D] uppercase flex items-center justify-between border-b border-white/5 pb-1.5 shrink-0">
                            <span className="flex items-center gap-1.5">
                              <Award size={13} /> Career Statistics
                            </span>
                            {user && (
                              <span className="text-[8px] font-mono text-emerald-400 uppercase tracking-wide">
                                ☁️ Cloud Backed
                              </span>
                            )}
                          </h4>
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="bg-[#121212] p-2 border border-white/5 rounded text-left">
                              <span className="text-[9px] font-mono text-white/40 block">WINS / LOSSES</span>
                              <span className="text-base font-bold font-sans tracking-wide mt-0.5 block">
                                <span className="text-green-400">{careerStats.wins}</span>
                                <span className="text-white/40 font-mono mx-1">/</span>
                                <span className="text-red-400">{careerStats.losses}</span>
                              </span>
                            </div>
                            <div className="bg-[#121212] p-2 border border-white/5 rounded text-left">
                              <span className="text-[9px] font-mono text-white/40 block">WIN RATE</span>
                              <span className="text-base font-bold font-sans tracking-wide mt-0.5 block text-sky-400">
                                {careerStats.battlesFought > 0
                                  ? Math.round((careerStats.wins / careerStats.battlesFought) * 100)
                                  : 0}%
                              </span>
                            </div>
                            <div className="bg-[#121212] p-2 border border-white/5 rounded text-left">
                              <span className="text-[9px] font-mono text-white/40 block">BATTLES FOUGHT</span>
                              <span className="text-base font-bold font-mono tracking-wide mt-0.5 block text-white">
                                {careerStats.battlesFought}
                              </span>
                            </div>
                            <div className="bg-[#121212] p-2 border border-white/5 rounded text-left">
                              <span className="text-[9px] font-mono text-white/40 block">TOTAL REVENUE</span>
                              <span className="text-base font-bold font-sans tracking-wide mt-0.5 block text-[#FBC02D] flex items-center gap-1">
                                <Coins size={12} /> {careerStats.totalCreditsEarned}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Data Backup Hub */}
                        <div className="bg-[#1f1f1f] border border-white/10 rounded p-3.5 flex flex-col gap-3">
                          <h4 className="font-mono text-xs font-bold tracking-widest text-white/50 uppercase flex items-center gap-1.5 border-b border-white/5 pb-1.5 shrink-0">
                            <Upload size={13} /> Profile Sync & Backup
                          </h4>
                          
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const dataStr = exportFullBackup();
                                const blob = new Blob([dataStr], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `battlebot-operator-profile.json`;
                                link.click();
                                URL.revokeObjectURL(url);
                                setBackupStatus('success');
                                setTimeout(() => setBackupStatus('idle'), 2500);
                              }}
                              className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-1.5 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Download size={12} /> Backup
                            </button>

                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(exportFullBackup());
                                setBackupStatus('success');
                                setTimeout(() => setBackupStatus('idle'), 2500);
                              }}
                              className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-1.5 rounded text-[10px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Sparkles size={12} className="text-[#FF5500]" /> Copy Code
                            </button>
                          </div>

                          <div className="flex flex-col gap-1 text-left">
                            <span className="text-[9px] font-mono text-white/40 uppercase">Restore Profile Sync Code</span>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder="Paste JSON profile backup..."
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                className="flex-1 bg-[#121212] border border-white/15 px-2 py-1 rounded text-[10px] text-white focus:outline-none focus:border-[#E65100] font-mono"
                              />
                              <button
                                onClick={() => {
                                  const ok = importFullBackup(importText);
                                  if (ok) {
                                    setBackupStatus('success');
                                    setImportText('');
                                  } else {
                                    setBackupStatus('error');
                                  }
                                  setTimeout(() => setBackupStatus('idle'), 2500);
                                }}
                                className="bg-[#E65100] hover:bg-[#F57C00] px-3.5 rounded text-[10px] font-mono font-bold uppercase cursor-pointer text-white"
                              >
                                Sync
                              </button>
                            </div>
                          </div>

                          {backupStatus === 'success' && (
                            <div className="text-center text-[10px] font-mono text-green-400 animate-pulse">
                              ✓ Sync operation completed successfully!
                            </div>
                          )}
                          {backupStatus === 'error' && (
                            <div className="text-center text-[10px] font-mono text-red-400">
                              ✗ Failed to parse import code.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Column: Battle Log History Archive */}
                      <div className="w-full lg:w-1/2 bg-[#1f1f1f] border border-white/10 rounded p-3.5 flex flex-col gap-2.5 min-h-0 flex-1">
                        <h4 className="font-mono text-xs font-bold tracking-widest text-white/50 uppercase flex items-center gap-1.5 border-b border-white/5 pb-1.5 shrink-0">
                          <History size={13} /> Battle Archive Logs
                        </h4>
                        
                        {matchHistory.length === 0 ? (
                          <div className="flex-1 flex flex-col items-center justify-center text-center gap-1 text-white/30 p-4">
                            <History size={20} />
                            <span className="text-[10px] font-mono uppercase">Archive Empty</span>
                            <span className="text-[9px] max-w-[200px] leading-relaxed">Go fight opponents to save matching logs into local storage!</span>
                          </div>
                        ) : (
                          <div className="overflow-y-auto max-h-[300px] flex flex-col gap-2 pr-1">
                            {matchHistory.map((match) => (
                              <div
                                key={match.id}
                                className={`p-2.5 rounded border flex flex-row items-center justify-between gap-2 text-[10px] ${
                                  match.outcome === 'victory'
                                    ? "bg-green-950/25 border-green-900/40"
                                    : "bg-red-950/25 border-red-900/40"
                                }`}
                              >
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-mono text-[8px] px-1 py-0.2 rounded font-black uppercase shrink-0 ${
                                      match.outcome === 'victory'
                                        ? "bg-green-500/25 text-green-400"
                                        : "bg-red-500/25 text-red-400"
                                    }`}>
                                      {match.outcome}
                                    </span>
                                    <span className="font-bold text-white uppercase truncate">{match.playerBotName}</span>
                                  </div>
                                  <span className="text-[9px] text-white/50 font-sans block truncate">
                                    VS {match.opponentName} • Remaining: {match.playerHealthRemaining}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 font-mono shrink-0">
                                  <span className="text-[9px] text-white/40">
                                    {new Date(match.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span className={`font-bold ${match.creditsEarned > 0 ? "text-[#FBC02D]" : "text-white/40"}`}>
                                    +{match.creditsEarned} CR
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Start Simulation Action */}
              <div className="w-full max-w-5xl flex flex-col items-center gap-4 py-6">
                <button
                  onClick={() => { initAudio(); startBattle(); }}
                  className="w-full max-w-md py-4 rounded-sm bg-[#E65100] font-sans font-bold text-lg tracking-widest uppercase hover:bg-[#F57C00] active:scale-95 transition-all cursor-pointer text-white flex items-center justify-center gap-3 border border-[#FFB74D]"
                >
                  <Play size={20} fill="currentColor" />
                  INITIALIZE SEQUENCE
                </button>
              </div>
            </motion.div>
          )}

          {/* SCREEN 1B: Build-a-Bot Workshop Screen */}
          {battleStatus === 'menu' && isWorkshopOpen && (
            <motion.div
              key="workshop"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 z-30 overflow-y-auto bg-[#080808]"
            >
              <BuildABotWorkshop onBack={() => setIsWorkshopOpen(false)} />
            </motion.div>
          )}

          {/* SCREEN 2: Dynamic CountDown Ring Overlay */}
          {battleStatus === 'countdown' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center bg-black/80"
            >
              <motion.div
                key={countdown}
                initial={{ scale: 0.2, opacity: 0 }}
                animate={{ scale: 1.2, opacity: 1 }}
                exit={{ scale: 2, opacity: 0 }}
                transition={{ duration: 0.85, ease: "easeOut" }}
                className="flex flex-col items-center gap-4"
              >
                <div className="w-32 h-32 border-4 border-[#FBC02D] flex items-center justify-center bg-[#121212]">
                  <span className="font-mono text-6xl font-black text-[#FBC02D]">{countdown}</span>
                </div>
                <span className="font-mono text-sm tracking-widest text-[#FBC02D]/60 uppercase">
                  SYSTEM INITIALIZING...
                </span>
              </motion.div>
            </motion.div>
          )}

          {/* SCREEN 3: Active Battle View (HUD + Live Telemetry + Custom Mobile Overlay) */}
          {battleStatus === 'battle' && (
            <>
              {/* Dynamic HUD */}
              <HUD botState={botState} />

              {/* Dynamic Telemetry log */}
              <Telemetry logs={logs} />

              {/* Mobile Touch Overlay */}
              <TouchControls onOpenConfig={() => setIsConfigOpen(true)} />

              {/* Desktop/Tablet Operator Control bar */}
              <div className="hidden md:block">
                <Controls 
                  onToggleWeapon={toggleWeapon} 
                  weaponActive={botState.weaponActive} 
                  onOpenConfig={() => setIsConfigOpen(true)}
                />
              </div>
            </>
          )}

          {/* SCREEN 4: Win/Loss Arena recap screen */}
          {battleStatus === 'ended' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center bg-[#121212]/90 p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-md bg-[#1f1f1f] border border-[#333] rounded-sm p-8 flex flex-col items-center gap-6 shadow-xl"
              >
                {winner === 'player' ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-20 h-20 rounded-sm bg-[#FBC02D]/10 border border-[#FBC02D]/30 flex items-center justify-center text-[#FBC02D]">
                      <Trophy size={44} />
                    </div>
                    <span className="font-mono text-xs tracking-widest text-[#FBC02D] uppercase font-bold mt-2">
                      ARENA CHAMPION
                    </span>
                    <h2 className="font-sans font-extrabold text-3xl text-white uppercase tracking-wider text-center">
                      VICTORY ACHIEVED!
                    </h2>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-20 h-20 rounded-sm bg-[#D32F2F]/10 border border-[#D32F2F]/30 flex items-center justify-center text-[#D32F2F]">
                      <Skull size={44} />
                    </div>
                    <span className="font-mono text-xs tracking-widest text-[#D32F2F] uppercase font-bold mt-2">
                      BOT DISMANTLED
                    </span>
                    <h2 className="font-sans font-extrabold text-3xl text-white uppercase tracking-wider text-center">
                      SYSTEM FAILED
                    </h2>
                  </div>
                )}

                {/* Match Summary Stats */}
                <div className="w-full bg-[#121212] border border-[#333] rounded-sm p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/50">Your Champion:</span>
                    <span className="font-mono font-bold text-white">{botConfig.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/50">Credits Earned:</span>
                    <span className="font-mono font-bold text-[#FBC02D]">
                      {winner === 'player' ? "+500 CR" : "+0 CR"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-[#333] pt-3">
                    <span className="text-white/50">Your Integrity remaining:</span>
                    <span className={`font-mono font-bold ${botState.health > 20 ? "text-[#4CAF50]" : "text-[#D32F2F]"}`}>
                      {Math.round(botState.health)}%
                    </span>
                  </div>
                </div>

                <button
                  onClick={resetBattle}
                  className="w-full py-4 rounded-sm bg-[#333] text-white hover:bg-[#444] active:scale-95 font-sans font-bold text-sm uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 border border-[#555]"
                >
                  <RotateCcw size={16} />
                  RETURN TO BASE
                </button>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Slidable Side-drawer Configuration panel */}
        <ConfigurationPanel 
          config={botConfig} 
          isOpen={isConfigOpen} 
          onClose={() => setIsConfigOpen(false)} 
        />

      </div>
    </KeyboardControls>
  );
}
