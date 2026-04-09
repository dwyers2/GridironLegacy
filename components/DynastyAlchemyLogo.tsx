import React from 'react';
import logoSrc from './DynastyAlchemyLogo.svg';

interface Props {
  /** Height in pixels. Width scales proportionally (1:1 square). */
  size?: number;
  /** Show text beside logo (default false — logo mark only) */
  withText?: boolean;
}

export default function DynastyAlchemyLogo({ size = 80, withText = false }: Props) {
  const mark = (
    <img
      src={logoSrc}
      alt="Dynasty Alchemy"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );

  if (!withText) return mark;

  const dynastyFontSize = Math.round(size * 0.4);
  const alchemyFontSize = Math.round(size * 0.32);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
      <span style={{
        fontFamily: "'Cinzel', serif",
        fontWeight: 900,
        letterSpacing: '0.04em',
        fontSize: dynastyFontSize,
        color: 'var(--text-primary, #F5F0E8)',
      }}>
        DYNASTY
      </span>
      <span style={{
        fontFamily: "'Cinzel', serif",
        fontWeight: 700,
        letterSpacing: '0.18em',
        fontSize: alchemyFontSize,
        color: 'var(--gold, #D4A017)',
      }}>
        ALCHEMY
      </span>
    </div>
  );
}
