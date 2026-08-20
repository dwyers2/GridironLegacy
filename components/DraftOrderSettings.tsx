import React, { useEffect, useMemo, useState } from 'react';
import { GripVertical, MoveDown, MoveUp, RotateCcw, Save } from 'lucide-react';

interface DraftOrderItem {
  teamKey: string;
  managerName: string;
  draftSlot: number;
}

interface Props {
  teams: DraftOrderItem[];
  savedOrder?: string[] | null;
  onSave: (nextOrder: string[] | null) => Promise<void> | void;
}

function buildOrderedTeams(teams: DraftOrderItem[], savedOrder?: string[] | null) {
  if (!savedOrder || savedOrder.length === 0) return [...teams].sort((a, b) => a.draftSlot - b.draftSlot);
  const byName = new Map(teams.map(team => [team.managerName, team]));
  const ordered: DraftOrderItem[] = [];
  for (const managerName of savedOrder) {
    const team = byName.get(managerName);
    if (team) {
      ordered.push(team);
      byName.delete(managerName);
    }
  }
  const leftovers = [...byName.values()].sort((a, b) => a.draftSlot - b.draftSlot);
  return [...ordered, ...leftovers];
}

export default function DraftOrderSettings({ teams, savedOrder, onSave }: Props) {
  const defaultTeams = useMemo(() => [...teams].sort((a, b) => a.draftSlot - b.draftSlot), [teams]);
  const [orderedTeams, setOrderedTeams] = useState<DraftOrderItem[]>(() => buildOrderedTeams(teams, savedOrder));
  const [draggingTeamKey, setDraggingTeamKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrderedTeams(buildOrderedTeams(teams, savedOrder));
  }, [teams, savedOrder]);

  const hasCustomOrder = orderedTeams.some((team, index) => team.managerName !== defaultTeams[index]?.managerName);

  const moveTeam = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || toIndex < 0 || toIndex >= orderedTeams.length || fromIndex === toIndex) return;
    setOrderedTeams(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const saveOrder = async (nextOrder: string[] | null) => {
    setSaving(true);
    try {
      await onSave(nextOrder);
    } finally {
      setSaving(false);
    }
  };

  if (teams.length === 0) {
    return (
      <div style={{ padding: '1rem 0', color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif", fontSize: '0.8rem' }}>
        Draft order will appear here after the latest league teams are available.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          New Draft Board Order
        </div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
          Drag managers into the order you want shown on the New Draft board. If you leave this alone, the latest recorded draft slot order is used.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {orderedTeams.map((team, index) => (
          <div
            key={team.teamKey}
            draggable
            onDragStart={() => setDraggingTeamKey(team.teamKey)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const fromIndex = orderedTeams.findIndex(item => item.teamKey === draggingTeamKey);
              moveTeam(fromIndex, index);
              setDraggingTeamKey(null);
            }}
            onDragEnd={() => setDraggingTeamKey(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              gap: '0.8rem',
              padding: '0.8rem 0.95rem',
              borderRadius: '8px',
              border: draggingTeamKey === team.teamKey ? '1px solid rgba(212,160,23,0.4)' : '1px solid var(--border)',
              background: draggingTeamKey === team.teamKey ? 'rgba(212,160,23,0.08)' : 'var(--surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
              <GripVertical size={16} />
              <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', width: '20px', textAlign: 'center' }}>
                {index + 1}
              </span>
            </div>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.12em', color: 'var(--gold)', textTransform: 'uppercase' }}>
                {team.managerName}
              </div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Latest slot {team.draftSlot}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                onClick={() => moveTeam(index, index - 1)}
                disabled={index === 0}
                style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: index === 0 ? 'var(--text-muted)' : 'var(--text-primary)', borderRadius: '6px', padding: '0.35rem', cursor: index === 0 ? 'not-allowed' : 'pointer' }}
              >
                <MoveUp size={14} />
              </button>
              <button
                onClick={() => moveTeam(index, index + 1)}
                disabled={index === orderedTeams.length - 1}
                style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: index === orderedTeams.length - 1 ? 'var(--text-muted)' : 'var(--text-primary)', borderRadius: '6px', padding: '0.35rem', cursor: index === orderedTeams.length - 1 ? 'not-allowed' : 'pointer' }}
              >
                <MoveDown size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => saveOrder(orderedTeams.map(team => team.managerName))}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.55rem 0.9rem',
            borderRadius: '7px',
            border: '1px solid rgba(212,160,23,0.25)',
            background: 'var(--gold)',
            color: '#0C0F16',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '0.76rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          <Save size={14} />
          Save Order
        </button>
        <button
          onClick={() => {
            setOrderedTeams(defaultTeams);
            void saveOrder(null);
          }}
          disabled={saving || !hasCustomOrder}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.55rem 0.9rem',
            borderRadius: '7px',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: saving || !hasCustomOrder ? 'var(--text-muted)' : 'var(--text-primary)',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '0.76rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: saving || !hasCustomOrder ? 'not-allowed' : 'pointer',
          }}
        >
          <RotateCcw size={14} />
          Reset Default
        </button>
      </div>
    </div>
  );
}
