import React, { useState } from 'react';
import { ManagerOwnershipData, ManagerTendency, FetchProgress } from '../types';
import { Users, Trophy, TrendingUp, Sparkles, Heart, Filter, RefreshCw } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

interface ManagerInsightsProps {
  ownershipData: ManagerOwnershipData[];
  tendencies: ManagerTendency[];
  loading: boolean;
  fetchProgress?: FetchProgress | null;
  onRefreshTendency?: (managerId: string) => void;
  refreshingManagers?: Set<string>;
  loadingManagerIds?: Set<string>;
  tab?: 'ownership' | 'tendencies';
  myManagerName?: string | null;
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  QB:  { background: 'rgba(239,68,68,0.12)',  color: '#F87171', border: '1px solid rgba(239,68,68,0.28)' },
  RB:  { background: 'rgba(34,197,94,0.12)',  color: '#4ADE80', border: '1px solid rgba(34,197,94,0.28)' },
  WR:  { background: 'rgba(59,130,246,0.12)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.28)' },
  TE:  { background: 'rgba(212,160,23,0.12)', color: '#D4A017', border: '1px solid rgba(212,160,23,0.3)' },
  K:   { background: 'rgba(168,85,247,0.12)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.28)' },
  DEF: { background: 'rgba(100,116,139,0.12)',color: '#94A3B8', border: '1px solid rgba(100,116,139,0.28)' },
};

function positionStyle(pos: string): React.CSSProperties {
  return POSITION_STYLES[pos] || { background: 'rgba(100,116,139,0.1)', color: '#94A3B8', border: '1px solid rgba(100,116,139,0.2)' };
}

