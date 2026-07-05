import { useEffect, useState, useRef } from 'react';
import type { GraphCard, HAHistoryPoint } from '../../../types';
import { fetchHistory, generateDemoHistory } from '../../../services/haHistoryApi';
import { useDemoMode } from '../../../contexts/DemoModeContext';
import { useSimulationMode } from '../../../contexts/SimulationModeContext';
import { useTranslation } from '../../../contexts/LanguageContext';
import CardShell from './CardShell';

interface Props {
  card: GraphCard;
}

export default function GraphCardView({ card }: Props) {
  const { demoMode } = useDemoMode();
  const { simulationMode } = useSimulationMode();
  const t = useTranslation();
  const [points, setPoints] = useState<HAHistoryPoint[]>([]);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (demoMode || simulationMode) {
      setPoints(generateDemoHistory(card.period));
      setError(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchHistory(card.entityId, card.period);
        if (!cancelled) {
          setPoints(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    load();
    const interval = setInterval(load, (card.refreshInterval ?? 300) * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [card.entityId, card.period, card.refreshInterval, demoMode, simulationMode]);

  // Parse numeric values and timestamps
  const numericPoints = points
    .map(p => ({ value: parseFloat(p.state), time: new Date(p.last_changed).getTime() }))
    .filter(p => !isNaN(p.value));

  const renderGraph = () => {
    if (error) return <span className="graph-card-error">{t('modal.failedToLoad')}</span>;
    if (numericPoints.length < 2) return <span className="graph-card-loading">{t('common.loading')}</span>;

    const values = numericPoints.map(p => p.value);
    const times = numericPoints.map(p => p.time);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const valRange = maxVal - minVal || 1;
    const timeRange = maxTime - minTime || 1;

    const padX = 40;
    const padY = 20;
    const w = 300;
    const h = 120;
    const graphW = w - padX;
    const graphH = h - padY * 2;

    const polylinePoints = numericPoints
      .map(p => {
        const x = padX + ((p.time - minTime) / timeRange) * graphW;
        const y = padY + graphH - ((p.value - minVal) / valRange) * graphH;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" ref={containerRef as never}>
        {/* Grid lines */}
        <line x1={padX} y1={padY} x2={padX} y2={h - padY} stroke="var(--border)" strokeWidth="0.5" />
        <line x1={padX} y1={h - padY} x2={w} y2={h - padY} stroke="var(--border)" strokeWidth="0.5" />
        {/* Mid grid line */}
        <line x1={padX} y1={padY + graphH / 2} x2={w} y2={padY + graphH / 2} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="4 4" />

        {/* Labels */}
        <text x={padX - 4} y={padY + 4} textAnchor="end" fill="var(--muted)" fontSize="8">{maxVal.toFixed(1)}</text>
        <text x={padX - 4} y={h - padY + 4} textAnchor="end" fill="var(--muted)" fontSize="8">{minVal.toFixed(1)}</text>

        {/* Data line */}
        <polyline points={polylinePoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <CardShell title={card.showTitle !== false ? card.title : ''}>
      <div className="graph-card-container">
        {renderGraph()}
      </div>
    </CardShell>
  );
}
