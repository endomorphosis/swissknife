import React, { useEffect, useState } from 'react';
import { BrowserAIAdapter, Conversation } from '../adapters/browser-ai-adapter';

interface ConversationHistoryViewerProps {
  aiAdapter: BrowserAIAdapter;
  onConversationLoad: (conversation: Conversation) => void;
}

const ConversationHistoryViewer: React.FC<ConversationHistoryViewerProps> = ({
  aiAdapter,
  onConversationLoad,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setLoading(true);
        const fetchedConversations = await aiAdapter.listConversations();
        setConversations(fetchedConversations);
      } catch (err) {
        setError('Failed to load conversations.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchConversations();
  }, [aiAdapter]);

  const handleLoadConversation = async (id: string) => {
    try {
      const conversation = await aiAdapter.loadConversation(id);
      if (conversation) {
        onConversationLoad(conversation);
      } else {
        setError('Conversation not found.');
      }
    } catch (err) {
      setError('Failed to load conversation.');
      console.error(err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await aiAdapter.deleteConversation(id);
      setConversations(conversations.filter((conv) => conv.id !== id));
    } catch (err) {
      setError('Failed to delete conversation.');
      console.error(err);
    }
  };

  if (loading) {
    return <div style={styles.message}>Loading conversations...</div>;
  }

  if (error) {
    return <div style={styles.error}>Error: {error}</div>;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Conversation History</h2>
      {conversations.length === 0 ? (
        <div style={styles.message}>No conversations found. Start a new chat!</div>
      ) : (
        <ul style={styles.list}>
          {conversations.map((conv) => (
            <li key={conv.id} style={styles.listItem}>
              <div style={styles.convInfo}>
                <span style={styles.convTitle}>{conv.title || 'Untitled Conversation'}</span>
                <span style={styles.convDate}>Updated: {new Date(conv.updatedAt).toLocaleString()}</span>
              </div>
              <div style={styles.actions}>
                <button onClick={() => handleLoadConversation(conv.id)} style={styles.loadButton}>Load</button>
                <button onClick={() => handleDeleteConversation(conv.id)} style={styles.deleteButton}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    maxHeight: 'calc(100vh - 100px)',
    overflowY: 'auto',
  },
  header: {
    textAlign: 'center',
    color: '#333',
    marginBottom: '20px',
  },
  message: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
  },
  error: {
    textAlign: 'center',
    color: '#d32f2f',
    fontWeight: 'bold',
  },
  list: {
    listStyle: 'none',
    padding: 0,
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '5px',
    padding: '10px 15px',
    marginBottom: '10px',
  },
  convInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  convTitle: {
    fontWeight: 'bold',
    color: '#555',
  },
  convDate: {
    fontSize: '0.8em',
    color: '#888',
  },
  actions: {
    display: 'flex',
    gap: '10px',
  },
  loadButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  deleteButton: {
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};

export default ConversationHistoryViewer;
