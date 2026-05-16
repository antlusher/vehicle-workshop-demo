import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import VoiceInput from '../components/VoiceInput';
import * as api from '../services/api';
import * as reportsApi from '../services/reportsApi';
import QuoteTab from './QuoteTab';

const OPEN_ENDED_START = /^(which|what|how|describe|list|name|where|when|who)\b/i;
const PREP_WH = /^(at|in|on|under|during|from|by|for)\s+(what|which|how|where|when|who)\b/i;
const MULTI_OPTION = /,\s*or\b|\bor\s+(?:only|just)\b|\bor\s+(?:at|when|during|under|from|in|across|between)\s/i;
const COMPOUND = /\?\s*(if|when|please|and)\b/i;
const BINARY_START = /^(is|are|does|do|has|have|did|can|will|was|were|would|could|should)\b/i;
const DIAGNOSTIC_VERB = /\b(check|inspect|test|measure|verify|monitor|scan|listen|look|try|assess|examine|observe|ensure|see if|determine|evaluate|consider|confirm|run\s+a|record|note|review|compare|document|identify|locate|connect)\b/i;
const INSPECTION_PURPOSE = /\bto\s+(gain access|inspect|check|verify|examine|assess|look\b|see\b)/i;
const WARNING_START = /^(do not|don't|never|warning|caution|important|note:|n\.b\.|avoid\b|stop\b)/i;
const REPAIR_VERB = /\b(replace|fit|install|renew|swap|clean|flush|bleed|adjust|seal|remove|repair|rebuild|reset|clear|relearn|prime|top.?up|refill|tighten|torque|apply|lubricate)\b/i;
const AWAITING_FINDINGS = /\breport\s+back\b|\byour\s+findings\b|\badvise\s+(on\s+the\s+correct|further)\b|\blet\s+me\s+know\s+(what|the|how)\b/i;

function nodeText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (node.props?.children) return nodeText(node.props.children);
  return '';
}

function questionType(text) {
  if (WARNING_START.test(text)) return 'warning';
  if (!text.endsWith('?')) {
    if (DIAGNOSTIC_VERB.test(text) || INSPECTION_PURPOSE.test(text)) return 'step';
    if (REPAIR_VERB.test(text)) return 'fix';
    return 'info';
  }
  if (OPEN_ENDED_START.test(text) || PREP_WH.test(text)) return 'open';
  if (MULTI_OPTION.test(text) || COMPOUND.test(text)) return 'open';
  if (BINARY_START.test(text) && /\bor\b(?!\s*not\b)/i.test(text)) return 'open';
  return 'yesno';
}

function extractActionItems(text) {
  return text
    .split('\n')
    .filter((l) => /^[\s]*(?:[-*•]|\d+\.)\s+/.test(l))
    .map((l) => l.replace(/^[\s]*(?:[-*•]|\d+\.)\s+/, '').trim())
    .filter((l) => questionType(l) === 'fix');
}

function YesNoButtons({ onAnswered }) {
  const [answer, setAnswer] = useState(null);
  const handle = (val) => {
    const next = answer === val ? null : val;
    setAnswer(next);
    onAnswered(next);
  };
  return (
    <div className="yn-buttons">
      <button type="button" className={`yn-btn yn-yes${answer === 'yes' ? ' active' : ''}`} onClick={() => handle('yes')}>Yes</button>
      <button type="button" className={`yn-btn yn-no${answer === 'no' ? ' active' : ''}`} onClick={() => handle('no')}>No</button>
    </div>
  );
}

function OpenAnswerInput({ itemText, onAnswer }) {
  const [value, setValue] = useState('');
  return (
    <input
      className="open-answer-input"
      type="text"
      placeholder="Type your answer..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onAnswer(itemText, value.trim() || null)}
    />
  );
}

