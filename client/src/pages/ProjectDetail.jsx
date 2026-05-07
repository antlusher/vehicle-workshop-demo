import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import VoiceInput from '../components/VoiceInput';
import * as api from '../services/api';

const OPEN_ENDED_START = /^(which|what|how|describe|list|name|where|when|who)\b/i;
const MULTI_OPTION = /,\s*or\b|\bor\s+(?:only|just)\b|\bor\s+(?:at|when|during|under|from|in|across|between)\s/i;
const COMPOUND = /\?\s*(if|when|please|and)\b/i;
const DIAGNOSTIC_VERB = /^(check|inspect|test|measure|verify|monitor|scan|listen|look|try|assess|examine|observe|ensure|confirm that|see if|determine|evaluate)\b/i;

function nodeText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (node.props?.children) return nodeText(node.props.children);
  return '';
}

function questionType(text) {
  if (!text.endsWith('?')) {
    if (DIAGNOSTIC_VERB.test(text)) return 'step';
    return 'fix';
  }
  if (OPEN_ENDED_START.test(text) || MULTI_OPTION.test(text) || COMPOUND.test(text)) return 'open';
  return 'yesno';
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

function ConfirmFixButton({ itemText, onConfirm, initialConfirmed }) {
  const [confirmed, setConfirmed] = useState(initialConfirmed || false);
  const handle = async () => {
    setConfirmed(true);
    try { await onConfirm(itemText); } catch { setConfirmed(false); }
  };
  if (confirmed) return <small className="suggestion-confirmed">✓ This fixed it</small>;
  return <button type="button" className="secondary suggestion-confirm-btn" onClick={handle}>This fixed it</button>;
}

function AiResponse({ text, historyId, projectId, onConfirmSuggestion, onContinue, isLatestAi, isBusy, confirmedTexts }) {
  const [hasAnswers, setHasAnswers] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const answersRef = useRef({});

  const handleAnswer = useCallback((key, value) => {
    answersRef.current[key] = value;
    setHasAnswers(Object.values(answersRef.current).some((v) => v !== null && v !== ''));
  }, []);

  const handleConfirm = useCallback(async (itemText) => {
    await onConfirmSuggestion(projectId, historyId, itemText);
  }, [projectId, historyId, onConfirmSuggestion]);

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

  const components = useMemo(() => ({
    li({ children }) {
      const itemText = nodeText(children).trim();
      const type = questionType(itemText);
      return (
        <li className={`ai-suggestion${type === 'open' ? ' ai-suggestion--open' : ''}`}>
          <span>{children}</span>
          {type === 'yesno' && <YesNoButtons onAnswered={(v) => handleAnswer(itemText, v)} />}
          {type === 'open' && <OpenAnswerInput itemText={itemText} onAnswer={handleAnswer} />}
          {type === 'fix' && (
            <ConfirmFixButton
              itemText={itemText}
              onConfirm={handleConfirm}
              initialConfirmed={confirmedTexts?.has(itemText)}
            />
          )}
        </li>
      );
    },
  }), [handleAnswer, handleConfirm, confirmedTexts]);

  return (
    <div className="ai-response">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
      {isLatestAi && hasAnswers && !submitted && (
        <button type="button" className="continue-btn" disabled={isBusy} onClick={handleContinue}>
          {isBusy ? 'Thinking...' : 'Continue diagnosis →'}
        </button>
      )}
      {submitted && !isBusy && (
        <small className="suggestion-confirmed">Answers sent — see next step below</small>
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

  useEffect(() => {
    if (specs) return;
    setLoading(true);
    setError('');
    api.fetchProjectSpecs(project.id, token)
      .then(setSpecs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [project.id]);

  if (loading) return <p className="specs-loading">Generating vehicle specs…</p>;
  if (error) return <p className="error" style={{ padding: 16 }}>{error}</p>;
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

  const handleSave = async (data) => {
    await onUpdateVehicle(project.id, data);
    setEditing(false);
  };

  const editBtn = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
      <button type="button" className="secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => setEditing(true)}>
        Edit vehicle details
      </button>
    </div>
  );

  if (editing) {
    return <VehicleEditForm project={project} onSave={handleSave} onCancel={() => setEditing(false)} />;
  }

  if (!vd) {
    return (
      <div>
        {editBtn}
        <p style={{ padding: '12px 16px', color: '#6b7280' }}>No extended vehicle data available. Use Edit to add details manually.</p>
      </div>
    );
  }

  const fmt = (val, unit) => (val != null ? `${val}${unit ? ' ' + unit : ''}` : null);

  return (
    <div>
      {editBtn}
      <div className="specs-grid">
      <div className="spec-card" style={{ gridColumn: '1 / -1' }}>
        <h4 className="spec-card-title">Identity</h4>
        <VehicleInfoRow label="Colour" value={vd.colour} />
        <VehicleInfoRow label="First registered" value={vd.dateFirstRegistered} />
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
        <VehicleInfoRow label="Valves / cyl" value={vd.engine?.valvesPerCylinder} />
      </div>

      <div className="spec-card">
        <h4 className="spec-card-title">Transmission</h4>
        <VehicleInfoRow label="Type" value={vd.transmission?.type} />
        <VehicleInfoRow label="Gears" value={vd.transmission?.gears} />
        <VehicleInfoRow label="Drive" value={vd.transmission?.driveType} />
        <VehicleInfoRow label="Driving axle" value={vd.transmission?.drivingAxle} />
      </div>

      <div className="spec-card">
        <h4 className="spec-card-title">Performance</h4>
        <VehicleInfoRow label="Power" value={vd.performance?.powerBhp != null ? `${vd.performance.powerBhp} bhp / ${vd.performance.powerKw} kW` : null} />
        <VehicleInfoRow label="Torque" value={vd.performance?.torqueNm != null ? `${vd.performance.torqueNm} Nm / ${vd.performance.torqueLbft} lb·ft` : null} />
        <VehicleInfoRow label="0–60 mph" value={fmt(vd.performance?.zeroToSixtyMph, 's')} />
        <VehicleInfoRow label="Top speed" value={fmt(vd.performance?.maxSpeedMph, 'mph')} />
      </div>

      <div className="spec-card">
        <h4 className="spec-card-title">Fuel Economy</h4>
        <VehicleInfoRow label="Combined" value={fmt(vd.economy?.combinedMpg, 'mpg')} />
        <VehicleInfoRow label="Urban" value={fmt(vd.economy?.urbanMpg, 'mpg')} />
        <VehicleInfoRow label="Extra-urban" value={fmt(vd.economy?.extraUrbanMpg, 'mpg')} />
        <VehicleInfoRow label="Combined (l/100km)" value={fmt(vd.economy?.combinedL100km, 'L/100km')} />
      </div>

      <div className="spec-card">
        <h4 className="spec-card-title">Emissions</h4>
        <VehicleInfoRow label="Euro status" value={vd.emissions?.euroStatus} />
        <VehicleInfoRow label="CO2" value={fmt(vd.emissions?.co2, 'g/km')} />
      </div>

      <div className="spec-card">
        <h4 className="spec-card-title">Body</h4>
        <VehicleInfoRow label="Style" value={vd.body?.style} />
        <VehicleInfoRow label="Shape" value={vd.body?.shape} />
        <VehicleInfoRow label="Cab type" value={vd.body?.cabType} />
        <VehicleInfoRow label="Wheelbase" value={vd.body?.wheelbaseType} />
        <VehicleInfoRow label="Doors" value={vd.body?.numberOfDoors} />
        <VehicleInfoRow label="Seats" value={vd.body?.numberOfSeats} />
        <VehicleInfoRow label="Payload volume" value={fmt(vd.body?.payloadVolumeLitres, 'L')} />
        <VehicleInfoRow label="Fuel tank" value={fmt(vd.body?.fuelTankLitres, 'L')} />
      </div>

      <div className="spec-card">
        <h4 className="spec-card-title">Weights</h4>
        <VehicleInfoRow label="Kerb" value={fmt(vd.weights?.kerbKg, 'kg')} />
        <VehicleInfoRow label="Gross" value={fmt(vd.weights?.grossKg, 'kg')} />
        <VehicleInfoRow label="Payload" value={fmt(vd.weights?.payloadKg, 'kg')} />
      </div>

      <div className="spec-card">
        <h4 className="spec-card-title">Dimensions</h4>
        <VehicleInfoRow label="Length" value={fmt(vd.dimensions?.lengthMm, 'mm')} />
        <VehicleInfoRow label="Width" value={fmt(vd.dimensions?.widthMm, 'mm')} />
        <VehicleInfoRow label="Height" value={fmt(vd.dimensions?.heightMm, 'mm')} />
        <VehicleInfoRow label="Wheelbase" value={fmt(vd.dimensions?.wheelbaseMm, 'mm')} />
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

function ProjectDetail({ project, onAsk, onConfirmSuggestion, onClearHistory, onUpdateVehicle, token }) {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('diagnosis');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const isBusy = !!status;

  const confirmedTexts = useMemo(
    () => new Set((project?.confirmedFixes || []).map((f) => f.text)),
    [project?.confirmedFixes]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [project?.history?.length, status]);

  const submitQuestion = useCallback(async (text) => {
    setError('');
    setStatus('Thinking...');
    try {
      await onAsk(project.id, text);
      setQuestion('');
      setStatus('');
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }, [onAsk, project]);

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

  if (!project) {
    return (
      <div className="chat-shell chat-shell--empty">
        <p>Select a project to begin the diagnostic session.</p>
      </div>
    );
  }

  const aiEntries = project.history?.filter((e) => e.role === 'ai') ?? [];
  const latestAiId = aiEntries[aiEntries.length - 1]?.id ?? null;
  const isComposed = (text) => text.startsWith('Diagnostic answers:');

  const vehicleSummary = [project.make, project.model, project.year, project.engineCode, project.fuelType]
    .filter(Boolean).join(' · ');

  return (
    <div className="chat-shell">

      <div className="chat-header">
        <div className="chat-header-info">
          <span className="chat-header-reg">{project.registration || project.vin || 'Project'}</span>
          {vehicleSummary && <span className="chat-header-meta">{vehicleSummary}</span>}
        </div>
        {tab === 'diagnosis' && project.history?.length > 0 && (
          <button type="button" className="secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => onClearHistory(project.id)}>
            Start over
          </button>
        )}
      </div>

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
      </div>

      {tab === 'vehicle' && <VehicleInfo project={project} onUpdateVehicle={onUpdateVehicle} />}
      {tab === 'specs' && <QuickReference project={project} token={token} />}
      {tab === 'history' && <VehicleHistoryTab history={project.vehicleHistory} currentProjectId={project.id} />}

      <div className="chat-messages" style={{ display: tab === 'diagnosis' ? 'flex' : 'none', flexDirection: 'column' }}>
        {!project.history?.length && !status && (
          <p className="chat-empty">Ask a question to begin the diagnostic session.</p>
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
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              id="question"
              name="question"
              rows="2"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask for repair guidance... (Enter to send, Shift+Enter for new line)"
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
  );
}

export default ProjectDetail;
