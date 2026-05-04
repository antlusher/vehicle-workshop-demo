import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import VoiceInput from '../components/VoiceInput';

const OPEN_ENDED_START = /^(which|what|how|describe|list|name|where|when|who)\b/i;
const MULTI_OPTION = /,\s*or\b/i;

function nodeText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (node.props?.children) return nodeText(node.props.children);
  return '';
}

function questionType(text) {
  if (!text.endsWith('?')) return 'fix';
  if (OPEN_ENDED_START.test(text) || MULTI_OPTION.test(text)) return 'open';
  return 'yesno';
}

function AiResponse({ text, historyId, projectId, onConfirmSuggestion, onContinue, isLatestAi, isBusy }) {
  const [confirmed, setConfirmed] = useState({});
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const handleAnswer = useCallback((key, answer) => {
    setAnswers((prev) => ({ ...prev, [key]: prev[key] === answer ? null : answer }));
  }, []);

  const handleConfirm = useCallback(async (suggestionText) => {
    const key = suggestionText.trim();
    setConfirmed((prev) => ({ ...prev, [key]: true }));
    try {
      await onConfirmSuggestion(projectId, historyId, key);
    } catch {
      setConfirmed((prev) => ({ ...prev, [key]: false }));
    }
  }, [projectId, historyId, onConfirmSuggestion]);

  const handleContinue = useCallback(async () => {
    const answered = Object.entries(answers).filter(([, v]) => v !== null && v !== '');
    if (!answered.length) return;
    setSubmitted(true);
    const lines = answered.map(([q, a]) => {
      if (a === 'yes' || a === 'no') return `- ${q} → ${a === 'yes' ? 'Yes' : 'No'}`;
      return `- ${q} → ${a}`;
    });
    const message = `Diagnostic answers:\n${lines.join('\n')}\n\nBased on these answers, what is the next diagnostic step?`;
    await onContinue(message);
  }, [answers, onContinue]);

  const hasAnswers = Object.values(answers).some((v) => v !== null && v !== '');

  const components = {
    li({ children }) {
      const itemText = nodeText(children).trim();
      const type = questionType(itemText);
      const answer = answers[itemText];
      const isConfirmed = confirmed[itemText];

      return (
        <li className={`ai-suggestion${type === 'open' ? ' ai-suggestion--open' : ''}`}>
          <span>{children}</span>
          {type === 'yesno' && (
            <div className="yn-buttons">
              <button
                type="button"
                className={`yn-btn yn-yes${answer === 'yes' ? ' active' : ''}`}
                onClick={() => handleAnswer(itemText, 'yes')}
              >
                Yes
              </button>
              <button
                type="button"
                className={`yn-btn yn-no${answer === 'no' ? ' active' : ''}`}
                onClick={() => handleAnswer(itemText, 'no')}
              >
                No
              </button>
            </div>
          )}
          {type === 'open' && (
            <input
              className="open-answer-input"
              type="text"
              placeholder="Type your answer..."
              value={answer || ''}
              onChange={(e) => handleAnswer(itemText, e.target.value || null)}
            />
          )}
          {type === 'fix' && (
            isConfirmed ? (
              <small className="suggestion-confirmed">✓ Confirmed fix</small>
            ) : (
              <button
                type="button"
                className="secondary suggestion-confirm-btn"
                onClick={() => handleConfirm(itemText)}
              >
                Confirm fix
              </button>
            )
          )}
        </li>
      );
    },
  };

  return (
    <div className="ai-response">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
      {isLatestAi && hasAnswers && !submitted && (
        <button
          type="button"
          className="continue-btn"
          disabled={isBusy}
          onClick={handleContinue}
        >
          {isBusy ? 'Thinking...' : 'Continue diagnosis →'}
        </button>
      )}
      {submitted && !isBusy && (
        <small className="suggestion-confirmed">Answers sent — see next step below</small>
      )}
    </div>
  );
}

function ProjectDetail({ project, onAsk, onConfirm, onConfirmSuggestion, onClearHistory }) {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [confirmedIds, setConfirmedIds] = useState({});

  const isBusy = !!status;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('Thinking...');
    try {
      await onAsk(project.id, question.trim());
      setQuestion('');
      setStatus('');
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  };

  const handleContinue = useCallback(async (composedMessage) => {
    setError('');
    setStatus('Thinking...');
    try {
      await onAsk(project.id, composedMessage);
      setStatus('');
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }, [onAsk, project]);

  const handleConfirmEntry = async (historyId) => {
    try {
      await onConfirm(historyId);
      setConfirmedIds((prev) => ({ ...prev, [historyId]: true }));
    } catch (err) {
      console.error('Failed to confirm response:', err.message);
    }
  };

  if (!project) {
    return (
      <div className="card">
        <h2 className="section-title">Project Detail</h2>
        <p>Select a project to load vehicle data and ask for repair guidance.</p>
      </div>
    );
  }

  const aiEntries = project.history?.filter((e) => e.role === 'ai') ?? [];
  const latestAiId = aiEntries[aiEntries.length - 1]?.id ?? null;

  const isComposedAnswer = (text) => text.startsWith('Diagnostic answers:');

  return (
    <div className="card">
      <h2 className="section-title">{project.registration || project.vin || 'Project'}</h2>
      <div style={{ marginBottom: 18 }}>
        <strong>Make/Model</strong>
        <p>{project.make || 'Unknown'} {project.model || ''}</p>
        <strong>Year</strong>
        <p>{project.year || 'Unknown'}</p>
        <strong>Engine</strong>
        <p>{project.engineCode || 'Unknown'}</p>
        <strong>Fuel</strong>
        <p>{project.fuelType || 'Unknown'}</p>
        <strong>Data source</strong>
        <p>{project.source || 'Unknown'}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label htmlFor="question">Ask for repair guidance</label>
        <textarea
          id="question"
          name="question"
          rows="4"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. miss fire on cylinder 3"
          required
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" disabled={!question.trim() || isBusy}>Ask AI</button>
          <VoiceInput onResult={(t) => setQuestion(t)} />
        </div>
        {status && <p>{status}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Conversation history</h3>
          {project.history?.length > 0 && (
            <button
              type="button"
              className="secondary"
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
              onClick={() => onClearHistory(project.id)}
            >
              Start over
            </button>
          )}
        </div>
        {project.history?.length ? (
          project.history.map((entry) => {
            const isLatestAi = entry.role === 'ai' && entry.id === latestAiId;
            const composed = entry.role === 'user' && isComposedAnswer(entry.text);
            return (
              <div key={entry.id} className={`history-entry${composed ? ' history-entry--composed' : ''}`}>
                <strong>{entry.role === 'user' ? 'You' : 'AI'}</strong>
                {entry.role === 'ai' ? (
                  <AiResponse
                    text={entry.text}
                    historyId={entry.id}
                    projectId={project.id}
                    onConfirmSuggestion={onConfirmSuggestion}
                    onContinue={handleContinue}
                    isLatestAi={isLatestAi}
                    isBusy={isBusy}
                  />
                ) : composed ? (
                  <p className="composed-answers">{entry.text}</p>
                ) : (
                  <p>{entry.text}</p>
                )}
                <small style={{ marginTop: 4, display: 'block', color: '#9ca3af' }}>
                  {new Date(entry.createdAt).toLocaleString()}
                </small>
              </div>
            );
          })
        ) : (
          <p>No history yet for this project.</p>
        )}
      </div>
    </div>
  );
}

export default ProjectDetail;