const ManagerInsights: React.FC<ManagerInsightsProps> = ({
  ownershipData,
  tendencies,
  loading,
  fetchProgress,
  onRefreshTendency,
  refreshingManagers,
  loadingManagerIds,
  tab,
  myManagerName,
}) => {
  const sortedOwnership = myManagerName
    ? [...ownershipData].sort((a, b) => (b.managerName === myManagerName ? 1 : 0) - (a.managerName === myManagerName ? 1 : 0))
    : ownershipData;
  const sortedTendencies = myManagerName
    ? [...tendencies].sort((a, b) => (b.managerName === myManagerName ? 1 : 0) - (a.managerName === myManagerName ? 1 : 0))
    : tendencies;
  const [activeTab, setActiveTab] = useState<'ownership' | 'tendencies'>('ownership');
  const [ownershipFilter, setOwnershipFilter] = useState(3);
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '52px', height: '52px', margin: '0 auto 1.25rem',
            border: '3px solid rgba(212,160,23,0.15)',
            borderTop: '3px solid var(--gold)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            fontSize: '0.875rem', letterSpacing: '0.14em',
            color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0,
          }}>
            Analyzing Manager Histories...
          </p>
          {fetchProgress && (
            <div style={{ marginTop: '1.25rem' }}>
              <p style={{ color: 'var(--gold)', fontFamily: "'Outfit', sans-serif", fontSize: '0.875rem', margin: '0 0 0.5rem' }}>
                Fetching {fetchProgress.season} season...
              </p>
              <div style={{
                width: '240px', height: '4px',
                background: 'rgba(212,160,23,0.1)', borderRadius: '2px',
                margin: '0 auto', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', background: 'var(--gold)', borderRadius: '2px',
                  transition: 'width 0.3s',
                  width: `${(fetchProgress.current / fetchProgress.total) * 100}%`,
                }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontFamily: "'Outfit', sans-serif" }}>
                {fetchProgress.current} of {fetchProgress.total} seasons
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalSeasons = new Set(sortedOwnership.flatMap(m => m.seasonsTracked || [])).size;

  const ownershipContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Filter Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '0.875rem 1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
          <Filter size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            fontSize: '0.7rem', letterSpacing: '0.14em',
            color: 'var(--text-secondary)', textTransform: 'uppercase',
          }}>
            Min. Ownership:
          </span>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                onClick={() => setOwnershipFilter(num)}
                style={{
                  padding: '0.3rem 0.7rem',
                  borderRadius: '4px',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '0.8rem', letterSpacing: '0.06em',
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: ownershipFilter === num ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                  color: ownershipFilter === num ? '#0C0F16' : 'var(--text-muted)',
                  border: ownershipFilter === num ? '1px solid var(--gold)' : '1px solid var(--border-muted)',
                }}
              >
                {num}+
              </button>
            ))}
          </div>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
          Showing players owned {ownershipFilter}+ times
        </span>
      </div>

      {/* Manager Cards */}
      {sortedOwnership.map((manager) => {
        const filteredPlayers = manager.players.filter(p => p.timesOwned >= ownershipFilter);
        if (filteredPlayers.length === 0) return null;

        return (
          <div
            key={manager.managerId}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', overflow: 'hidden',
            }}
          >
            {/* Card Header */}
            <div style={{
              padding: '1.5rem',
              background: 'linear-gradient(135deg, rgba(212,160,23,0.06) 0%, transparent 60%)',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '52px', height: '52px',
                  background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)',
                  borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Users style={{ color: 'var(--gold)' }} size={24} />
                </div>
                <div>
                  <h2 style={{
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    fontSize: '1.4rem', letterSpacing: '0.04em',
                    color: 'var(--text-primary)', margin: 0,
                  }}>
                    {manager.managerName}
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif", fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
                    {filteredPlayers.length} players with {ownershipFilter}+ seasons
                  </p>
                  {manager.seasonsTracked && manager.seasonsTracked.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      {manager.seasonsTracked.map(season => (
                        <span key={season} style={{
                          fontSize: '0.6rem', padding: '0.15rem 0.4rem',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)',
                          borderRadius: '3px', color: 'var(--text-muted)', fontFamily: 'monospace',
                        }}>
                          {season}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: '2rem', color: 'var(--gold)', lineHeight: 1 }}>
                  {filteredPlayers.reduce((sum, p) => sum + p.timesOwned, 0)}
                </div>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '0.6rem', letterSpacing: '0.16em',
                  color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '0.2rem',
                }}>
                  Total Ownerships
                </div>
              </div>
            </div>

            {/* Table — desktop / card list — mobile */}
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredPlayers
                  .sort((a, b) => b.timesOwned - a.timesOwned)
                  .map((player, index) => (
                    <div key={player.playerId} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid rgba(212,160,23,0.05)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: '34px' }}>
                        {index < 3 && <Trophy size={12} style={{ color: index === 0 ? '#FBBF24' : index === 1 ? '#94A3B8' : '#CD7F32' }} />}
                        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          #{index + 1}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {player.playerName}
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.2rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '3px', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', ...positionStyle(player.position) }}>
                            {player.position}
                          </span>
                          {player.team && <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{player.team}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          {player.timesOwned > 1 && <Heart size={11} style={{ color: 'var(--red)' }} />}
                          <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: '1.1rem', color: 'var(--green)' }}>
                            {player.timesOwned}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                          {player.seasons.sort((a, b) => Number(b) - Number(a)).slice(0, 3).map(s => (
                            <span key={s} style={{ padding: '0.1rem 0.3rem', background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: '3px', fontSize: '0.55rem', fontWeight: 700, color: 'var(--gold)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      {['Rank', 'Player', 'Position', 'Team', 'Times Owned', 'Seasons'].map((h, i) => (
                        <th key={h} style={{
                          padding: '0.75rem 1.25rem',
                          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                          fontSize: '0.6rem', letterSpacing: '0.18em', textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          textAlign: i === 0 || i === 1 || i === 5 ? 'left' : 'center',
                          borderBottom: '1px solid var(--border)',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers
                      .sort((a, b) => b.timesOwned - a.timesOwned)
                      .map((player, index) => (
                        <tr
                          key={player.playerId}
                          style={{ borderBottom: '1px solid rgba(212,160,23,0.05)', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,160,23,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '0.875rem 1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {index < 3 && (
                                <Trophy
                                  size={13}
                                  style={{ color: index === 0 ? '#FBBF24' : index === 1 ? '#94A3B8' : '#CD7F32' }}
                                />
                              )}
                              <span style={{
                                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                                fontSize: '0.8rem', letterSpacing: '0.06em', color: 'var(--text-muted)',
                              }}>#{index + 1}</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem' }}>
                            <div style={{
                              fontFamily: "'Outfit', sans-serif", fontWeight: 600,
                              color: 'var(--text-primary)', fontSize: '0.875rem',
                            }}>
                              {player.playerName}
                            </div>
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '0.2rem 0.6rem',
                              borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em',
                              ...positionStyle(player.position),
                            }}>
                              {player.position}
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'center' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {player.team}
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                              {player.timesOwned > 1 && <Heart size={13} style={{ color: 'var(--red)' }} />}
                              <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: '1.2rem', color: 'var(--green)' }}>
                                {player.timesOwned}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                              {player.seasons
                                .sort((a, b) => Number(b) - Number(a))
                                .map((season) => (
                                  <span key={season} style={{
                                    padding: '0.15rem 0.45rem',
                                    background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)',
                                    borderRadius: '3px', fontSize: '0.6rem', fontWeight: 700,
                                    color: 'var(--gold)',
                                    fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em',
                                  }}>
                                    {season}
                                  </span>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {ownershipData.every(m => m.players.filter(p => p.timesOwned >= ownershipFilter).length === 0) && (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '8px',
        }}>
          <Users style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.3 }} size={44} />
          <p style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif", margin: '0 0 0.5rem' }}>
            No players found with {ownershipFilter}+ seasons of ownership.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: "'Outfit', sans-serif", margin: 0 }}>
            Try lowering the minimum ownership filter.
          </p>
        </div>
      )}
    </div>
  );

  // Render cards for every manager in ownershipData, regardless of whether their tendency is ready
  const tendencyMap = new Map<string, ManagerTendency>(sortedTendencies.map(t => [t.managerId, t]));
  const tendenciesContent = (
    <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))' }}>
      {sortedOwnership.map((manager) => {
        const tendency = tendencyMap.get(manager.managerId);
        const isCardLoading = loadingManagerIds?.has(manager.managerId) || (!tendency && (loadingManagerIds?.size ?? 0) > 0);
        const managerId = manager.managerId;
        const managerName = tendency?.managerName ?? manager.managerName;

        return (
          <div
            key={managerId}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '1.75rem',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,160,23,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.5rem' }}>
              <div style={{
                padding: '0.6rem', background: 'var(--gold-dim)',
                border: '1px solid rgba(212,160,23,0.2)', borderRadius: '8px', flexShrink: 0,
              }}>
                <Sparkles style={{ color: 'var(--gold)' }} size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '1.2rem', letterSpacing: '0.04em',
                  color: 'var(--text-primary)', margin: 0,
                }}>
                  {managerName}
                </h3>
                <p style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: '0.6rem', letterSpacing: '0.18em',
                  color: isCardLoading ? 'var(--gold)' : 'var(--text-muted)',
                  textTransform: 'uppercase', margin: '0.2rem 0 0',
                }}>
                  {isCardLoading ? 'Generating analysis...' : 'AI Analysis'}
                </p>
              </div>
              {onRefreshTendency && tendency && !isCardLoading && (
                <button
                  onClick={() => onRefreshTendency(managerId)}
                  disabled={refreshingManagers?.has(managerId)}
                  style={{
                    padding: '0.4rem', borderRadius: '6px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)',
                    cursor: refreshingManagers?.has(managerId) ? 'not-allowed' : 'pointer',
                    opacity: refreshingManagers?.has(managerId) ? 0.4 : 1,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (!refreshingManagers?.has(managerId)) {
                      e.currentTarget.style.background = 'var(--gold-dim)';
                      e.currentTarget.style.borderColor = 'rgba(212,160,23,0.2)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.borderColor = 'var(--border-muted)';
                  }}
                  title="Refresh AI summary"
                >
                  <RefreshCw
                    size={14}
                    style={{
                      color: 'var(--text-muted)',
                      animation: refreshingManagers?.has(managerId) ? 'spin 1s linear infinite' : 'none',
                    }}
                  />
                </button>
              )}
            </div>

            {isCardLoading ? (
              /* Loading skeleton */
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  {[0, 1].map(i => (
                    <div key={i} style={{
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      borderRadius: '6px', padding: '1rem', minHeight: '72px',
                    }}>
                      <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', marginBottom: '0.75rem', width: '60%' }} />
                      <div style={{ height: '24px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', width: '45%' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ height: '24px', width: '48px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} />
                  ))}
                </div>
                <div style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '1.125rem 1.25rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', minHeight: '68px',
                }}>
                  <div style={{
                    width: '16px', height: '16px', flexShrink: 0,
                    border: '2px solid rgba(212,160,23,0.2)',
                    borderTop: '2px solid var(--gold)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  <span style={{
                    color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif",
                    fontSize: '0.8rem', fontStyle: 'italic',
                  }}>Analyzing patterns...</span>
                </div>
              </div>
            ) : tendency ? (
              <>
                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '1rem',
                  }}>
                    <div style={{
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      fontSize: '0.6rem', letterSpacing: '0.18em',
                      color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem',
                    }}>
                      Loyalty Score
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Heart style={{ color: 'var(--red)' }} size={14} />
                      <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                        {tendency.loyaltyScore}%
                      </span>
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '1rem',
                  }}>
                    <div style={{
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      fontSize: '0.6rem', letterSpacing: '0.18em',
                      color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem',
                    }}>
                      Top Position
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <TrendingUp style={{ color: 'var(--green)' }} size={14} />
                      <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                        {tendency.topPositions?.[0] || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Position preferences */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    fontSize: '0.6rem', letterSpacing: '0.18em',
                    color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.6rem',
                  }}>
                    Position Preferences
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {(tendency.topPositions ?? []).map((pos, i) => (
                      <span
                        key={pos}
                        style={{
                          padding: '0.25rem 0.65rem', borderRadius: '4px',
                          fontSize: '0.75rem', fontWeight: 700,
                          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em',
                          ...(i === 0
                            ? { background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.25)', color: 'var(--gold)' }
                            : { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)', color: 'var(--text-secondary)' }),
                        }}
                      >
                        {pos}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Analysis quote */}
                <div style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '1.125rem 1.25rem',
                }}>
                  <p style={{
                    color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif",
                    fontStyle: 'italic', lineHeight: 1.65, fontSize: '0.875rem', margin: 0, fontWeight: 400,
                  }}>"{tendency.analysis}"</p>
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  // Controlled (embedded) mode: render only the specified tab's content
  if (tab) {
    return tab === 'ownership' ? ownershipContent : tendenciesContent;
  }

  // Standalone mode: full component with header and internal tabs
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: "'Cinzel', serif", fontWeight: 900,
          fontSize: '2.5rem', letterSpacing: '0.04em',
          color: 'var(--text-primary)', margin: '0 0 0.25rem',
        }}>
          MANAGER INSIGHTS
        </h1>
        <p style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          fontSize: '0.75rem', letterSpacing: '0.18em',
          color: 'var(--gold)', textTransform: 'uppercase', margin: 0,
        }}>
          Deep Dive into Ownership Patterns &amp; Tendencies
          {totalSeasons > 0 && (
            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
              • {totalSeasons} seasons analyzed
            </span>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        {([
          { id: 'ownership' as const, icon: <Users size={15} />, label: 'Player Ownership' },
          { id: 'tendencies' as const, icon: <Sparkles size={15} />, label: 'AI Tendencies' },
        ]).map(({ id, icon, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.75rem 1.25rem',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${active ? 'var(--gold)' : 'transparent'}`,
                marginBottom: '-1px',
                color: active ? 'var(--gold)' : 'var(--text-muted)',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.14em',
                textTransform: 'uppercase', transition: 'color 0.2s, border-color 0.2s',
              }}
            >
              {icon}{label}
            </button>
          );
        })}
      </div>

      {activeTab === 'ownership' ? ownershipContent : tendenciesContent}
    </div>
  );
};

export default ManagerInsights;
