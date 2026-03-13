import React, { useState, useEffect, useRef } from 'react';
import { KeeperSummary, KeeperEntry } from '../types';
import { Loader2, Star, Shield, Plus, X } from 'lucide-react';

interface Props {
  summary: KeeperSummary | null;
  loading: boolean;
  leagueKey: string;
  onRefresh: () => void;
}

const BACKEND = 'http://localhost:3001/api';

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  QB:  { background: 'rgba(239,68,68,0.12)',  color: '#F87171', border: '1px solid rgba(239,68,68,0.28)' },
  RB:  { background: 'rgba(34,197,94,0.12)',  color: '#4ADE80', border: '1px solid rgba(34,197,94,0.28)' },
  WR:  { background: 'rgba(59,130,246,0.12)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.28)' },
  TE:  { background: 'rgba(212,160,23,0.12)', color: '#D4A017', border: '1px solid rgba(212,160,23,0.3)' },
  K:   { background: 'rgba(168,85,247,0.12)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.28)' },
  DEF: { background: 'rgba(100,116,139,0.12)',color: '#94A3B8', border: '1px solid rgba(100,116,139,0.28)' },
};

function posStyle(pos: string): React.CSSProperties {
  return POSITION_STYLES[pos] || { background: 'rgba(100,116,139,0.1)', color: '#94A3B8', border: '1px solid rgba(100,116,139,0.2)' };
}

function StreakBadge({ years }: { years: number }) {
  if (years <= 1) return null;

  const tier = years >= 5 ? 'legend' : years >= 3 ? 'veteran' : 'rising';
  const styles: Record<string, React.CSSProperties> = {
    rising:  { background: 'rgba(59,130,246,0.12)',  color: '#60A5FA', border: '1px solid rgba(59,130,246,0.3)' },
    veteran: { background: 'rgba(212,160,23,0.14)',  color: '#D4A017', border: '1px solid rgba(212,160,23,0.4)' },
    legend:  { background: 'rgba(239,68,68,0.12)',   color: '#F87171', border: '1px solid rgba(239,68,68,0.35)' },
  };

  const starCount = Math.min(years, 3);

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.15rem',
      fontSize: '0.55rem', fontWeight: 700,
      padding: '0.1rem 0.4rem', borderRadius: '3px',
      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em',
      textTransform: 'uppercase',
      flexShrink: 0,
      ...styles[tier],
    }}>
      {Array.from({ length: starCount }).map((_, i) => (
        <Star key={i} size={8} style={{ fill: 'currentColor' }} />
      ))}
    </span>
  );
}

interface PlayerResult {
  player_key: string;
  player_name: string;
  position: string;
  nfl_team: string;
}

