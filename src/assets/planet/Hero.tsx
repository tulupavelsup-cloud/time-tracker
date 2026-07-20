/**
 * Чувачок — общий герой планеты. Рисованный SVG, без эмодзи.
 * working=true — покачивается и машет инструментом; иначе стоит/отдыхает.
 */

import { motion } from 'framer-motion';

export type HeroTool = 'none' | 'pickaxe' | 'wrench' | 'hammer' | 'pen';

interface HeroProps {
  size?: number;
  working?: boolean;
  tool?: HeroTool;
  /** Сидит (за столом / отдыхает) */
  sitting?: boolean;
}

function Tool({ tool }: { tool: HeroTool }) {
  switch (tool) {
    case 'pickaxe':
      return (
        <g>
          <line x1="0" y1="0" x2="9" y2="-11" stroke="#8a5a33" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 -14 Q 10 -17 15 -12" stroke="#9aa3ad" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'wrench':
      return (
        <g>
          <line x1="0" y1="0" x2="8" y2="-9" stroke="#b7c0cc" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="9.5" cy="-10.5" r="3" fill="none" stroke="#b7c0cc" strokeWidth="2" />
        </g>
      );
    case 'hammer':
      return (
        <g>
          <line x1="0" y1="0" x2="8" y2="-10" stroke="#8a5a33" strokeWidth="2" strokeLinecap="round" />
          <rect x="4.5" y="-14.5" width="8" height="5" rx="1" fill="#6b7280" />
        </g>
      );
    case 'pen':
      return <line x1="0" y1="0" x2="6" y2="-6" stroke="#e8c25a" strokeWidth="2" strokeLinecap="round" />;
    default:
      return null;
  }
}

export function Hero({ size = 34, working = false, tool = 'none', sitting = false }: HeroProps) {
  return (
    <svg
      width={size}
      height={size * 1.35}
      viewBox="0 0 40 54"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      <motion.g
        animate={working ? { y: [0, -1.6, 0] } : { y: 0 }}
        transition={working ? { repeat: Infinity, duration: 0.75, ease: 'easeInOut' } : undefined}
      >
        {/* Ноги */}
        {sitting ? (
          <path d="M15 40 h10 v5 h4" stroke="#2f3f57" strokeWidth="5" fill="none" strokeLinecap="round" />
        ) : (
          <>
            <line x1="16" y1="38" x2="15" y2="50" stroke="#2f3f57" strokeWidth="5" strokeLinecap="round" />
            <line x1="24" y1="38" x2="25" y2="50" stroke="#2f3f57" strokeWidth="5" strokeLinecap="round" />
          </>
        )}
        {/* Тело — комбинезон */}
        <rect x="12" y="20" width="16" height="20" rx="6" fill="#3d6b4f" />
        <rect x="12" y="26" width="16" height="6" fill="#e8c25a" opacity="0.9" />
        {/* Голова */}
        <circle cx="20" cy="11" r="7.5" fill="#f2c396" />
        <path d="M12.5 9 a7.5 7.5 0 0 1 15 0 v-1.5 a7.5 6 0 0 0 -15 0 Z" fill="#5b4632" />
        {/* Глаза: открыты в работе, прикрыты в отдыхе */}
        {working ? (
          <>
            <circle cx="17.4" cy="11.5" r="1" fill="#243041" />
            <circle cx="22.6" cy="11.5" r="1" fill="#243041" />
          </>
        ) : (
          <>
            <path d="M16.4 12 h2" stroke="#243041" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M21.6 12 h2" stroke="#243041" strokeWidth="1.2" strokeLinecap="round" />
          </>
        )}
        {/* Левая рука */}
        <line x1="14" y1="24" x2="9" y2="32" stroke="#3d6b4f" strokeWidth="4.5" strokeLinecap="round" />
        {/* Правая рука с инструментом — качается при работе */}
        <g transform="translate(26,24)">
          <motion.g
            animate={working ? { rotate: [-38, 22, -38] } : { rotate: 10 }}
            transition={working ? { repeat: Infinity, duration: 0.75, ease: 'easeInOut' } : undefined}
          >
            <line x1="0" y1="0" x2="5" y2="7" stroke="#3d6b4f" strokeWidth="4.5" strokeLinecap="round" />
            <g transform="translate(5,7)">
              <Tool tool={tool} />
            </g>
          </motion.g>
        </g>
      </motion.g>
    </svg>
  );
}
