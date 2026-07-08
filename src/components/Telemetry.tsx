import React, { useEffect, useRef } from 'react';
import { TelemetryEvent } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const Telemetry = ({ logs }: { logs: TelemetryEvent[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="absolute bottom-24 right-4 sm:bottom-6 sm:right-6 w-64 sm:w-80 h-48 sm:h-64 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl flex flex-col pointer-events-auto z-10 shadow-lg overflow-hidden">
      <div className="border-b border-white/10 p-2 sm:p-3 bg-white/5">
        <h3 className="font-mono text-xs font-bold text-white/70 tracking-widest uppercase flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
          Live Telemetry
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2" ref={scrollRef}>
        <AnimatePresence initial={false}>
          {logs.map((log) => {
            const time = new Date(log.timestamp).toISOString().substring(11, 19);
            return (
              <motion.div 
                key={log.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "font-mono text-[10px] sm:text-xs leading-relaxed break-words",
                  log.type === 'info' && "text-white/60",
                  log.type === 'combat' && "text-[#FF6B00]",
                  log.type === 'warning' && "text-[#FF6B00]",
                  log.type === 'critical' && "text-[#FF003C] font-bold"
                )}
              >
                <span className="opacity-50 mr-2">[{time}]</span>
                {log.message}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