function PlayerSearchInput({ onSelect, onCancel }: {
  onSelect: (p: PlayerResult) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 2) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND}/players/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.players || []);
        setActiveIndex(-1);
      } catch { setResults([]); }
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onCancel(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && activeIndex >= 0) { onSelect(results[activeIndex]); return; }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Search player..."
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--surface-2)', color: 'var(--text-primary)',
          border: '1px solid rgba(212,160,23,0.35)', borderRadius: '5px',
          padding: '0.35rem 0.6rem', fontSize: '0.78rem',
          fontFamily: "'Outfit', sans-serif", outline: 'none',
        }}
      />
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '6px', overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {results.map((p, i) => (
            <div
              key={p.player_key + i}
              onMouseDown={() => onSelect(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.45rem 0.7rem', cursor: 'pointer',
                background: i === activeIndex ? 'rgba(212,160,23,0.1)' : 'transparent',
                borderBottom: i < results.length - 1 ? '1px solid var(--border-muted)' : 'none',
              }}
            >
              <span style={{
                fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.35rem',
                borderRadius: '3px', flexShrink: 0,
                ...posStyle(p.position),
              }}>
                {p.position || '—'}
              </span>
              <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                {p.player_name}
              </span>
              {p.nfl_team && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {p.nfl_team}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KeeperRow({ keeper, onRemove }: { keeper: KeeperEntry; onRemove?: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.5rem 0',
      borderBottom: '1px solid var(--border-muted)',
    }}>
      <span style={{
        fontSize: '0.58rem', fontWeight: 700,
        padding: '0.12rem 0.4rem', borderRadius: '3px',
        fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em',
        flexShrink: 0,
        ...posStyle(keeper.position),
      }}>
        {keeper.position || '—'}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          color: 'var(--text-primary)',
          fontFamily: "'Outfit', sans-serif",
          fontSize: '0.82rem', fontWeight: 500,
          display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {keeper.playerName}
        </span>
        {keeper.nflTeam && (
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {keeper.nflTeam}
          </span>
        )}
      </div>

      <StreakBadge years={keeper.consecutiveYears} />

      {keeper.isManual ? (
        <span style={{
          fontSize: '0.6rem', fontWeight: 700,
          padding: '0.15rem 0.5rem', borderRadius: '3px',
          background: 'rgba(100,116,139,0.1)',
          border: '1px solid rgba(100,116,139,0.3)',
          color: 'var(--text-muted)',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em',
          flexShrink: 0,
        }}>
          MANUAL
        </span>
      ) : (
        <span style={{
          fontSize: '0.6rem', fontWeight: 700,
          padding: '0.15rem 0.5rem', borderRadius: '3px',
          background: 'rgba(212,160,23,0.1)',
          border: '1px solid rgba(212,160,23,0.3)',
          color: 'var(--gold)',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em',
          flexShrink: 0,
        }}>
          RD {keeper.keeperCost}
        </span>
      )}

      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove keeper"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '0.1rem', lineHeight: 1,
            display: 'flex', alignItems: 'center', flexShrink: 0,
            opacity: 0.6,
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function ManagerCard({
  teamKey, managerName, keepers, leagueKey, onRefresh,
}: {
  teamKey: string;
  managerName: string;
  keepers: KeeperEntry[];
  leagueKey: string;
  onRefresh: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);

  const handleSelect = async (p: PlayerResult) => {
    setIsAdding(false);
    await fetch(`${BACKEND}/keepers/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leagueKey, teamKey,
        playerKey: p.player_key,
        playerName: p.player_name,
        position: p.position,
        nflTeam: p.nfl_team,
      }),
    });
    onRefresh();
  };

  const handleRemove = async (keeper: KeeperEntry) => {
    await fetch(`${BACKEND}/keepers/manual`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueKey, teamKey, playerName: keeper.playerName }),
    });
    onRefresh();
  };

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid rgba(212,160,23,0.15)',
      borderRadius: '10px',
      overflow: 'visible',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Card header */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
        borderRadius: '10px 10px 0 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--gold)',
        }}>
          {managerName}
        </span>
        <span style={{
          fontSize: '0.6rem', fontWeight: 700,
          padding: '0.15rem 0.5rem', borderRadius: '99px',
          background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)',
          color: 'var(--gold)',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em',
        }}>
          {keepers.length} {keepers.length === 1 ? 'keeper' : 'keepers'}
        </span>
      </div>

      {/* Keeper list */}
      <div style={{ padding: '0.25rem 1rem', flex: 1 }}>
        {keepers.length === 0 ? (
          <p style={{
            color: 'var(--text-muted)', fontSize: '0.75rem',
            fontStyle: 'italic', fontFamily: "'Outfit', sans-serif",
            padding: '0.75rem 0', margin: 0,
          }}>
            No keepers designated
          </p>
        ) : (
          keepers.map((k, i) => (
            <KeeperRow
              key={k.playerKey + k.playerName + i}
              keeper={k}
              onRemove={k.isManual ? () => handleRemove(k) : undefined}
            />
          ))
        )}
      </div>

      {/* Add keeper footer */}
      <div style={{
        padding: '0.5rem 1rem 0.75rem',
        borderTop: keepers.length > 0 ? '1px solid var(--border-muted)' : 'none',
        position: 'relative',
      }}>
        {isAdding ? (
          <PlayerSearchInput
            onSelect={handleSelect}
            onCancel={() => setIsAdding(false)}
          />
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              background: 'none', border: '1px dashed rgba(212,160,23,0.3)',
              borderRadius: '5px', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '0.3rem 0.6rem',
              fontSize: '0.65rem', fontWeight: 600,
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em',
              textTransform: 'uppercase', width: '100%', justifyContent: 'center',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(212,160,23,0.7)';
              e.currentTarget.style.color = 'var(--gold)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(212,160,23,0.3)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            <Plus size={12} />
            Add Keeper
          </button>
        )}
      </div>
    </div>
  );
}

export default function KeeperBoard({ summary, loading, leagueKey, onRefresh }: Props) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem', gap: '1rem' }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} size={36} />
        <p style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          fontSize: '0.75rem', letterSpacing: '0.18em',
          color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0,
        }}>
          Loading keepers...
        </p>
      </div>
    );
  }

  if (!summary || summary.managers.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem', gap: '1rem' }}>
        <Shield style={{ color: 'var(--text-muted)', opacity: 0.3 }} size={44} />
        <p style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          fontSize: '0.75rem', letterSpacing: '0.18em',
          color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0,
        }}>
          No keepers designated
        </p>
        <p style={{
          fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '320px',
          textAlign: 'center', fontFamily: "'Outfit', sans-serif", margin: 0,
        }}>
          Open the Draft History tab, expand a season, and click any pick to mark it as a keeper.
        </p>
      </div>
    );
  }

  const totalKeepers = summary.managers.reduce((n, m) => n + m.keepers.length, 0);
  const resolvedLeagueKey = summary.leagueKey || leagueKey;

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.6rem',
            background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.25)',
            borderRadius: '4px', color: 'var(--gold)',
            fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {summary.managers.length} managers
          </span>
          <span style={{
            fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.6rem',
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)',
            borderRadius: '4px', color: 'var(--text-muted)',
            fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {totalKeepers} total keepers
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>Streak:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '3px', background: 'rgba(59,130,246,0.12)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.3)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}>
            <Star size={8} style={{ fill: 'currentColor' }} />
            <Star size={8} style={{ fill: 'currentColor' }} />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '3px', background: 'rgba(212,160,23,0.14)', color: '#D4A017', border: '1px solid rgba(212,160,23,0.4)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}>
            <Star size={8} style={{ fill: 'currentColor' }} />
            <Star size={8} style={{ fill: 'currentColor' }} />
            <Star size={8} style={{ fill: 'currentColor' }} />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '3px', background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.35)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}>
            <Star size={8} style={{ fill: 'currentColor' }} />
            <Star size={8} style={{ fill: 'currentColor' }} />
            <Star size={8} style={{ fill: 'currentColor' }} />
          </span>
        </div>
      </div>

      {/* Manager grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '1rem',
      }}>
        {summary.managers.map(m => (
          <ManagerCard
            key={m.teamKey}
            teamKey={m.teamKey}
            managerName={m.managerName}
            keepers={m.keepers}
            leagueKey={resolvedLeagueKey}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  );
}
