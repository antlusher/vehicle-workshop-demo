import { useState, useCallback, useEffect, useRef } from 'react';
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
              <button type="button" className={`yn-btn yn-yes${answer === 'yes' ? ' active' : ''}`} onClick={() => handleAnswer(itemText, 'yes')}>Yes</button>
              <button type="button" className={`yn-btn yn-no${answer === 'no' ? ' active' : ''}`} onClick={() => handleAnswer(itemText, 'no')}>No</button>
            </div>
          )}
          {type === 'open' && <OpenAnswerInput itemText={itemText} onAnswer={handleAnswer} />}
          {type === 'fix' && (
            isConfirmed
              ? <small className="suggestion-confirmed">✓ Confirmed fix</small>
              : <button type="button" className="secondary suggestion-confirm-btn" onClick={() => handleConfirm(itemText)}>Confirm fix</button>
          )}
        </li>
      );
    },
  };

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

function ProjectDetail({ project, onAsk, onConfirm, onConfirmSuggestion, onClearHistory }) {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const isBusy = !!status;

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
        {project.history?.length > 0 && (
          <button type="button" className="secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => onClearHistory(project.id)}>
            Start over
          </button>
        )}
      </div>

      <div className="chat-messages">
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
            placeholder="Ask for repair guidance… (Enter to send, Shift+Enter for new line)"
            disabled={isBusy}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <VoiceInput onResult={(t) => setQuestion(t)} />
            <button type="submit" disabled={!question.trim() || isBusy}>Send</button>
          </div>
        </form>
      </div>

    </div>
  );
}

export default ProjectDetail;
