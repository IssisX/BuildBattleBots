const fs = require('fs');

let content = fs.readFileSync('src/components/ConfigurationPanel.tsx', 'utf8');

// The Settings Tab block starts with `<div className="flex-1 overflow-y-auto p-6 space-y-6">` and ends around line 660 where `activeTab === 'customize'` ends.
// Actually, it's better to find the markers.
const settingsStart = content.indexOf(`{activeTab === 'settings' && (`);
const settingsEnd = content.indexOf(`{/* Save and Return Button */}`, settingsStart);

const newSettingsUI = `{activeTab === 'settings' && (
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
`;

content = content.substring(0, settingsStart) + newSettingsUI + content.substring(settingsEnd);

fs.writeFileSync('src/components/ConfigurationPanel.tsx', content);