function FixChooser({ items, confirmedTexts, onConfirm, onCancel, isBusy }) {
  const [selected, setSelected] = useState(new Set());
  const toggle = (item) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(item) ? next.delete(item) : next.add(item);
    return next;
  });
  const newFixes = [...selected].filter((i) => !confirmedTexts?.has(i));
  return (
    <div className="fix-chooser">
      <p className="fix-chooser-label">Which of these fixed it?</p>
      <ul className="fix-chooser-list">
        {items.map((item, i) => {
          const done = confirmedTexts?.has(item);
          return (
            <li key={i} className={`fix-chooser-item${done ? ' fix-chooser-item--done' : ''}`}>
              <label>
                <input type="checkbox" checked={done || selected.has(item)} disabled={done} onChange={() => !done && toggle(item)} />
                <span>{item}</span>
                {done && <small className="suggestion-confirmed">✓ confirmed</small>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="fix-chooser-actions">
        <button type="button" disabled={!newFixes.length || isBusy} onClick={() => onConfirm(newFixes)}>
          {isBusy ? 'Saving…' : `Confirm ${newFixes.length || ''} fix${newFixes.length !== 1 ? 'es' : ''}`}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AiResponse({ text, historyId, projectId, onConfirmSuggestion, onContinue, isLatestAi, isBusy, confirmedTexts, chatMode }) {
  const [hasAnswers, setHasAnswers] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [confirmingFixes, setConfirmingFixes] = useState(false);
  const answersRef = useRef({});

  const actionItems = useMemo(() => extractActionItems(text), [text]);
  const awaitingFindings = useMemo(() => AWAITING_FINDINGS.test(text), [text]);
  const hasDiagnosticSteps = useMemo(() => text.split('\n')
    .filter((l) => /^[\s]*(?:[-*•]|\d+\.)\s+/.test(l))
    .map((l) => l.replace(/^[\s]*(?:[-*•]|\d+\.)\s+/, '').trim())
    .some((l) => questionType(l) === 'step'), [text]);

  const handleAnswer = useCallback((key, value) => {
    answersRef.current[key] = value;
    setHasAnswers(Object.values(answersRef.current).some((v) => v !== null && v !== ''));
  }, []);

  const handleContinue = useCallback(async () => {
    const answered = Object.entries(answersRef.current).filter(([, v]) => v !== null && v !== '');
    if (!answered.length) return;
    setSubmitted(true);
    const lines = answered.map(([q, a]) => {
      if (a === 'yes' || a === 'no') return `- ${q} → ${a === 'yes' ? 'Yes' : 'No'}`;
      return `- ${q} → ${a}`;
    });
    const message = `Diagnostic answers:\n${lines.join('\n')}\n\nBased on these answers, what is the next diagnostic step?`;
    await onContinue(message);
  }, [onContinue]);

  const handleConfirmFixes = useCallback(async (selected) => {
    setConfirmingFixes(true);
    try {
      for (const itemText of selected) {
        await onConfirmSuggestion(projectId, historyId, itemText);
      }
      setShowChooser(false);
    } finally {
      setConfirmingFixes(false);
    }
  }, [projectId, historyId, onConfirmSuggestion]);

  const isDiagnose = chatMode === 'diagnose';
  const hasConfirmedFromThis = actionItems.some((i) => confirmedTexts?.has(i));

  const components = useMemo(() => ({
    li({ children }) {
      const itemText = nodeText(children).trim();
      const type = questionType(itemText);
      return (
        <li className={`ai-suggestion ai-suggestion--${type}`}>
          <span>{children}</span>
          {isDiagnose && type === 'yesno' && isLatestAi && <YesNoButtons onAnswered={(v) => handleAnswer(itemText, v)} />}
          {isDiagnose && type === 'open' && isLatestAi && <OpenAnswerInput itemText={itemText} onAnswer={handleAnswer} />}
          {isDiagnose && !isLatestAi && confirmedTexts?.has(itemText) && (
            <small className="suggestion-confirmed">✓ This fixed it</small>
          )}
        </li>
      );
    },
  }), [handleAnswer, confirmedTexts, isDiagnose, isLatestAi]);

  return (
    <div className="ai-response">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
      {isDiagnose && isLatestAi && hasAnswers && !submitted && (
        <button type="button" className="continue-btn" disabled={isBusy} onClick={handleContinue}>
          {isBusy ? 'Thinking...' : 'Continue diagnosis →'}
        </button>
      )}
      {submitted && !isBusy && (
        <small className="suggestion-confirmed">Answers sent — see next step below</small>
      )}
      {isDiagnose && isLatestAi && actionItems.length > 0 && !showChooser && !awaitingFindings && !hasDiagnosticSteps && (
        <button type="button" className="what-fixed-btn" onClick={() => setShowChooser(true)}>
          {hasConfirmedFromThis ? 'Update confirmed fixes' : 'What fixed it? →'}
        </button>
      )}
      {isDiagnose && isLatestAi && showChooser && (
        <FixChooser
          items={actionItems}
          confirmedTexts={confirmedTexts}
          onConfirm={handleConfirmFixes}
          onCancel={() => setShowChooser(false)}
          isBusy={confirmingFixes}
        />
      )}
    </div>
  );
}

function SpecRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="spec-row">
      <span className="spec-label">{label}</span>
      <span className="spec-value">{value}</span>
    </div>
  );
}

function SpecCard({ title, children }) {
  return (
    <div className="spec-card">
      <h4 className="spec-card-title">{title}</h4>
      {children}
    </div>
  );
}

function QuickReference({ project, token }) {
  const [specs, setSpecs] = useState(project.specs || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasVehicleData = project.make && project.model;

  const fetchSpecs = () => {
    if (!hasVehicleData) return;
    setLoading(true);
    setError('');
    api.fetchProjectSpecs(project.id, token)
      .then(setSpecs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (specs || !hasVehicleData) return;
    fetchSpecs();
  }, [project.id]);

  if (!hasVehicleData) return (
    <p style={{ color: '#9ca3af', fontSize: '0.9rem', padding: '12px 0' }}>
      Vehicle specs unavailable — make and model are not set for this project.
    </p>
  );
  if (loading) return <p className="specs-loading">Generating vehicle specs…</p>;
  if (error) return (
    <div style={{ padding: 16 }}>
      <p className="error" style={{ marginBottom: 10 }}>{error}</p>
      <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={fetchSpecs}>Try again</button>
    </div>
  );
  if (!specs) return null;

  const s = specs;
  return (
    <div className="specs-grid">
      <SpecCard title="Engine Oil">
        <SpecRow label="Grade" value={s.engineOil?.grade} />
        <SpecRow label="Capacity" value={s.engineOil?.capacity} />
        <SpecRow label="Spec" value={s.engineOil?.spec} />
      </SpecCard>
      <SpecCard title="Coolant">
        <SpecRow label="Type" value={s.coolant?.type} />
        <SpecRow label="Capacity" value={s.coolant?.capacity} />
        <SpecRow label="Mix ratio" value={s.coolant?.mixRatio} />
      </SpecCard>
      <SpecCard title="Brake Fluid">
        <SpecRow label="Spec" value={s.brakeFluid?.spec} />
      </SpecCard>
      <SpecCard title="Transmission">
        <SpecRow label="Fluid type" value={s.transmission?.type} />
        <SpecRow label="Capacity" value={s.transmission?.capacity} />
      </SpecCard>
      <SpecCard title="Wheel Torque">
        <SpecRow label="Nm" value={s.wheelTorque?.nm} />
        <SpecRow label="lb·ft" value={s.wheelTorque?.lbft} />
        <SpecRow label="Pattern" value={s.wheelTorque?.pattern} />
      </SpecCard>
      <SpecCard title="Tyre Pressures">
        <SpecRow label="Front" value={s.tyrePressures?.front ? `${s.tyrePressures.front} ${s.tyrePressures.unit || 'bar'}` : null} />
        <SpecRow label="Rear" value={s.tyrePressures?.rear ? `${s.tyrePressures.rear} ${s.tyrePressures.unit || 'bar'}` : null} />
      </SpecCard>
      <SpecCard title="Service Intervals">
        <SpecRow label="Oil change" value={s.serviceIntervals?.oil} />
        <SpecRow label="Air filter" value={s.serviceIntervals?.airFilter} />
        <SpecRow label="Timing belt" value={s.serviceIntervals?.timingBelt} />
      </SpecCard>
      {s.notes?.length > 0 && (
        <SpecCard title="Notes">
          <ul className="spec-notes">
            {s.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </SpecCard>
      )}
    </div>
  );
}

function VehicleInfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="spec-row">
      <span className="spec-label">{label}</span>
      <span className="spec-value">{value}</span>
    </div>
  );
}

const FUEL_TYPES = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'Mild Hybrid', 'Plug-in Hybrid', 'LPG', 'Other'];
const BODY_TYPES = ['Hatchback', 'Saloon', 'Estate', 'SUV', 'MPV', 'Van', 'Pickup', 'Coupe', 'Convertible', 'Other'];

function VehicleEditForm({ project, onSave, onCancel }) {
  const [form, setForm] = useState({
    registration: project.registration || '',
    vin: project.vin || '',
    make: project.make || '',
    model: project.model || '',
    year: project.year || '',
    engineCode: project.engineCode || '',
    fuelType: project.fuelType || '',
    trim: project.trim || '',
    bodyType: project.bodyType || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { await onSave(form); } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16 }}>
      <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>Edit vehicle details</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Registration</label>
          <input value={form.registration} onChange={(e) => set('registration', e.target.value)} placeholder="e.g. AB12 CDE" />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>VIN</label>
          <input value={form.vin} onChange={(e) => set('vin', e.target.value)} placeholder="17-char VIN" />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Make</label>
          <input value={form.make} onChange={(e) => set('make', e.target.value)} placeholder="e.g. Ford" />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Model</label>
          <input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="e.g. Focus" />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Year</label>
          <input value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="e.g. 2019" maxLength={4} />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Engine code</label>
          <input value={form.engineCode} onChange={(e) => set('engineCode', e.target.value)} placeholder="e.g. R9M" />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Fuel type</label>
          <select value={form.fuelType} onChange={(e) => set('fuelType', e.target.value)}>
            <option value="">— Select —</option>
            {FUEL_TYPES.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Body type</label>
          <select value={form.bodyType} onChange={(e) => set('bodyType', e.target.value)}>
            <option value="">— Select —</option>
            {BODY_TYPES.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Trim / variant</label>
          <input value={form.trim} onChange={(e) => set('trim', e.target.value)} placeholder="e.g. ST-Line, Titanium" />
        </div>
      </div>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function VehicleInfo({ project, onUpdateVehicle }) {
  const [editing, setEditing] = useState(false);
  const vd = project.vehicleData;
  const md = project.motVehicleMeta;

  const handleSave = async (data) => {
    await onUpdateVehicle(project.id, data);
    setEditing(false);
  };

  if (editing) {
    return <VehicleEditForm project={project} onSave={handleSave} onCancel={() => setEditing(false)} />;
  }

  const fmtDate = (d) => {
    if (!d) return null;
    const p = new Date(d);
    return isNaN(p) ? d : p.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmt = (val, unit) => (val != null ? `${val}${unit ? ' ' + unit : ''}` : null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
        <button type="button" className="secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => setEditing(true)}>
          Edit vehicle details
        </button>
      </div>
      <div className="specs-grid">

        <div className="spec-card" style={{ gridColumn: '1 / -1' }}>
          <h4 className="spec-card-title">Vehicle</h4>
          <VehicleInfoRow label="Registration" value={project.registration} />
          <VehicleInfoRow label="VIN" value={project.vin} />
          <VehicleInfoRow label="Engine code" value={project.engineCode} />
          {md ? (<>
            <VehicleInfoRow label="Make" value={md.make} />
            <VehicleInfoRow label="Model" value={md.model} />
            <VehicleInfoRow label="Fuel type" value={md.fuelType} />
            <VehicleInfoRow label="Engine size" value={md.engineSize ? `${md.engineSize}cc` : null} />
            <VehicleInfoRow label="Colour" value={md.primaryColour} />
            <VehicleInfoRow label="First used" value={fmtDate(md.firstUsedDate)} />
            <VehicleInfoRow label="Manufacture date" value={fmtDate(md.manufactureDate)} />
            <VehicleInfoRow label="Last MOT" value={fmtDate(md.lastMotTestDate)} />
            <VehicleInfoRow label="MOT due" value={fmtDate(md.motTestDueDate)} />
            {md.hasOutstandingRecall === true && <VehicleInfoRow label="Outstanding recall" value="Yes" />}
          </>) : (<>
            <VehicleInfoRow label="Make" value={project.make} />
            <VehicleInfoRow label="Model" value={project.model} />
            <VehicleInfoRow label="Year" value={project.year} />
            <VehicleInfoRow label="Fuel type" value={project.fuelType} />
            <VehicleInfoRow label="Trim" value={project.trim} />
            <VehicleInfoRow label="Body type" value={project.bodyType} />
          </>)}
        </div>

        {vd && (<>
          <div className="spec-card" style={{ gridColumn: '1 / -1' }}>
            <h4 className="spec-card-title">Registration History</h4>
            <VehicleInfoRow label="Previous keepers" value={vd.numberOfKeepers} />
            <VehicleInfoRow label="Country of origin" value={vd.countryOfOrigin} />
            <VehicleInfoRow label="Series / Gen" value={vd.series} />
            <VehicleInfoRow label="Variant" value={vd.modelVariant} />
            {vd.isScrapped && <VehicleInfoRow label="Status" value="SCRAPPED" />}
            {vd.isExported && <VehicleInfoRow label="Status" value="EXPORTED" />}
          </div>

          <div className="spec-card">
            <h4 className="spec-card-title">Engine</h4>
            <VehicleInfoRow label="Description" value={vd.engine?.description} />
            <VehicleInfoRow label="Manufacturer" value={vd.engine?.manufacturer} />
            <VehicleInfoRow label="Capacity" value={vd.engine?.capacityLitres != null ? `${vd.engine.capacityLitres}L (${vd.engine.capacityCc}cc)` : fmt(vd.engine?.capacityCc, 'cc')} />
            <VehicleInfoRow label="Cylinders" value={vd.engine?.cylinders} />
            <VehicleInfoRow label="Aspiration" value={vd.engine?.aspiration} />
            <VehicleInfoRow label="Valve gear" value={vd.engine?.valveGear} />
          </div>

          <div className="spec-card">
            <h4 className="spec-card-title">Transmission</h4>
            <VehicleInfoRow label="Type" value={vd.transmission?.type} />
            <VehicleInfoRow label="Gears" value={vd.transmission?.gears} />
            <VehicleInfoRow label="Drive" value={vd.transmission?.driveType} />
          </div>

          <div className="spec-card">
            <h4 className="spec-card-title">Performance</h4>
            <VehicleInfoRow label="Power" value={vd.performance?.powerBhp != null ? `${vd.performance.powerBhp} bhp / ${vd.performance.powerKw} kW` : null} />
            <VehicleInfoRow label="Torque" value={vd.performance?.torqueNm != null ? `${vd.performance.torqueNm} Nm / ${vd.performance.torqueLbft} lb·ft` : null} />
            <VehicleInfoRow label="0–60 mph" value={fmt(vd.performance?.zeroToSixtyMph, 's')} />
            <VehicleInfoRow label="Top speed" value={fmt(vd.performance?.maxSpeedMph, 'mph')} />
          </div>

          <div className="spec-card">
            <h4 className="spec-card-title">Economy</h4>
            <VehicleInfoRow label="Combined" value={fmt(vd.economy?.combinedMpg, 'mpg')} />
            <VehicleInfoRow label="Urban" value={fmt(vd.economy?.urbanMpg, 'mpg')} />
            <VehicleInfoRow label="Extra-urban" value={fmt(vd.economy?.extraUrbanMpg, 'mpg')} />
            <VehicleInfoRow label="CO2" value={fmt(vd.emissions?.co2, 'g/km')} />
            <VehicleInfoRow label="Euro status" value={vd.emissions?.euroStatus} />
          </div>

          <div className="spec-card">
            <h4 className="spec-card-title">Body</h4>
            <VehicleInfoRow label="Style" value={vd.body?.style} />
            <VehicleInfoRow label="Doors" value={vd.body?.numberOfDoors} />
            <VehicleInfoRow label="Seats" value={vd.body?.numberOfSeats} />
            <VehicleInfoRow label="Fuel tank" value={fmt(vd.body?.fuelTankLitres, 'L')} />
            <VehicleInfoRow label="Kerb weight" value={fmt(vd.weights?.kerbKg, 'kg')} />
          </div>
        </>)}

      </div>
    </div>
  );
}

const DEFECT_ORDER = ['DANGEROUS', 'FAIL', 'MAJOR', 'MINOR', 'PRS', 'USER_ENTERED', 'ADVISORY'];
const DEFECT_LABELS = { DANGEROUS: 'Dangerous', FAIL: 'Fail', MAJOR: 'Major', MINOR: 'Minor', PRS: 'Pass after Rectification', USER_ENTERED: 'User Entered', ADVISORY: 'Advisory' };
const DEFECT_CLASS = { DANGEROUS: 'mot-defect--dangerous', FAIL: 'mot-defect--fail', MAJOR: 'mot-defect--fail', MINOR: 'mot-defect--minor', PRS: 'mot-defect--prs', USER_ENTERED: 'mot-defect--advisory', ADVISORY: 'mot-defect--advisory' };

function MotMetaRow({ label, value }) {
  if (value == null || value === '' || value === false) return null;
  return (
    <div className="mot-meta-row">
      <span className="mot-meta-label">{label}</span>
      <span className="mot-meta-value">{value === true ? 'Yes' : String(value)}</span>
    </div>
  );
}

function MotTab({ project, token }) {
  const [tests, setTests] = useState(project.motTests || null);
  const [meta, setMeta] = useState(project.motVehicleMeta || null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tests && project.registration) handleRefresh();
  }, [project.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${project.id}/mot/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed');
      setTests(data.motTests);
      setMeta(data.motVehicleMeta);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    const parsed = new Date(d);
    return isNaN(parsed) ? d : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="mot-tab">
      <div className="mot-header">
        <div>
          <strong>MOT History</strong>
          {tests?.length > 0 && <span style={{ marginLeft: 8, color: '#6b7280', fontSize: '0.82rem' }}>{tests.length} test{tests.length !== 1 ? 's' : ''}</span>}
        </div>
        <button type="button" className="secondary" style={{ fontSize: '0.78rem', padding: '3px 10px' }} onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="error" style={{ margin: '8px 0' }}>{error}</p>}

      {meta?.hasOutstandingRecall === true && (
        <div className="mot-recall-banner">
          ⚠ Outstanding safety recall on this vehicle
        </div>
      )}

      {meta && (
        <div className="mot-meta-block">
          <div className="mot-section-heading">Vehicle Data from DVSA</div>
          <MotMetaRow label="Make" value={meta.make} />
          <MotMetaRow label="Model" value={meta.model} />
          <MotMetaRow label="Fuel type" value={meta.fuelType} />
          <MotMetaRow label="Engine size" value={meta.engineSize ? `${meta.engineSize}cc` : null} />
          <MotMetaRow label="Primary colour" value={meta.primaryColour} />
          <MotMetaRow label="Secondary colour" value={meta.secondaryColour} />
          <MotMetaRow label="First used" value={fmtDate(meta.firstUsedDate)} />
          <MotMetaRow label="Registration date" value={fmtDate(meta.registrationDate)} />
          <MotMetaRow label="Manufacture date" value={fmtDate(meta.manufactureDate)} />
          <MotMetaRow label="Last MOT test" value={fmtDate(meta.lastMotTestDate)} />
          <MotMetaRow label="MOT due" value={fmtDate(meta.motTestDueDate)} />
          <MotMetaRow label="Last updated" value={fmtDate(meta.last_update_date)} />
          <MotMetaRow label="Data source" value={meta.dataSource} />
          <MotMetaRow label="Outstanding recall" value={meta.hasOutstandingRecall} />
        </div>
      )}

      {!tests || tests.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '0.88rem', padding: '12px 0' }}>
          No MOT test records found. {!tests && 'Try refreshing.'}
        </p>
      ) : (
        tests.map((t, i) => {
          const passed = t.result === 'PASSED';
          const showOdometer = t.odometerResultType === 'READ' && t.odometerValue != null;
          const regDiffers = t.regMarkAtTest && t.regMarkAtTest !== project.registration?.replace(/\s+/g, '');
          const defectsByType = DEFECT_ORDER.reduce((acc, type) => {
            const matches = (t.defects || []).filter((d) => d.type === type);
            if (matches.length) acc[type] = matches;
            return acc;
          }, {});
          return (
            <div key={i} className={`mot-test-card ${passed ? 'mot-pass' : 'mot-fail'}`}>
              <div className="mot-test-header">
                <span className={`mot-badge ${passed ? 'mot-badge--pass' : 'mot-badge--fail'}`}>{t.result || 'Unknown'}</span>
                <span className="mot-test-date">{fmtDate(t.testDate)}</span>
                {showOdometer && (
                  <span className="mot-mileage">{t.odometerValue.toLocaleString()} {t.odometerUnit === 'MI' ? 'miles' : 'km'}</span>
                )}
                {t.odometerResultType === 'NO_ODOMETER' && <span className="mot-mileage">No odometer</span>}
                {t.odometerResultType === 'UNREADABLE' && <span className="mot-mileage">Odometer unreadable</span>}
                {passed && t.expiryDate && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#6b7280' }}>Expires {fmtDate(t.expiryDate)}</span>
                )}
              </div>
              {regDiffers && (
                <div style={{ padding: '2px 14px 4px', fontSize: '0.75rem', color: '#6b7280' }}>
                  Tested as {t.regMarkAtTest}
                </div>
              )}
              {Object.entries(defectsByType).map(([type, defects]) => (
                <div key={type} className="mot-defects">
                  <div className="mot-defect-heading">{DEFECT_LABELS[type] || type}</div>
                  {defects.map((d, j) => (
                    <div key={j} className={`mot-defect ${DEFECT_CLASS[type] || ''}`}>{d.text}</div>
                  ))}
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

function ReportPreviewModal({ project, form, images, confirmedFixes, onClose }) {
  const fmt = (v) => v ? `£${parseFloat(v).toFixed(2)}` : null;
  const hasCosts = form.costParts || form.costLabour || form.costTotal;
  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>Customer view — report preview</h3>
          <button className="preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="preview-modal-body cp-detail">
          <div className="cp-detail-header">
            <div>
              <h2 className="cp-detail-title">{project.registration || 'Vehicle'} — Service Report</h2>
              <p className="cp-detail-meta">{[project.make, project.model, project.year].filter(Boolean).join(' ')}</p>
            </div>
          </div>
          {form.diagnosis && <div className="cp-report-section"><h3 className="cp-section-title">What we found</h3><p className="cp-section-text">{form.diagnosis}</p></div>}
          {form.workCarriedOut && <div className="cp-report-section"><h3 className="cp-section-title">What we did</h3><p className="cp-section-text" style={{ whiteSpace: 'pre-line' }}>{form.workCarriedOut}</p></div>}
          {confirmedFixes?.length > 0 && (
            <div className="cp-report-section">
              <h3 className="cp-section-title">Repairs confirmed</h3>
              <ul className="cp-fixes">{confirmedFixes.map((f) => <li key={f.id} className="cp-fix">✓ {f.text}</li>)}</ul>
            </div>
          )}
          {form.technicianNotes && <div className="cp-report-section cp-report-section--note"><h3 className="cp-section-title">Technician notes</h3><p className="cp-section-text" style={{ whiteSpace: 'pre-line' }}>{form.technicianNotes}</p></div>}
          {hasCosts && (
            <div className="cp-report-section">
              <h3 className="cp-section-title">Your bill</h3>
              <div className="cp-costs">
                {form.costParts && <div className="cp-cost-row"><span>Parts</span><span>{fmt(form.costParts)}</span></div>}
                {form.costLabour && <div className="cp-cost-row"><span>Labour</span><span>{fmt(form.costLabour)}</span></div>}
                {form.costTotal && <div className="cp-cost-row cp-cost-row--total"><span>Total</span><span>{fmt(form.costTotal)}</span></div>}
              </div>
            </div>
          )}
          {images.length > 0 && (
            <div className="cp-report-section">
              <h3 className="cp-section-title">Photos</h3>
              <div className="cp-photos">
                {images.map((img) => (
                  <div key={img.id} className="cp-photo">
                    <img src={reportsApi.imageUrl(img.filename)} alt={img.caption || ''} />
                    {img.caption && <p className="cp-photo-caption">{img.caption}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!form.diagnosis && !form.workCarriedOut && !hasCosts && <p style={{ color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>Nothing to preview yet — fill in the report fields above.</p>}
        </div>
      </div>
    </div>
  );
}

function ReportTab({ project, token }) {
  const [report, setReport] = useState(null);
  const [images, setImages] = useState([]);
  const [form, setForm] = useState({ diagnosis: '', workCarriedOut: '', technicianNotes: '', costParts: '', costLabour: '', costTotal: '' });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    Promise.all([reportsApi.getReport(project.id, token), reportsApi.getImages(project.id, token)])
      .then(([r, imgs]) => {
        setImages(imgs);
        if (r) {
          setReport(r);
          setForm({
            diagnosis: r.diagnosis || '',
            workCarriedOut: r.workCarriedOut || '',
            technicianNotes: r.technicianNotes || '',
            costParts: r.costParts != null ? String(r.costParts) : '',
            costLabour: r.costLabour != null ? String(r.costLabour) : '',
            costTotal: r.costTotal != null ? String(r.costTotal) : '',
          });
        }
      })
      .catch(() => {});
  }, [project.id]);

  const handleCostChange = (k, v) => {
    const updated = { ...form, [k]: v };
    const parts = parseFloat(updated.costParts) || 0;
    const labour = parseFloat(updated.costLabour) || 0;
    if (parts || labour) updated.costTotal = (parts + labour).toFixed(2);
    setForm(updated);
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      const r = await reportsApi.saveReport(project.id, {
        diagnosis: form.diagnosis,
        workCarriedOut: form.workCarriedOut,
        technicianNotes: form.technicianNotes,
        costParts: form.costParts ? parseFloat(form.costParts) : null,
        costLabour: form.costLabour ? parseFloat(form.costLabour) : null,
        costTotal: form.costTotal ? parseFloat(form.costTotal) : null,
      }, token);
      setReport(r); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handlePublish = async () => {
    setPublishing(true); setError('');
    try {
      const r = report?.status === 'published'
        ? await reportsApi.unpublishReport(project.id, token)
        : await reportsApi.publishReport(project.id, token);
      setReport(r);
    } catch (err) { setError(err.message); }
    finally { setPublishing(false); }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true); setError('');
    try {
      const uploaded = await reportsApi.uploadImages(project.id, files, token);
      setImages((imgs) => [...imgs, ...uploaded]);
    } catch (err) { setError(err.message); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDeleteImage = async (imageId) => {
    try {
      await reportsApi.deleteImage(project.id, imageId, token);
      setImages((imgs) => imgs.filter((i) => i.id !== imageId));
    } catch (err) { setError(err.message); }
  };

  const handleCaptionBlur = async (imageId, caption) => {
    try {
      await reportsApi.updateImageCaption(project.id, imageId, caption, token);
    } catch (_) {}
  };

  const isPublished = report?.status === 'published';

  return (
    <div className="report-tab">
      {previewing && (
        <ReportPreviewModal
          project={project}
          form={form}
          images={images}
          confirmedFixes={project.confirmedFixes}
          onClose={() => setPreviewing(false)}
        />
      )}
      <div className="report-status-bar">
        <span className={`report-badge ${isPublished ? 'report-badge--published' : 'report-badge--draft'}`}>
          {isPublished ? 'Published to customer' : 'Draft — not visible to customer'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={() => setPreviewing(true)} style={{ fontSize: '0.8rem', padding: '5px 14px' }}>
            Preview
          </button>
          <button onClick={handleSave} disabled={saving} style={{ fontSize: '0.8rem', padding: '5px 14px' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save report'}
          </button>
          <button
            onClick={handlePublish} disabled={publishing || !report}
            className={isPublished ? 'secondary' : ''}
            style={{ fontSize: '0.8rem', padding: '5px 14px' }}
            title={!report ? 'Save the report first' : ''}
          >
            {publishing ? '…' : isPublished ? 'Unpublish' : 'Publish to customer'}
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ margin: '0 16px 8px' }}>{error}</p>}

      <div className="report-form">
        <div className="report-section">
          <label className="report-label">Diagnosis</label>
          <p className="report-hint">What was found — the root cause of the problem</p>
          <textarea rows={4} value={form.diagnosis} onChange={(e) => set('diagnosis', e.target.value)}
            placeholder="e.g. Faulty EGR valve causing rough idle and P0401 fault code. Carbon build-up on inlet manifold." />
        </div>

        <div className="report-section">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <label className="report-label">Work carried out</label>
            {project.confirmedFixes?.length > 0 && (
              <button
                className="secondary"
                style={{ fontSize: '0.72rem', padding: '2px 10px', marginBottom: 2 }}
                onClick={() => {
                  const fixes = project.confirmedFixes.map((f) => f.text).join('\n');
                  set('workCarriedOut', form.workCarriedOut
                    ? `${form.workCarriedOut}\n${fixes}`
                    : fixes);
                }}
              >
                Import confirmed fixes ({project.confirmedFixes.length})
              </button>
            )}
          </div>
          <p className="report-hint">Step-by-step description of what was done</p>
          <textarea rows={5} value={form.workCarriedOut} onChange={(e) => set('workCarriedOut', e.target.value)}
            placeholder="e.g. 1. Removed and cleaned EGR valve&#10;2. Decarbonised inlet manifold&#10;3. Replaced EGR gasket&#10;4. Reset fault codes and road tested" />
        </div>

        <div className="report-section">
          <label className="report-label">Technician notes</label>
          <p className="report-hint">Recommendations, observations, or anything else for the customer</p>
          <textarea rows={3} value={form.technicianNotes} onChange={(e) => set('technicianNotes', e.target.value)}
            placeholder="e.g. Recommend timing belt replacement at next service — showing wear." />
        </div>

        <div className="report-section">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <label className="report-label">Costs</label>
            <button
              type="button"
              className="secondary"
              style={{ fontSize: '0.72rem', padding: '2px 10px', marginBottom: 2 }}
              onClick={async () => {
                try {
                  const qs = await import('../services/quotesApi').then((m) => m.getQuotes(project.id, token));
                  const sent = qs.find((q) => q.status === 'sent' || q.status === 'approved') || qs[0];
                  if (!sent) { alert('No quote found for this project.'); return; }
                  const partsTotal = sent.lines.filter((l) => l.type === 'part').reduce((s, l) => s + l.lineTotal, 0);
                  const labourTotal = sent.lines.filter((l) => l.type === 'labour').reduce((s, l) => s + l.lineTotal, 0);
                  setForm((f) => ({
                    ...f,
                    diagnosis: f.diagnosis || sent.diagnosticSummary || '',
                    technicianNotes: f.technicianNotes || sent.notes || '',
                    costParts: partsTotal > 0 ? partsTotal.toFixed(2) : f.costParts,
                    costLabour: labourTotal > 0 ? labourTotal.toFixed(2) : f.costLabour,
                    costTotal: sent.totals.total.toFixed(2),
                  }));
                } catch { alert('Could not load quote.'); }
              }}
            >
              Load from quote
            </button>
          </div>
          <div className="report-costs">
            <div>
              <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Parts (£)</label>
              <input type="number" min="0" step="0.01" value={form.costParts}
                onChange={(e) => handleCostChange('costParts', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Labour (£)</label>
              <input type="number" min="0" step="0.01" value={form.costLabour}
                onChange={(e) => handleCostChange('costLabour', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total (£)</label>
              <input type="number" min="0" step="0.01" value={form.costTotal}
                onChange={(e) => set('costTotal', e.target.value)} placeholder="0.00"
                style={{ fontWeight: 700, background: '#f0fdf4' }} />
            </div>
          </div>
        </div>

        <div className="report-section">
          <label className="report-label">Job photos</label>
          <p className="report-hint">Photos visible to the customer in their report</p>
          <div className="report-images">
            {images.map((img) => (
              <div key={img.id} className="report-image-card">
                <img src={reportsApi.imageUrl(img.filename)} alt={img.caption || 'Job photo'} />
                <input
                  defaultValue={img.caption}
                  placeholder="Add caption…"
                  onBlur={(e) => handleCaptionBlur(img.id, e.target.value)}
                  style={{ fontSize: '0.75rem', padding: '4px 6px', marginTop: 4 }}
                />
                <button className="secondary" style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#fee2e2', color: '#b91c1c', marginTop: 4 }}
                  onClick={() => handleDeleteImage(img.id)}>Remove</button>
              </div>
            ))}
            <div className="report-image-upload" onClick={() => fileRef.current?.click()}>
              {uploading ? <span>Uploading…</span> : <><span className="report-upload-icon">+</span><span>Add photos</span></>}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
      </div>
    </div>
  );
}

function VehicleHistoryTab({ history, currentProjectId }) {
  if (!history) return <div className="chat-messages"><p className="chat-empty">No vehicle history available.</p></div>;

  const { confirmedFixes, jobTimeline, registrationHistory } = history;

  return (
    <div className="vehicle-history-tab">
      {jobTimeline.length > 1 && (
        <div className="vh-section">
          <h4 className="vh-heading">Jobs on this vehicle ({jobTimeline.length})</h4>
          <div className="vh-timeline">
            {jobTimeline.map((job, i) => (
              <div key={job.id} className={`vh-job${job.id === currentProjectId ? ' vh-job--current' : ''}`}>
                <div className="vh-job-dot" />
                <div className="vh-job-body">
                  <span className="vh-job-reg">{job.registration || '—'}</span>
                  <span className="vh-job-date">{new Date(job.openedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span className="vh-job-meta">
                    {job.id === currentProjectId ? 'Current job' : job.closed ? 'Closed' : 'Open'}
                    {job.confirmedFixCount > 0 && ` · ${job.confirmedFixCount} fix${job.confirmedFixCount > 1 ? 'es' : ''} confirmed`}
                    {job.aiMessageCount > 0 && ` · ${job.aiMessageCount} AI response${job.aiMessageCount > 1 ? 's' : ''}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmedFixes.length > 0 && (
        <div className="vh-section">
          <h4 className="vh-heading">All confirmed fixes on this vehicle ({confirmedFixes.length})</h4>
          <p className="vh-sub">Fixes confirmed across all workshops. The AI uses this data when diagnosing.</p>
          <ul className="vh-fixes">
            {confirmedFixes.map((fix) => (
              <li key={fix.id} className={`vh-fix${fix.jobId === currentProjectId ? ' vh-fix--mine' : ''}`}>
                <span className="vh-fix-text">{fix.text}</span>
                <span className="vh-fix-date">{new Date(fix.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {fix.jobId === currentProjectId && <span className="vh-fix-tag">This job</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {registrationHistory.length > 1 && (
        <div className="vh-section">
          <h4 className="vh-heading">Registration history</h4>
          <ul className="vh-regs">
            {registrationHistory.map((r, i) => (
              <li key={i} className="vh-reg">
                <strong>{r.registration}</strong>
                <span>{new Date(r.assignedFrom).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                <span>{r.assignedTo ? `→ ${new Date(r.assignedTo).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : '(current)'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmedFixes.length === 0 && jobTimeline.length <= 1 && (
        <div className="chat-messages">
          <p className="chat-empty">No history from other workshops yet. As this vehicle is worked on across workshops, confirmed fixes will appear here and inform the AI.</p>
        </div>
      )}
    </div>
  );
}

function ProjectCustomerBar({ project, token, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (customers) { setOpen(true); return; }
    try {
      const list = await fetch(`/api/quotes/project-customers/${project.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      setCustomers(Array.isArray(list) ? list : []);
      setOpen(true);
    } catch { setCustomers([]); setOpen(true); }
  };

  const assign = async (customerId) => {
    setSaving(true);
    try {
      await api.setProjectCustomer(project.id, customerId, token);
      onUpdated(project.id);
      setOpen(false);
    } finally { setSaving(false); }
  };

  const remove = () => assign(null);

  return (
    <div style={{ position: 'relative' }}>
      {project.customer ? (
        <button
          type="button"
          className="secondary"
          style={{ fontSize: '0.78rem', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={load}
        >
          <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Customer</span>
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{project.customer.name || project.customer.email}</span>
        </button>
      ) : (
        <button
          type="button"
          className="secondary"
          style={{ fontSize: '0.78rem', padding: '3px 10px', color: '#f59e0b', borderColor: '#f59e0b' }}
          onClick={load}
        >
          + Attach customer
        </button>
      )}

      {open && (
        <div className="customer-picker-dropdown" style={{ top: '100%', right: 0, left: 'auto', minWidth: 220 }}>
          {!customers ? (
            <p style={{ padding: '8px 12px', color: '#6b7280', fontSize: '0.85rem' }}>Loading…</p>
          ) : customers.length === 0 ? (
            <p style={{ padding: '8px 12px', color: '#6b7280', fontSize: '0.85rem' }}>
              No customers linked to this vehicle yet.
            </p>
          ) : (
            customers.map((c) => (
              <button key={c.id} type="button" className="customer-picker-option" disabled={saving} onClick={() => assign(c.id)}>
                <span className="cpo-name">{c.name || c.email}</span>
                {c.name && <span className="cpo-email">{c.email}</span>}
              </button>
            ))
          )}
          {project.customer && (
            <button type="button" className="customer-picker-option customer-picker-remove" onClick={remove} disabled={saving}>
              Remove customer
            </button>
          )}
          <button type="button" className="customer-picker-option" style={{ color: '#6b7280', fontSize: '0.75rem' }} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ project, projectLoading, onAsk, onConfirmSuggestion, onClearHistory, onUpdateVehicle, onRefreshProject, token }) {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('diagnosis');
  const [chatMode, setChatMode] = useState(() => localStorage.getItem('chatMode') || 'diagnose');
  const [chatExpanded, setChatExpanded] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const isBusy = !!status;

  const confirmedTexts = useMemo(
    () => new Set((project?.confirmedFixes || []).map((f) => f.text)),
    [project?.confirmedFixes]
  );

  // Auto-refresh project when motVehicleMeta is missing (e.g. after createProject)
  useEffect(() => {
    if (project?.id && !project.motVehicleMeta && project.registration && onRefreshProject) {
      onRefreshProject(project.id);
    }
  }, [project?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [project?.history?.length, status]);

  useEffect(() => {
    if (!chatExpanded) return;
    const handler = (e) => { if (e.key === 'Escape') setChatExpanded(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [chatExpanded]);

  const selectMode = (mode) => {
    setChatMode(mode);
    localStorage.setItem('chatMode', mode);
  };

  const submitQuestion = useCallback(async (text) => {
    setError('');
    setStatus('Thinking...');
    try {
      await onAsk(project.id, text, chatMode);
      setQuestion('');
      setStatus('');
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }, [onAsk, project, chatMode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (question.trim() && !isBusy) submitQuestion(question.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (question.trim() && !isBusy) submitQuestion(question.trim());
    }
  };

  const handleContinue = useCallback(async (composedMessage) => {
    await submitQuestion(composedMessage);
  }, [submitQuestion]);

  if (projectLoading || !project) {
    return (
      <div className="chat-shell chat-shell--empty">
        {projectLoading ? (
          <div className="project-loading">
            <div className="project-loading-car">&#x1F697;</div>
            <p>Loading vehicle data…</p>
          </div>
        ) : (
          <p>Select a project to begin the diagnostic session.</p>
        )}
      </div>
    );
  }

  const aiEntries = project.history?.filter((e) => e.role === 'ai') ?? [];
  const latestAiId = aiEntries[aiEntries.length - 1]?.id ?? null;
  const isComposed = (text) => text.startsWith('Diagnostic answers:');

  const vehicleSummary = [project.make, project.model, project.year, project.engineCode, project.fuelType]
    .filter(Boolean).join(' · ');

  return (
    <>
      {chatExpanded && (
        <div className="chat-expand-overlay" onClick={() => setChatExpanded(false)} />
      )}
    <div className={`chat-shell${chatExpanded ? ' chat-shell--expanded' : ''}`}>

      <div className="chat-header">
        <div className="chat-header-info">
          <span className="chat-header-reg">{project.registration || project.vin || 'Project'}</span>
          {vehicleSummary && <span className="chat-header-meta">{vehicleSummary}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProjectCustomerBar project={project} token={token} onUpdated={onRefreshProject} />
          {tab === 'diagnosis' && project.history?.length > 0 && (
            <button type="button" className="secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => onClearHistory(project.id)}>
              Start over
            </button>
          )}
        </div>
      </div>

      {project.make && !project.engineCode && (
        <button
          type="button"
          className="engine-code-nudge"
          onClick={() => setTab('vehicle')}
        >
          Add engine code for more accurate AI diagnosis
        </button>
      )}

      <div className="chat-tabs">
        <button type="button" className={`chat-tab${tab === 'diagnosis' ? ' active' : ''}`} onClick={() => setTab('diagnosis')}>Diagnosis</button>
        <button type="button" className={`chat-tab${tab === 'vehicle' ? ' active' : ''}`} onClick={() => setTab('vehicle')}>Vehicle Info</button>
        <button type="button" className={`chat-tab${tab === 'specs' ? ' active' : ''}`} onClick={() => setTab('specs')}>Quick Reference</button>
        {project.vehicleId && (
          <button type="button" className={`chat-tab${tab === 'history' ? ' active' : ''}${(project.vehicleHistory?.confirmedFixes?.length ?? 0) > 0 ? ' chat-tab--alert' : ''}`} onClick={() => setTab('history')}>
            Vehicle History
            {(project.vehicleHistory?.jobTimeline?.length ?? 0) > 1 && (
              <span className="chat-tab-badge">{project.vehicleHistory.jobTimeline.length}</span>
            )}
          </button>
        )}
        {project.registration && (
          <button type="button" className={`chat-tab${tab === 'mot' ? ' active' : ''}`} onClick={() => setTab('mot')}>
            MOT History
            {project.motTests?.length > 0 && <span className="chat-tab-badge">{project.motTests.length}</span>}
          </button>
        )}
        <button type="button" className={`chat-tab${tab === 'quote' ? ' active' : ''}`} onClick={() => setTab('quote')}>Quote</button>
        <button type="button" className={`chat-tab${tab === 'report' ? ' active' : ''}`} onClick={() => setTab('report')}>Customer Report</button>
      </div>

      {tab === 'vehicle' && <div className="tab-pane"><VehicleInfo project={project} onUpdateVehicle={onUpdateVehicle} /></div>}
      {tab === 'specs' && <div className="tab-pane"><QuickReference project={project} token={token} /></div>}
      {tab === 'history' && <div className="tab-pane"><VehicleHistoryTab history={project.vehicleHistory} currentProjectId={project.id} /></div>}
      {tab === 'mot' && <div className="tab-pane"><MotTab project={project} token={token} /></div>}
      {tab === 'quote' && <div className="tab-pane"><QuoteTab project={project} token={token} /></div>}
      {tab === 'report' && <div className="tab-pane"><ReportTab project={project} token={token} /></div>}

      <div className="chat-messages" style={{ display: tab === 'diagnosis' ? 'flex' : 'none', flexDirection: 'column' }}>
        {!project.history?.length && !status && (
          <div className="chat-mode-prompt">
            <p className="chat-mode-prompt-label">What do you need help with?</p>
            <div className="chat-mode-cards">
              <button type="button" className={`chat-mode-card${chatMode === 'diagnose' ? ' active' : ''}`} onClick={() => selectMode('diagnose')}>
                <span className="chat-mode-card-title">Diagnose</span>
                <span className="chat-mode-card-desc">Investigate symptoms, fault codes, and intermittent faults</span>
              </button>
              <button type="button" className={`chat-mode-card${chatMode === 'howto' ? ' active' : ''}`} onClick={() => selectMode('howto')}>
                <span className="chat-mode-card-title">How To</span>
                <span className="chat-mode-card-desc">Step-by-step procedures for repairs and replacements</span>
              </button>
              <button type="button" className={`chat-mode-card${chatMode === 'workshop' ? ' active' : ''}`} onClick={() => selectMode('workshop')}>
                <span className="chat-mode-card-title">Workshop</span>
                <span className="chat-mode-card-desc">Create quotes, look up business stats, automate admin tasks</span>
              </button>
            </div>
            {chatMode === 'workshop' && (
              <div className="workshop-examples">
                <p className="workshop-examples-label">Try asking:</p>
                <div className="workshop-example-chips">
                  {[
                    'Create a full service quote',
                    'How many VWs have we worked on?',
                    'What are our most common repairs?',
                    'How many customers do we have?',
                    'Create a brake pad quote',
                    'How many jobs this year?',
                  ].map((ex) => (
                    <button key={ex} type="button" className="workshop-chip"
                      onClick={() => setQuestion(ex)}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {project.history?.map((entry) => {
          const isLatestAi = entry.role === 'ai' && entry.id === latestAiId;
          const composed = entry.role === 'user' && isComposed(entry.text);
          const time = new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          if (composed) {
            return (
              <div key={entry.id} className="chat-pill-row">
                <span className="chat-pill">Diagnostic answers submitted</span>
              </div>
            );
          }

          if (entry.role === 'user') {
            return (
              <div key={entry.id} className="chat-row chat-row--user">
                <div className="chat-bubble chat-bubble--user">
                  <p>{entry.text}</p>
                </div>
                <small className="chat-time">{time}</small>
              </div>
            );
          }

          return (
            <div key={entry.id} className="chat-row chat-row--ai">
              <div className="chat-bubble chat-bubble--ai">
                <AiResponse
                  text={entry.text}
                  historyId={entry.id}
                  projectId={project.id}
                  onConfirmSuggestion={onConfirmSuggestion}
                  onContinue={handleContinue}
                  isLatestAi={isLatestAi}
                  isBusy={isBusy}
                  confirmedTexts={confirmedTexts}
                  chatMode={chatMode}
                />
              </div>
              <small className="chat-time">{time}</small>
            </div>
          );
        })}

        {status && (
          <div className="chat-row chat-row--ai">
            <div className="chat-bubble chat-bubble--ai chat-bubble--thinking">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          </div>
        )}

        {error && <p className="error" style={{ padding: '0 4px' }}>{error}</p>}
        <div ref={messagesEndRef} />
      </div>

      {tab === 'diagnosis' && confirmedTexts.size > 0 && (
        <div className="confirmed-fixes-bar">
          <strong>Confirmed fixes on this vehicle ({confirmedTexts.size}):</strong>
          <ul>
            {project.confirmedFixes.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'diagnosis' && (
        <div className="chat-input-bar">
          <div className="chat-verbosity-bar">
            <span className="chat-verbosity-label">Mode:</span>
            <button type="button" className={`chat-verbosity-btn${chatMode === 'diagnose' ? ' active' : ''}`} onClick={() => selectMode('diagnose')}>Diagnose</button>
            <button type="button" className={`chat-verbosity-btn${chatMode === 'howto' ? ' active' : ''}`} onClick={() => selectMode('howto')}>How To</button>
            <button type="button" className={`chat-verbosity-btn${chatMode === 'workshop' ? ' active' : ''}`} onClick={() => selectMode('workshop')}>Workshop</button>
            {chatExpanded && (
              <button type="button" className="chat-collapse-btn" onClick={() => setChatExpanded(false)} title="Collapse (Esc)">✕</button>
            )}
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              id="question"
              name="question"
              rows={chatExpanded ? 4 : 2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setChatExpanded(true)}
              placeholder={chatMode === 'workshop'
                ? 'Ask a workshop question or request a task… (Enter to send)'
                : 'Ask for repair guidance... (Enter to send, Shift+Enter for new line)'}
              disabled={isBusy}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <VoiceInput onResult={(t) => setQuestion(t)} />
              <button type="submit" disabled={!question.trim() || isBusy}>Send</button>
            </div>
          </form>
        </div>
      )}

    </div>
    </>
  );
}

export default ProjectDetail;
