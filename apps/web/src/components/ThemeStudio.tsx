'use client';

import { Check, Contrast, Gauge, LayoutGrid, MonitorCog, MoonStar, RotateCcw, SunMedium, Waves } from 'lucide-react';
import {
  accentOptions,
  chartPalettes,
  type ThemeSettings,
  themePresets,
} from '../lib/theme';

type ThemeStudioProps = {
  open: boolean;
  settings: ThemeSettings;
  onClose: () => void;
  onChange: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
  onReset: () => void;
};

const modeOptions = [
  { key: 'dark', label: 'Dark', icon: MoonStar },
  { key: 'light', label: 'Light', icon: SunMedium },
  { key: 'system', label: 'System', icon: MonitorCog },
] as const;

const segmented = {
  surfaceContrast: [
    { key: 'soft', label: 'Soft' },
    { key: 'balanced', label: 'Balanced' },
    { key: 'strong', label: 'Strong' },
  ],
  sidebarIntensity: [
    { key: 'soft', label: 'Low' },
    { key: 'medium', label: 'Medium' },
    { key: 'strong', label: 'High' },
  ],
  radius: [
    { key: 'compact', label: 'Compact' },
    { key: 'default', label: 'Default' },
    { key: 'rounded', label: 'Rounded' },
  ],
  density: [
    { key: 'compact', label: 'Compact' },
    { key: 'comfortable', label: 'Comfortable' },
    { key: 'spacious', label: 'Spacious' },
  ],
  fontScale: [
    { key: 'small', label: 'Small' },
    { key: 'default', label: 'Default' },
    { key: 'large', label: 'Large' },
  ],
  chartPalette: Object.entries(chartPalettes).map(([key, value]) => ({ key, label: value.label })),
} as const;

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="so-theme-section">
      <div className="so-theme-section-head">
        <div className="so-theme-section-title">{title}</div>
        {subtitle ? <div className="so-theme-section-sub">{subtitle}</div> : null}
      </div>
      {children}
    </section>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="so-segmented" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`so-segmented-item ${value === opt.key ? 'is-active' : ''}`}
          aria-pressed={value === opt.key}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function ThemeStudio({ open, settings, onClose, onChange, onReset }: ThemeStudioProps) {
  if (!open) return null;

  return (
    <div className="so-theme-popover" role="dialog" aria-modal="false" aria-label="Theme Studio">
      <div className="so-theme-popover-head">
        <div>
          <div className="so-theme-popover-title">Theme Studio</div>
          <div className="so-theme-popover-sub">Central tokens for shell, surfaces, inputs, tabs, charts, and accessibility.</div>
        </div>
        <button type="button" className="so-theme-reset" onClick={onReset}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      <Section title="Preset" subtitle="Keep the shell stable while changing the full token set.">
        <div className="so-theme-grid">
          {Object.entries(themePresets).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              className={`so-theme-preset ${settings.preset === key ? 'is-active' : ''}`}
              onClick={() => onChange('preset', key as ThemeSettings['preset'])}
            >
              <div className="so-theme-preset-swatches" aria-hidden="true">
                <span style={{ background: preset.dark.bg }} />
                <span style={{ background: preset.dark.card }} />
                <span style={{ background: preset.dark.accent }} />
              </div>
              <div className="so-theme-preset-meta">
                <span className="so-theme-preset-label">{preset.label}</span>
                <span className="so-theme-preset-desc">{preset.description}</span>
              </div>
              {settings.preset === key ? <Check size={14} className="so-theme-check" /> : null}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Appearance" subtitle="Mode, accent, and visual strength are applied live.">
        <div className="so-theme-mode-row">
          {modeOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                className={`so-theme-mode ${settings.mode === opt.key ? 'is-active' : ''}`}
                aria-pressed={settings.mode === opt.key}
                onClick={() => onChange('mode', opt.key)}
              >
                <Icon size={14} />
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="so-control-row">
          <label className="so-theme-field">
            <span>Accent color</span>
            <select value={settings.accent} onChange={(e) => onChange('accent', e.target.value as ThemeSettings['accent'])}>
              {Object.entries(accentOptions).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="so-control-stack">
          <div className="so-control-line">
            <Waves size={14} />
            <span>Surface contrast</span>
          </div>
          <SegmentedControl
            value={settings.surfaceContrast}
            options={segmented.surfaceContrast as ReadonlyArray<{ key: ThemeSettings['surfaceContrast']; label: string }>}
            onChange={(next) => onChange('surfaceContrast', next)}
          />
        </div>
      </Section>

      <Section title="Layout" subtitle="Density and geometry change the actual app shell spacing and controls.">
        <div className="so-control-stack">
          <div className="so-control-line">
            <LayoutGrid size={14} />
            <span>Sidebar intensity</span>
          </div>
          <SegmentedControl
            value={settings.sidebarIntensity}
            options={segmented.sidebarIntensity as ReadonlyArray<{ key: ThemeSettings['sidebarIntensity']; label: string }>}
            onChange={(next) => onChange('sidebarIntensity', next)}
          />
        </div>

        <div className="so-control-stack">
          <div className="so-control-line">
            <Gauge size={14} />
            <span>Border radius</span>
          </div>
          <SegmentedControl
            value={settings.radius}
            options={segmented.radius as ReadonlyArray<{ key: ThemeSettings['radius']; label: string }>}
            onChange={(next) => onChange('radius', next)}
          />
        </div>

        <div className="so-control-stack">
          <div className="so-control-line">
            <Gauge size={14} />
            <span>Density</span>
          </div>
          <SegmentedControl
            value={settings.density}
            options={segmented.density as ReadonlyArray<{ key: ThemeSettings['density']; label: string }>}
            onChange={(next) => onChange('density', next)}
          />
        </div>

        <div className="so-control-stack">
          <div className="so-control-line">
            <Gauge size={14} />
            <span>Font scale</span>
          </div>
          <SegmentedControl
            value={settings.fontScale}
            options={segmented.fontScale as ReadonlyArray<{ key: ThemeSettings['fontScale']; label: string }>}
            onChange={(next) => onChange('fontScale', next)}
          />
        </div>
      </Section>

      <Section title="Accessibility" subtitle="These strengthen contrast and trim motion system-wide.">
        <label className="so-theme-toggle">
          <div>
            <div className="so-theme-toggle-title">High contrast</div>
            <div className="so-theme-toggle-sub">Raises border, muted text, and focus ring strength.</div>
          </div>
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={(e) => onChange('highContrast', e.target.checked)}
          />
        </label>

        <label className="so-theme-toggle">
          <div>
            <div className="so-theme-toggle-title">Reduce motion</div>
            <div className="so-theme-toggle-sub">Disables non-essential transitions and animated shimmer.</div>
          </div>
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(e) => onChange('reducedMotion', e.target.checked)}
          />
        </label>
      </Section>

      <Section title="Charts" subtitle="Chart tokens update graphs and dashboard data-viz surfaces.">
        <div className="so-control-stack">
          <div className="so-control-line">
            <Contrast size={14} />
            <span>Chart palette</span>
          </div>
          <SegmentedControl
            value={settings.chartPalette}
            options={segmented.chartPalette as ReadonlyArray<{ key: ThemeSettings['chartPalette']; label: string }>}
            onChange={(next) => onChange('chartPalette', next)}
          />
        </div>
        <div className="so-theme-chart-preview">
          {chartPalettes[settings.chartPalette].colors.map((color, idx) => (
            <span key={`${color}-${idx}`} style={{ background: color }} />
          ))}
        </div>
      </Section>

      <div className="so-theme-popover-foot">
        <button type="button" className="so-theme-close" onClick={onClose}>
          Close panel
        </button>
      </div>
    </div>
  );
}
