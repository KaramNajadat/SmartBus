import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Beaker } from 'lucide-react';
import './DemoPanel.css';

/**
 * DemoPanel — a single control surface for every demo / test scenario.
 *
 * Props:
 *   demo     — the object returned by useDemoMode()
 *   busMode  — (optional) the object returned by useBusMode(); when provided,
 *              an "Operations Mode" section lets the tester force any bus mode.
 *
 * Alert scenarios map to demo.demoScenario:
 *   null | 'missing' | 'on-bus' | 'all-clear'
 * GPS-offline maps to demo.demoGpsOffline.
 */
export default function DemoPanel({ demo, busMode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const {
    demoEnabled, toggleDemo,
    demoScenario, setDemoScenario,
    demoGpsOffline, setDemoGpsOffline,
  } = demo;

  const alertScenarios = [
    { key: null, label: t('demo.scenario.normal'), desc: t('demo.scenario.normalDesc') },
    { key: 'missing', label: t('demo.scenario.missing'), desc: t('demo.scenario.missingDesc') },
    { key: 'on-bus', label: t('demo.scenario.onBus'), desc: t('demo.scenario.onBusDesc') },
    { key: 'all-clear', label: t('demo.scenario.allClear'), desc: t('demo.scenario.allClearDesc') },
  ];

  return (
    <div className="demo-panel">
      <button
        className={`demo-panel__trigger${demoEnabled ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={t('demo.open')}
      >
        <Beaker size={16} /> {demoEnabled ? t('demo.demoOn') : t('demo.open')}
      </button>

      {open && (
        <>
          <div className="demo-panel__backdrop" onClick={() => setOpen(false)} />
          <div className="demo-panel__pop" role="dialog" aria-label={t('demo.panelTitle')}>
            <p className="demo-panel__title">{t('demo.panelTitle')}</p>
            <p className="demo-panel__subtitle">{t('demo.panelSubtitle')}</p>

            {/* ── Bus movement (master toggle) ── */}
            <div className="demo-panel__section">
              <div className="demo-panel__section-label">{t('demo.category.movement')}</div>
              <button
                className={`demo-panel__switch${demoEnabled ? ' on' : ''}`}
                onClick={toggleDemo}
              >
                <span>{t('demo.demo')}</span>
                <span className="demo-panel__pill">{demoEnabled ? t('demo.on') : t('demo.off')}</span>
              </button>
            </div>

            {/* ── Alert scenarios ── */}
            {demoEnabled && (
              <div className="demo-panel__section">
                <div className="demo-panel__section-label">{t('demo.category.alerts')}</div>
                <div className="demo-panel__grid">
                  {alertScenarios.map((s) => (
                    <button
                      key={String(s.key)}
                      className={`demo-panel__opt${demoScenario === s.key ? ' active' : ''}`}
                      onClick={() => setDemoScenario(s.key)}
                    >
                      <span>{s.label}</span>
                      <span className="demo-panel__opt-desc">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Operations mode (bus admin only) ── */}
            {demoEnabled && busMode && (
              <div className="demo-panel__section">
                <div className="demo-panel__section-label">{t('demo.category.operations')}</div>
                <div className="demo-panel__grid">
                  <button
                    className={`demo-panel__opt${busMode.isAutoDetected ? ' active' : ''}`}
                    onClick={busMode.resetToAuto}
                  >
                    <span>{t('busAdmin.auto')}</span>
                  </button>
                  {busMode.allModes.map((mode) => (
                    <button
                      key={mode.id}
                      className={`demo-panel__opt${!busMode.isAutoDetected && busMode.currentModeKey === mode.id.toUpperCase() ? ' active' : ''}`}
                      onClick={() => busMode.setManualMode(mode.id.toUpperCase())}
                    >
                      <span>{t(`busModes.${mode.id}.label`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── System state ── */}
            {demoEnabled && (
              <div className="demo-panel__section">
                <div className="demo-panel__section-label">{t('demo.category.system')}</div>
                <button
                  className={`demo-panel__switch${demoGpsOffline ? ' on' : ''}`}
                  onClick={() => setDemoGpsOffline(!demoGpsOffline)}
                >
                  <span>{t('demo.scenario.gpsOffline')}</span>
                  <span className="demo-panel__pill">{demoGpsOffline ? t('demo.on') : t('demo.off')}</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
