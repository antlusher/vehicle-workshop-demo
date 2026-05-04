import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import VoiceInput from '../components/VoiceInput';

function ProjectDetail({ project, onAsk, onConfirm }) {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [confirmedIds, setConfirmedIds] = useState({});

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

  const handleConfirm = async (historyId) => {
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
          <button type="submit" disabled={!question.trim() || !!status}>Ask AI</button>
          <VoiceInput onResult={(t) => setQuestion(t)} />
        </div>
        {status && <p>{status}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      <div style={{ marginTop: 18 }}>
        <h3>Conversation history</h3>
        {project.history?.length ? (
          project.history.map((entry) => {
            const isConfirmed = entry.confirmed || confirmedIds[entry.id];
            return (
              <div key={entry.id} className="history-entry" style={{ borderLeft: isConfirmed ? '3px solid #16a34a' : undefined }}>
                <strong>{entry.role === 'user' ? 'You' : 'AI'}</strong>
                {entry.role === 'ai' ? (
                  <div className="ai-response"><ReactMarkdown>{entry.text}</ReactMarkdown></div>
                ) : (
                  <p>{entry.text}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <small>{new Date(entry.createdAt).toLocaleString()}</small>
                  {entry.role === 'ai' && (
                    isConfirmed ? (
                      <small style={{ color: '#16a34a' }}>Confirmed correct</small>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        style={{ fontSize: '0.75rem', padding: '2px 10px' }}
                        onClick={() => handleConfirm(entry.id)}
                      >
                        Confirm correct
                      </button>
                    )
                  )}
                </div>
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
