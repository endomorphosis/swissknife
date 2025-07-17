import React, { useEffect, useState } from 'react';
import { getErrorLogs, clearErrorLogs } from '../utils/error-logger';
import { ErrorLogEntry } from '../types/error-types';

const ErrorLogViewer: React.FC = () => {
  const [logs, setLogs] = React.useState<ErrorLogEntry[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      const fetchedLogs = await getErrorLogs();
      setLogs(fetchedLogs);
    };
    fetchLogs();
  }, []);

  const handleClearLogs = async () => {
    await clearErrorLogs();
    setLogs([]);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Error Logs</h2>
      <button onClick={handleClearLogs} style={styles.clearButton}>Clear All Logs</button>
      <div style={styles.logList}>
        {logs.length === 0 ? (
          <p style={styles.noLogs}>No error logs found.</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={styles.logItem}>
              <p style={styles.logTimestamp}>{new Date(log.timestamp).toLocaleString()}</p>
              <p style={styles.logMessage}><strong>Level:</strong> {log.level.toUpperCase()}</p>
              <p style={styles.logMessage}><strong>Message:</strong> {log.message}</p>
              {log.stack && (
                <pre style={styles.logStack}><code>{log.stack}</code></pre>
              )}
              {log.context && (
                <pre style={styles.logContext}><code>{JSON.stringify(log.context, null, 2)}</code></pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f4f4f4',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    maxHeight: 'calc(100vh - 100px)',
    overflowY: 'auto',
  },
  header: {
    color: '#d32f2f',
    marginBottom: '15px',
    textAlign: 'center',
  },
  clearButton: {
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    padding: '10px 15px',
    borderRadius: '5px',
    cursor: 'pointer',
    marginBottom: '20px',
    display: 'block',
    margin: '0 auto 20px auto',
  },
  logList: {
    borderTop: '1px solid #eee',
    paddingTop: '10px',
  },
  logItem: {
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '5px',
    padding: '15px',
    marginBottom: '10px',
    wordBreak: 'break-word',
  },
  logTimestamp: {
    fontSize: '0.8em',
    color: '#777',
    marginBottom: '5px',
  },
  logMessage: {
    margin: '0 0 5px 0',
    color: '#333',
  },
  logStack: {
    backgroundColor: '#eee',
    padding: '10px',
    borderRadius: '4px',
    overflowX: 'auto',
    fontSize: '0.9em',
    color: '#555',
  },
  logContext: {
    backgroundColor: '#e8f5e8',
    padding: '10px',
    borderRadius: '4px',
    overflowX: 'auto',
    fontSize: '0.9em',
    color: '#333',
    marginTop: '10px',
  },
  noLogs: {
    textAlign: 'center',
    color: '#777',
    fontStyle: 'italic',
  },
};

export default ErrorLogViewer;
