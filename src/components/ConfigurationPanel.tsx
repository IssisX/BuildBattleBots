import React from 'react';
import { VehicleConfig, WeaponType, ArmorType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Crosshair, ShieldAlert, Cpu, X, PaintBucket, Coins, Lock, Unlock, RotateCcw, Sliders, Wrench } from 'lucide-react';
import { useGameStore } from '../store';
import { cn } from '../lib/utils';

export const ConfigurationPanel = ({ 
  config, 
  isOpen, 
  onClose 
}: { 
  config: VehicleConfig; 
  isOpen: boolean; 
  onClose: () => void;
}) => {
  const setBotConfig = useGameStore(s => s.setBotConfig);
  const currency = useGameStore(s => s.currency);
  const addCurrency = useGameStore(s => s.addCurrency);
  const unlockedWeapons = useGameStore(s => s.unlockedWeapons);
  const unlockWeapon = useGameStore(s => s.unlockWeapon);
  const paintScheme = useGameStore(s => s.paintScheme);
  const setPaintScheme = useGameStore(s => s.setPaintScheme);

  // Settings integration
  const settings = useGameStore(s => s.settings);
  const updateSetting = useGameStore(s => s.updateSetting);
  const resetSettings = useGameStore(s => s.resetSettings);

  const [activeTab, setActiveTab] = React.useState<'customize' | 'settings'>('customize');

  const updateConfig = (key: keyof VehicleConfig, subKey: string, value: any) => {
    setBotConfig({
      ...config,
      [key]: {
        ...(config[key] as any),
        [subKey]: value
      }
    });
  };

  const handleWeaponSelect = (type: WeaponType) => {
    if (unlockedWeapons.includes(type)) {
      updateConfig('weapon', 'type', type);
    } else {
      if (currency >= 500) {
        addCurrency(-500);
        unlockWeapon(type);
        updateConfig('weapon', 'type', type);
      }
    }
  };

  const weaponOptions: { type: WeaponType, label: string }[] = [
    { type: 'spinner', label: 'Spinner' },
    { type: 'flipper', label: 'Flipper' },
    { type: 'saw', label: 'Buzz Saw' },
    { type: 'hammer', label: 'Sledgehammer' },
    { type: 'drum', label: 'Drum Roller' },
    { type: 'crusher', label: 'Crush Claw' }
  ];

  const paintOptions = [
    { color: '#666666', name: 'Industrial Gray' },
    { color: '#2A2A2A', name: 'Matte Black' },
    { color: '#D32F2F', name: 'Hazard Red' },
    { color: '#1976D2', name: 'Safety Blue' },
    { color: '#FBC02D', name: 'Engineering Yellow' }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 pointer-events-auto"
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 h-full w-80 sm:w-96 bg-[#121212] border-r border-[#333] z-30 flex flex-col pointer-events-auto overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-[#222] flex justify-between items-center bg-[#0d0d0d]">
              <h2 className="font-sans font-bold text-lg tracking-widest text-white flex items-center gap-2">
                <Settings className="text-[#FBC02D] animate-spin-slow" size={20} /> CORE_SYS
              </h2>
              <button 
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tactile Tab Selector */}
            <div className="flex border-b border-[#222] bg-[#0f0f0f] p-1">
              <button
                onClick={() => setActiveTab('customize')}
                className={cn(
                  "flex-1 py-3 px-4 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all rounded-sm",
                  activeTab === 'customize' 
                    ? "bg-[#1d1d1d] text-[#FBC02D] border-b-2 border-[#FBC02D]" 
                    : "text-white/40 hover:text-white/80"
                )}
              >
                <Wrench size={14} /> Customize Bot
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={cn(
                  "flex-1 py-3 px-4 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all rounded-sm",
                  activeTab === 'settings' 
                    ? "bg-[#1d1d1d] text-[#00E5FF] border-b-2 border-[#00E5FF]" 
                    : "text-white/40 hover:text-white/80"
                )}
              >
                <Sliders size={14} /> Arena Rules
              </button>
            </div>

            {/* Scrollable Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#121212] scrollbar-thin scrollbar-thumb-[#333]">
              
              {/* Tab 1: Customize Bot */}
              {activeTab === 'customize' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-[#1e1e1e] border border-[#333] rounded-sm p-3">
                    <div className="flex items-center gap-2">
                      <Coins className="text-[#FBC02D]" size={16} />
                      <span className="font-mono text-xs text-white/60">OPERATIONAL CREDIT</span>
                    </div>
                    <span className="font-mono text-[#FBC02D] text-sm font-bold tracking-wider">{currency} CR</span>
                  </div>

                  {/* Team Customization */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-4 border-b border-[#333] pb-3">
                      <div className="p-1.5 bg-[#333] rounded-sm">
                        <PaintBucket className="text-white" size={16} />
                      </div>
                      <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Paint Scheme</h3>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {paintOptions.map(paint => (
                        <button
                          key={paint.color}
                          onClick={() => setPaintScheme(paint.color)}
                          className={cn(
                            "w-10 h-10 rounded-sm border transition-all hover:scale-105 focus:outline-none",
                            paintScheme === paint.color ? "border-white border-2" : "border-[#333]"
                          )}
                          style={{ backgroundColor: paint.color }}
                          title={paint.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Weapon System */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-4 border-b border-[#333] pb-3">
                      <div className="p-1.5 bg-[#333] rounded-sm">
                        <Crosshair className="text-white" size={16} />
                      </div>
                      <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Weapon System</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-white/40 uppercase block mb-2">Type (Unlock: 500 CR)</span>
                        <div className="grid grid-cols-2 gap-2">
                          {weaponOptions.map(w => {
                            const isUnlocked = unlockedWeapons.includes(w.type);
                            const isSelected = config.weapon.type === w.type;
                            return (
                              <button
                                key={w.type}
                                onClick={() => handleWeaponSelect(w.type)}
                                className={cn(
                                  "p-2.5 rounded-sm font-sans text-xs border flex items-center justify-between transition-all",
                                  isSelected 
                                    ? "bg-[#252525] border-[#FBC02D] text-white font-semibold" 
                                    : isUnlocked 
                                      ? "bg-[#181818] border-[#333] text-white/70 hover:border-[#444]" 
                                      : "bg-[#181818] border-[#FBC02D]/20 text-white/40 hover:border-[#FBC02D]/40"
                                )}
                              >
                                <span>{w.label}</span>
                                {isUnlocked ? <Unlock size={11} className="text-white/20" /> : <Lock size={11} className="text-[#FBC02D]/60" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-white/40 uppercase block mb-1 flex justify-between">
                          <span>Max Motor RPM</span>
                          <span className="text-white font-bold">{config.weapon.rpm} RPM</span>
                        </span>
                        <input 
                          type="range" 
                          min="1000" max="8000" step="100"
                          value={config.weapon.rpm}
                          onChange={(e) => updateConfig('weapon', 'rpm', parseInt(e.target.value))}
                          className="w-full accent-[#FBC02D]"
                        />
                      </div>
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-white/40 uppercase block mb-1 flex justify-between">
                          <span>Kinetic Damage Cap</span>
                          <span className="text-[#FBC02D] font-bold">{config.weapon.damage}%</span>
                        </span>
                        <div className="h-1.5 w-full bg-[#252525] rounded-sm mt-2 overflow-hidden border border-[#333]">
                          <div className="h-full bg-[#FBC02D]" style={{ width: `${config.weapon.damage}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Armor Plating */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-4 border-b border-[#333] pb-3">
                      <div className="p-1.5 bg-[#333] rounded-sm">
                        <ShieldAlert className="text-white" size={16} />
                      </div>
                      <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Armor Plating</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-white/40 uppercase block mb-1">Chassis Material</span>
                        <select 
                          value={config.armor.type}
                          onChange={(e) => {
                            const type = e.target.value as ArmorType;
                            updateConfig('armor', 'type', type);
                            const weights = { "titanium": 120, "steel": 180, "aluminum": 80, "carbon-fiber": 60 };
                            updateConfig('armor', 'weight', weights[type]);
                          }}
                          className="w-full bg-[#181818] border border-[#333] rounded-sm p-2 text-white font-sans text-xs focus:outline-none focus:border-[#444]"
                        >
                          <option value="titanium">Titanium Alloy (Moderate Weight)</option>
                          <option value="steel">Hardened Steel (Heavy Defense)</option>
                          <option value="aluminum">Aircraft Aluminum (Ultra Responsive)</option>
                          <option value="carbon-fiber">Carbon Fiber Composite (Lightweight Speed)</option>
                        </select>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-white/40 uppercase block mb-0.5">Absolute Weight</span>
                        <span className="font-mono text-white/90 text-sm font-bold">{config.armor.weight} kg</span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-white/40 uppercase block mb-1">Impact Dampening Ratio</span>
                        <div className="h-1.5 w-full bg-[#252525] rounded-sm mt-2 overflow-hidden border border-[#333]">
                          <div className="h-full bg-white" style={{ width: `${config.armor.integrity}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Drive Motors */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-4 border-b border-[#333] pb-3">
                      <div className="p-1.5 bg-[#333] rounded-sm">
                        <Cpu className="text-white" size={16} />
                      </div>
                      <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Drive Motors</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-white/40 uppercase block mb-1 flex justify-between">
                          <span>Max Motor Torque</span>
                          <span className="text-white/90 font-bold">{config.motor.torque} Nm</span>
                        </span>
                        <input 
                          type="range" 
                          min="200" max="800" step="50"
                          value={config.motor.torque}
                          onChange={(e) => updateConfig('motor', 'torque', parseInt(e.target.value))}
                          className="w-full accent-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-white/40 uppercase block mb-1 flex justify-between">
                          <span>Velocity Cap</span>
                          <span className="text-white/90 font-bold">{config.motor.maxSpeed} m/s</span>
                        </span>
                        <input 
                          type="range" 
                          min="10" max="50" step="5"
                          value={config.motor.maxSpeed}
                          onChange={(e) => updateConfig('motor', 'maxSpeed', parseInt(e.target.value))}
                          className="w-full accent-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: System Settings */}
              {activeTab === 'settings' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-4 mb-4">
                    <p className="text-white/60 text-xs font-mono mb-2 border-b border-[#333] pb-2">
                      ADJUST CORE SIMULATION VARIABLES. LIVE SYSTEMS WILL ADAPT.
                    </p>
                    <button onClick={resetSettings} className="w-full flex items-center justify-center gap-2 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded-sm font-mono text-[10px] uppercase transition-colors">
                      <RotateCcw size={12} /> Reset to Defaults
                    </button>
                  </div>

                  {/* PHYSICS / HANDLING */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-4 border-b border-[#333] pb-3">
                      <div className="p-1.5 bg-[#333] rounded-sm">
                        <Sliders className="text-[#00E676]" size={16} />
                      </div>
                      <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Physics / Handling</h3>
                    </div>
                    <div className="space-y-4">
                      {/* Vehicle Grip */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Vehicle Grip</span>
                          <span className="text-white font-bold">{settings.vehicleGrip.toFixed(1)}x</span>
                        </div>
                        <input type="range" min="0.5" max="3.0" step="0.1" value={settings.vehicleGrip} onChange={(e) => updateSetting('vehicleGrip', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                      {/* Drift Factor */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Drift Factor</span>
                          <span className="text-white font-bold">{settings.driftFactor.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0.0" max="1.0" step="0.1" value={settings.driftFactor} onChange={(e) => updateSetting('driftFactor', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                      {/* Angular Damping */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Angular Damping</span>
                          <span className="text-white font-bold">{settings.angularDamping.toFixed(1)}</span>
                        </div>
                        <input type="range" min="1.0" max="15.0" step="0.5" value={settings.angularDamping} onChange={(e) => updateSetting('angularDamping', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                      {/* Collision Restitution */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Collision Restitution</span>
                          <span className="text-white font-bold">{settings.collisionRestitution.toFixed(2)}</span>
                        </div>
                        <input type="range" min="0.0" max="1.0" step="0.05" value={settings.collisionRestitution} onChange={(e) => updateSetting('collisionRestitution', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                      {/* Impact Impulse Scale */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Impact Impulse Scale</span>
                          <span className="text-white font-bold">{settings.impactImpulseScale.toFixed(1)}x</span>
                        </div>
                        <input type="range" min="0.1" max="5.0" step="0.1" value={settings.impactImpulseScale} onChange={(e) => updateSetting('impactImpulseScale', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                      {/* Knockback Scale */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Knockback Scale</span>
                          <span className="text-white font-bold">{settings.knockbackScale.toFixed(1)}x</span>
                        </div>
                        <input type="range" min="0.1" max="3.0" step="0.1" value={settings.knockbackScale} onChange={(e) => updateSetting('knockbackScale', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                      {/* Chassis Mass Scale */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Chassis Mass Scale</span>
                          <span className="text-white font-bold">{settings.chassisMassScale.toFixed(1)}x</span>
                        </div>
                        <input type="range" min="0.5" max="3.0" step="0.1" value={settings.chassisMassScale} onChange={(e) => updateSetting('chassisMassScale', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                      {/* Maximum Velocity */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Maximum Velocity</span>
                          <span className="text-white font-bold">{settings.maximumVelocity.toFixed(0)}</span>
                        </div>
                        <input type="range" min="10" max="100" step="1" value={settings.maximumVelocity} onChange={(e) => updateSetting('maximumVelocity', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                      {/* Maximum Angular Velocity */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Max Angular Velocity</span>
                          <span className="text-white font-bold">{settings.maximumAngularVelocity.toFixed(0)}</span>
                        </div>
                        <input type="range" min="5" max="50" step="1" value={settings.maximumAngularVelocity} onChange={(e) => updateSetting('maximumAngularVelocity', parseFloat(e.target.value))} className="w-full accent-[#00E676]" />
                      </div>
                    </div>
                  </div>

                  {/* IMPACT / DAMAGE */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-4 border-b border-[#333] pb-3">
                      <div className="p-1.5 bg-[#333] rounded-sm">
                        <Crosshair className="text-[#FF5500]" size={16} />
                      </div>
                      <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Impact / Damage</h3>
                    </div>
                    <div className="space-y-4">
                      {/* Damage Multiplier */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Damage Multiplier</span>
                          <span className="text-white font-bold">{settings.damageMultiplier.toFixed(1)}x</span>
                        </div>
                        <input type="range" min="0.1" max="5.0" step="0.1" value={settings.damageMultiplier} onChange={(e) => updateSetting('damageMultiplier', parseFloat(e.target.value))} className="w-full accent-[#FF5500]" />
                      </div>
                      {/* Collision Brutality */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Collision Brutality</span>
                          <span className="text-white font-bold">{settings.collisionBrutality.toFixed(1)}x</span>
                        </div>
                        <input type="range" min="0.5" max="3.0" step="0.1" value={settings.collisionBrutality} onChange={(e) => updateSetting('collisionBrutality', parseFloat(e.target.value))} className="w-full accent-[#FF5500]" />
                      </div>
                      {/* Heavy Hit Threshold */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Heavy Hit Threshold</span>
                          <span className="text-white font-bold">{settings.heavyHitThreshold.toFixed(0)}</span>
                        </div>
                        <input type="range" min="10" max="200" step="5" value={settings.heavyHitThreshold} onChange={(e) => updateSetting('heavyHitThreshold', parseFloat(e.target.value))} className="w-full accent-[#FF5500]" />
                      </div>
                      {/* Glancing Hit Reduction */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Glancing Hit Reduction</span>
                          <span className="text-white font-bold">{settings.glancingHitReduction.toFixed(2)}</span>
                        </div>
                        <input type="range" min="0.1" max="1.0" step="0.05" value={settings.glancingHitReduction} onChange={(e) => updateSetting('glancingHitReduction', parseFloat(e.target.value))} className="w-full accent-[#FF5500]" />
                      </div>
                      {/* Impact Feedback Strength */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Impact Feedback Strength</span>
                          <span className="text-white font-bold">{settings.impactFeedbackStrength.toFixed(1)}x</span>
                        </div>
                        <input type="range" min="0.0" max="3.0" step="0.1" value={settings.impactFeedbackStrength} onChange={(e) => updateSetting('impactFeedbackStrength', parseFloat(e.target.value))} className="w-full accent-[#FF5500]" />
                      </div>
                      {/* Reduced Motion */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-white/80 uppercase">Reduced Motion</span>
                        <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => updateSetting('reducedMotion', e.target.checked)} className="accent-[#FF5500]" />
                      </div>
                    </div>
                  </div>

                  {/* PERFORMANCE SAFETY */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-4 border-b border-[#333] pb-3">
                      <div className="p-1.5 bg-[#333] rounded-sm">
                        <ShieldAlert className="text-[#00B0FF]" size={16} />
                      </div>
                      <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Performance Safety</h3>
                    </div>
                    <div className="space-y-4">
                      {/* Max Active Fragments */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Max Active Fragments</span>
                          <span className="text-white font-bold">{settings.maxActiveFragments.toFixed(0)}</span>
                        </div>
                        <input type="range" min="5" max="100" step="5" value={settings.maxActiveFragments} onChange={(e) => updateSetting('maxActiveFragments', parseFloat(e.target.value))} className="w-full accent-[#00B0FF]" />
                      </div>
                      {/* Debris Lifetime */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Debris Lifetime (s)</span>
                          <span className="text-white font-bold">{settings.debrisLifetime.toFixed(1)}</span>
                        </div>
                        <input type="range" min="1.0" max="15.0" step="0.5" value={settings.debrisLifetime} onChange={(e) => updateSetting('debrisLifetime', parseFloat(e.target.value))} className="w-full accent-[#00B0FF]" />
                      </div>
                      {/* Effect Lifetime */}
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-white/40 uppercase mb-1">
                          <span>Effect Lifetime (s)</span>
                          <span className="text-white font-bold">{settings.effectLifetime.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0.5" max="5.0" step="0.1" value={settings.effectLifetime} onChange={(e) => updateSetting('effectLifetime', parseFloat(e.target.value))} className="w-full accent-[#00B0FF]" />
                      </div>
                      {/* Fragment Quality */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-white/80 uppercase">Fragment Quality</span>
                        <select value={settings.fragmentQuality} onChange={(e) => updateSetting('fragmentQuality', e.target.value as any)} className="bg-[#222] border border-[#333] text-white text-[10px] font-mono px-2 py-1 outline-none">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      {/* Performance Mode */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-white/80 uppercase">Performance Mode</span>
                        <input type="checkbox" checked={settings.performanceMode} onChange={(e) => updateSetting('performanceMode', e.target.checked)} className="accent-[#00B0FF]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
{/* Save and Return Button */}
            <div className="p-4 border-t border-[#222] bg-[#0d0d0d] flex justify-center shadow-lg">
              <button 
                onClick={onClose}
                className="w-full py-3 border border-[#333] bg-[#1a1a1a] text-white font-mono text-xs uppercase tracking-widest hover:bg-[#252525] hover:border-[#444] transition-all rounded-sm font-bold active:scale-[0.98]"
              >
                SAVE & DEPLOY CONFIG
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
