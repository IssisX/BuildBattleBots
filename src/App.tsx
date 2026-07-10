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
import { FleetWorkbench } from './components/FleetWorkbench';
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
    const isContinuous = botConfig.weapon.type === 'spinner' || botConfig.weapon.type === 'saw' || botConfig.weapon.type === 'drum';
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
          {battleStatus === 'menu' && (
            <motion.div
              key="menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30"
            >
              <FleetWorkbench />
            </motion.div>
          )}

          {/* SCREEN 2: Dynamic CountDown Ring Overlay */}
          {battleStatus === 'countdown' && (
            <motion.div
              key="countdown"
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
            <motion.div
              key="battle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 pointer-events-none"
            >
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
            </motion.div>
          )}

          {/* SCREEN 4: Win/Loss Arena recap screen */}
          {battleStatus === 'ended' && (
            <motion.div
              key="ended"
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

        <ConfigurationPanel 
          isOpen={isConfigOpen} 
          onClose={() => setIsConfigOpen(false)} 
          config={botConfig} 
        />

        </div>
    </KeyboardControls>
  );
}
