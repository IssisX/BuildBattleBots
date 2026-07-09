import React from 'react';
import { useGameStore } from '../store';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Zap, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

export const TouchControls = ({ onOpenConfig }: { onOpenConfig: () => void }) => {
  const setVirtualInput = useGameStore(s => s.setVirtualInput);
  const virtualInput = useGameStore(s => s.virtualInput);
  const botState = useGameStore(s => s.botState);
  const setBotState = useGameStore(s => s.setBotState);
  const addLog = useGameStore(s => s.addLog);
  const battleStatus = useGameStore(s => s.battleStatus);
  const botConfig = useGameStore(s => s.botConfig);

  const [joystickPos, setJoystickPos] = React.useState({ x: 0, y: 0 });
  const joystickRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);

  const isContinuous = botConfig.weapon.type === 'spinner' || botConfig.weapon.type === 'saw' || botConfig.weapon.type === 'drum';

  const handleWeaponPress = (active: boolean) => {
    if (battleStatus !== 'battle') return;
    if (isContinuous) {
      if (active) {
        setBotState(prev => {
          const nextActive = !prev.weaponActive;
          addLog(
            nextActive ? "💥 WEAPON ENGAGED: Rotors spooling up!" : "🔌 WEAPON DISARMED: Spooling down rotors.",
            nextActive ? "combat" : "info"
          );
          return { ...prev, weaponActive: nextActive };
        });
      }
    } else {
      setVirtualInput({ action: active });
    }
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickRef.current || !dragging.current) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxRadius) {
      dx = (dx / distance) * maxRadius;
      dy = (dy / distance) * maxRadius;
    }

    setJoystickPos({ x: dx, y: dy });

    const normalizedX = dx / maxRadius;
    const normalizedY = dy / maxRadius;
    const threshold = 0.2;

    setVirtualInput({
      forward: normalizedY < -threshold,
      backward: normalizedY > threshold,
      left: normalizedX < -threshold,
      right: normalizedX > threshold,
      analogX: normalizedX,
      analogY: normalizedY,
    });
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickRef.current) {
      joystickRef.current.setPointerCapture(e.pointerId);
    }
    dragging.current = true;
    handleJoystickMove(e);
  };

  const stopDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickRef.current) {
      joystickRef.current.releasePointerCapture(e.pointerId);
    }
    dragging.current = false;
    setJoystickPos({ x: 0, y: 0 });
    setVirtualInput({ forward: false, backward: false, left: false, right: false, analogX: 0, analogY: 0 });
  };

  return (
    <div className="absolute bottom-6 left-0 w-full px-6 flex justify-between items-end pointer-events-none z-20">
      {/* LEFT: Joystick */}
      <div 
        className="w-32 h-32 bg-[#121212]/80 border border-[#333] rounded-full flex items-center justify-center relative pointer-events-auto touch-none shadow-lg"
        ref={joystickRef}
        onPointerDown={startDrag}
        onPointerMove={(e) => { e.stopPropagation(); handleJoystickMove(e); }}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="w-4 h-4 rounded-full bg-[#555] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div 
          className="w-16 h-16 bg-[#FBC02D] rounded-full shadow-lg absolute transition-none"
          style={{ 
            top: '50%', 
            left: '50%', 
            transform: `translate(calc(-50% + ${joystickPos.x}px), calc(-50% + ${joystickPos.y}px))`
          }}
        />
      </div>

      {/* RIGHT: Big Combat Actions */}
      <div className="flex flex-col gap-3 pointer-events-auto">
        {/* Configure Bot shortcut */}
        <button
          onClick={onOpenConfig}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-12 h-12 self-end flex items-center justify-center rounded-sm bg-[#121212] border border-[#333] text-white/70 hover:text-white transition-all active:scale-95"
          title="Configure Bot"
        >
          <Settings size={20} />
        </button>

        {/* Weapon Trigger Button */}
        <button
          onMouseDown={(e) => { e.stopPropagation(); handleWeaponPress(true); }}
          onMouseUp={(e) => { e.stopPropagation(); handleWeaponPress(false); }}
          onMouseLeave={(e) => { e.stopPropagation(); handleWeaponPress(false); }}
          onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); handleWeaponPress(true); }}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); handleWeaponPress(false); }}
          disabled={battleStatus !== 'battle'}
          className={cn(
            "w-24 h-24 rounded-sm flex flex-col items-center justify-center border font-mono text-[10px] font-bold uppercase tracking-wider transition-all select-none active:scale-90",
            botState.weaponActive || virtualInput.action
              ? "bg-[#D32F2F]/20 border-[#D32F2F] text-[#D32F2F] animate-pulse"
              : battleStatus === 'battle'
                ? "bg-[#121212] border-[#444] text-white/80 hover:bg-[#222] hover:border-[#666]"
                : "bg-[#121212] border-[#222] text-white/20 cursor-not-allowed"
          )}
          title="Trigger Weapon"
        >
          <Zap size={32} className={cn("mb-1", (botState.weaponActive || virtualInput.action) ? "text-[#D32F2F]" : "text-white/40")} />
          <span>{(botState.weaponActive || virtualInput.action) ? "ACTIVE" : "FIRE"}</span>
        </button>
      </div>
    </div>
  );
};

