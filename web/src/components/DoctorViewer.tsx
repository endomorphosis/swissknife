import React from 'react';

const DoctorViewer: React.FC = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.header}>SwissKnife Doctor</h2>
      <p style={styles.message}>This is where system health checks and diagnostics will be displayed.</p>
      <p style={styles.message}>Feature coming soon!</p>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f0f8ff',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
  header: {
    color: '#2196f3',
    marginBottom: '15px',
  },
  message: {
    color: '#555',
    fontSize: '1.1em',
  },
};

export default DoctorViewer;
