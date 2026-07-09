import React, { useEffect, useRef, useState } from 'react';
import { TelemetryEvent } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';

export const Telemetry = ({ logs }: { logs: TelemetryEvent[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    if (scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isCollapsed]);

  return (
    <div 
      className={cn(
        "absolute right-4 bottom-24 sm:bottom-6 sm:right-6 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl flex flex-col pointer-events-auto z-10 shadow-2xl overflow-hidden transition-all duration-300",
        isCollapsed ? "w-40 sm:w-48 h-9" : "w-64 sm:w-80 h-48 sm:h-64"
      )}
    >
      {/* Telemetry Header / Toggle Button */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/5 text-left font-mono text-[10px] font-bold text-white/70 hover:text-white tracking-widest uppercase transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Terminal size={12} className="text-[#00E5FF]" />
          <span>{isCollapsed ? "TELEMETRY" : "LIVE FEED"}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {isCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {/* Logs stream body */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5" 
            ref={scrollRef}
          >
            {logs.map((log) => {
              const time = new Date(log.timestamp).toISOString().substring(11, 19);
              return (
                <div 
                  key={log.id}
                  className={cn(
                    "font-mono text-[9px] sm:text-xs leading-relaxed break-words",
                    log.type === 'info' && "text-white/60",
                    log.type === 'combat' && "text-orange-400 font-medium",
                    log.type === 'warning' && "text-yellow-400 font-medium",
                    log.type === 'critical' && "text-red-500 font-bold"
                  )}
                >
                  <span className="opacity-30 mr-1.5">[{time}]</span>
                  {log.message}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
