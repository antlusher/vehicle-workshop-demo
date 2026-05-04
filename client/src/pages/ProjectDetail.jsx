import { useState } from 'react';
import VoiceInput from '../components/VoiceInput';

function ProjectDetail({ project, onAsk }) {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('Asking AI...');

    try {
      const result = await onAsk(project.id, question.trim());
      setAnswer(result);
      setQuestion('');
      setStatus('');
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  };

  const handleVoiceResult = (transcript) => {
    setQuestion(transcript);
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
          <button type="submit" disabled={!question.trim()}>Ask AI</button>
          <VoiceInput onResult={handleVoiceResult} />
        </div>
        {status && <p>{status}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      {answer && (
        <div className="history-entry" style={{ marginTop: 18 }}>
          <strong>AI Recommendation</strong>
          <p>{answer}</p>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <h3>Conversation history</h3>
        {project.history?.length ? (
          project.history.map((entry) => (
            <div key={entry.id} className="history-entry">
              <strong>{entry.role === 'user' ? 'You' : 'AI'}</strong>
              <p>{entry.text}</p>
              <small>{new Date(entry.createdAt).toLocaleString()}</small>
            </div>
          ))
        ) : (
          <p>No history yet for this project.</p>
        )}
      </div>
    </div>
  );
}

export default ProjectDetail;
