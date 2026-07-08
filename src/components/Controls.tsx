import React from 'react';
import { Power, Crosshair, Map, Shield, Camera, Video, Maximize } from 'lucide-react';
import { cn } from '../lib/utils';
import { useGameStore, CameraMode } from '../store';

export const Controls = ({ 
  onToggleWeapon, 
  weaponActive,
  onOpenConfig
}: { 
  onToggleWeapon: () => void;
  weaponActive: boolean;
  onOpenConfig: () => void;
}) => {
  const cameraMode = useGameStore(s => s.cameraMode);
  const setCameraMode = useGameStore(s => s.setCameraMode);

  const cycleCamera = () => {
    const modes: CameraMode[] = ['free', 'follow', 'cinematic'];
    const nextIndex = (modes.indexOf(cameraMode) + 1) % modes.length;
    setCameraMode(modes[nextIndex]);
  };

  const CameraIcon = cameraMode === 'free' ? Maximize : cameraMode === 'follow' ? Camera : Video;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#121212] border border-[#333] p-2 rounded-sm flex items-center gap-2 pointer-events-auto z-10 shadow-lg">
      <button 
        onClick={onOpenConfig}
        className="w-12 h-12 flex items-center justify-center rounded-sm bg-[#1f1f1f] border border-[#333] hover:border-[#555] text-white/70 hover:text-white transition-all group"
        title="Vehicle Configuration"
      >
        <Shield size={20} className="group-hover:scale-110 transition-transform" />
      </button>
      
      <div className="w-px h-8 bg-[#333] mx-2" />
      
      <button 
        onClick={onToggleWeapon}
        className={cn(
          "px-6 h-12 flex items-center justify-center gap-2 rounded-sm font-mono text-xs font-bold uppercase tracking-widest transition-all border",
          weaponActive 
            ? "bg-[#D32F2F] text-white border-[#D32F2F]" 
            : "bg-[#1f1f1f] border-[#333] text-white/50 hover:bg-[#222] hover:text-white"
        )}
      >
        <Power size={16} />
        {weaponActive ? "Weapon Active" : "Arm Weapon"}
      </button>

      <div className="w-px h-8 bg-[#333] mx-2" />

      <button 
        onClick={cycleCamera}
        className={cn(
          "px-4 h-12 flex items-center justify-center gap-2 rounded-sm font-mono text-xs uppercase tracking-widest transition-all border",
          cameraMode !== 'free' ? "bg-[#1976D2]/20 text-[#1976D2] border-[#1976D2]/30" : "bg-[#1f1f1f] border-[#333] text-white/70 hover:bg-[#222] hover:text-white"
        )}
        title={`Camera Mode: ${cameraMode}`}
      >
        <CameraIcon size={16} />
        <span className="hidden sm:inline">{cameraMode}</span>
      </button>
      
      <button 
        className="w-12 h-12 flex items-center justify-center rounded-sm bg-[#1f1f1f] border border-[#333] hover:border-[#555] text-white/70 hover:text-white transition-all group"
        title="Tactical Map"
      >
        <Map size={20} className="group-hover:scale-110 transition-transform" />
      </button>
    </div>
  );
};
