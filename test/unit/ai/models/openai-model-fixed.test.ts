/**
 * Fixed Test for OpenAIModel
 * Using comprehensive mocking strategy to avoid complex dependencies
 */

// Mock all external dependencies before importing
jest.mock('../../../../src/ai/models/model', () => ({
  BaseModel: class MockBaseModel {
    async generate(_input: any): Promise<any> {
      return { content: '', status: 'COMPLETED' };
    }
    protected id: string;
    protected name: string;
    protected description: string;
    protected capabilities: any;
    
    constructor(model: any) {
      this.id = model.id || 'mock-model';
      this.name = model.name || 'Mock Model';
      this.description = model.description || 'Mock model for testing';
      this.capabilities = model.capabilities || {};
    }
    
    getId() { return this.id; }
    getName() { return this.name; }
    getDescription() { return this.description; }
    getCapabilities() { return this.capabilities; }
  },
  ModelCapabilities: {
    TEXT_GENERATION: 'text_generation',
    TOOL_CALLING: 'tool_calling',
    STRUCTURED_OUTPUT: 'structured_output'
  }
}));

jest.mock('../../../../src/types/ai', () => ({
  ThinkingPattern: {
    Direct: 'direct',
    ChainOfThought: 'chain_of_thought',
    GraphOfThought: 'graph_of_thought'
  }
}));

jest.mock('../../../../src/config/manager', () => ({
  ConfigManager: {
    getInstance: jest.fn(() => ({
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'ai.openai.apiKey') return 'test-api-key';
        if (key === 'ai.openai.apiUrl') return 'https://api.openai.com/v1';
        return defaultValue;
      }),
      set: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined)
    }))
  }
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock fetch globally
global.fetch = jest.fn();

// Import the class under test
import { OpenAIModel } from '../../../../src/ai/models/openai-model';
import { ThinkingPattern, ModelOptions, AgentMessage } from '../../../../src/types/ai';

describe('OpenAIModel', () => {
  let model: OpenAIModel;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup fetch mock
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    
    // Create test model instance with proper ModelOptions
    const mockModelOptions = {
      id: 'gpt-4',
      name: 'GPT-4',
      description: 'OpenAI GPT-4 model',
      provider: 'openai',
      capabilities: {
        streaming: true,
        tools: true,
        structuredOutput: true,
        images: false
      }
    };
    
    model = new OpenAIModel(mockModelOptions, {
      apiKey: 'test-api-key',
      apiUrl: 'https://api.openai.com/v1'
    });
  });

  describe('constructor', () => {
    it('should initialize with provided options', () => {
      const mockModelDefinition: ModelOptions = {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'OpenAI GPT-3.5 Turbo model',
        provider: 'openai', // Added missing provider
        capabilities: {
          streaming: false,
          tools: false,
          structuredOutput: false,
          images: false
        }
      };
      
      const testModel = new OpenAIModel(mockModelDefinition, {
        apiKey: 'custom-key',
        apiUrl: 'https://custom.api.com/v1'
      });
      
      expect(testModel).toBeDefined();
      expect(testModel.getId()).toBe('gpt-3.5-turbo');
      expect(testModel.getName()).toBe('GPT-3.5 Turbo');
    });

    it('should fall back to config manager for API key', () => {
      const mockModelDefinition: ModelOptions = { id: 'gpt-4', name: 'GPT-4', provider: 'openai', description: 'OpenAI GPT-4 model', capabilities: { streaming: false, tools: false, structuredOutput: false, images: false } };
      const testModel = new OpenAIModel(mockModelDefinition);
      
      expect(testModel).toBeDefined();
    });

    it('should fall back to environment variable for API key', () => {
      process.env.OPENAI_API_KEY = 'env-api-key';
      
      const mockModelDefinition: ModelOptions = { id: 'gpt-4', name: 'GPT-4', provider: 'openai', capabilities: { streaming: false, tools: false, structuredOutput: false, images: false } };
      const testModel = new OpenAIModel(mockModelDefinition);
      
      expect(testModel).toBeDefined();
      
      delete process.env.OPENAI_API_KEY;
    });
  });

  describe('generate', () => {
    it('should generate a response successfully', async () => {
      // Mock successful API response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you today?'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18
          }
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      const result = await model.generate({ prompt: 'Hello' });
      
      expect(result.content).toBe('Hello! How can I help you today?');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });

    it('should include conversation history in the request', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response with history' } }],
          usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      const history: AgentMessage[] = [
        { id: '1', conversationId: 'conv1', role: 'user', content: 'Previous message', timestamp: new Date().toISOString() },
        { id: '2', conversationId: 'conv1', role: 'assistant', content: 'Previous response', timestamp: new Date().toISOString() }
      ];
      
      await model.generate({ prompt: 'Current message', messages: history });
      
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);
      
      expect(requestBody.messages).toHaveLength(4); // system + history + current
      expect(requestBody.messages[1]).toEqual({ role: 'user', content: 'Previous message' });
      expect(requestBody.messages[2]).toEqual({ role: 'assistant', content: 'Previous response' });
      expect(requestBody.messages[3]).toEqual({ role: 'user', content: 'Current message' });
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized')
      } as any);
      
      await expect(model.generate({ prompt: 'Hello' })).rejects.toThrow(
        'OpenAI API error: 401 Unauthorized'
      );
    });

    it('should handle missing content gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: {} }],
          usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      const result = await model.generate({ prompt: 'Hello' });
      expect(result.content).toBe('');
    });
  });

  describe('generateStructuredThinking', () => {
    it('should generate structured thinking with Graph of Thought pattern', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                steps: [
                  { content: 'Analyze the problem', type: 'analysis' },
                  { content: 'Break down components', type: 'decomposition' }
                ],
                summary: 'Structured analysis complete'
              })
            }
          }],
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 }
        })
      };
      
      mockFetch.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(mockResponse as any), 10)));
      
      const result = await model.generateStructuredThinking({ prompt: 'Analyze this problem', pattern: ThinkingPattern.GraphOfThought });
      
      expect(result.pattern).toBe(ThinkingPattern.GraphOfThought);
      expect(result.steps).toHaveLength(2);
      if (result.steps) {
        expect(result.steps[0].content).toBe('Analyze the problem');
      }
      expect(result.summary).toBe('Structured analysis complete');
      expect(result.timestamp).toBeDefined();
      expect(result.elapsedTimeMs).toBeGreaterThan(0);
    });

    it('should handle invalid JSON in structured thinking response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Invalid JSON response from API'
            }
          }]
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      const result = await model.generateStructuredThinking({ prompt: 'Test prompt' });
      
      expect(result.steps).toHaveLength(1);
      if (result.steps) {
        expect(result.steps[0].content).toBe('Invalid JSON response from API');
        expect(result.steps[0].type).toBe('thinking');
      }
      expect(result.summary).toContain('Invalid JSON response from API');
    });

    it('should handle API errors in structured thinking', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const result = await model.generateStructuredThinking({ prompt: 'Test prompt' });
      
      expect(result.pattern).toBe(ThinkingPattern.Direct); // default pattern
      expect(result.steps).toEqual([]);
      expect(result.summary).toBe('Error during thinking analysis');
      expect(result.error).toBe('Network error');
    });
  });

  describe('generateToolSelection', () => {
    it('should return empty tool calls when no tools available', async () => {
      const result = await model.generateToolSelection({ prompt: 'Test prompt', availableTools: [] });
      
      expect(result.toolCalls).toEqual([]);
    });

    it('should select appropriate tools based on prompt', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'I will use the calculator tool',
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: JSON.stringify({ operation: 'add', a: 5, b: 3 })
                }
              }]
            }
          }]
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      const availableTools = [{
        name: 'calculator',
        description: 'Perform mathematical calculations',
        inputSchema: {} as any, // Mock ZodType
        execute: jest.fn(),
        parameters: [
          { name: 'operation', type: 'string', description: 'The operation to perform', required: true },
          { name: 'a', type: 'number', description: 'First number', required: true },
          { name: 'b', type: 'number', description: 'Second number', required: true }
        ]
      }];
      
      const result = await model.generateToolSelection({ prompt: 'Add 5 and 3', availableTools: availableTools as any });
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('calculator');
      expect(result.toolCalls[0].args).toEqual({ operation: 'add', a: 5, b: 3 });
      expect(result.reasoning).toBe('I will use the calculator tool');
    });

    it('should handle malformed tool arguments gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: 'invalid json'
                }
              }]
            }
          }]
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      const availableTools = [{
        name: 'calculator',
        description: 'Perform calculations',
        inputSchema: {
          parse: jest.fn(),
          safeParse: jest.fn(),
          parseAsync: jest.fn(),
          safeParseAsync: jest.fn(),
          // Mock other ZodType methods as needed
        } as any, // Cast to any to satisfy the Tool interface for now
        execute: jest.fn(),
        parameters: []
      }];
      
      const result = await model.generateToolSelection({ prompt: 'Test', availableTools: availableTools as any });
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('calculator');
      expect(result.toolCalls[0].args).toEqual({});
    });
  });

  describe('generateResponseWithToolResults', () => {
    it('should incorporate tool results into response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Based on the calculator result, the answer is 8.'
            }
          }],
          usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 }
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      const toolResults = [{
        toolName: 'calculator',
        args: { operation: 'add', a: 5, b: 3 },
        result: 8,
        success: true,
        timestamp: new Date().toISOString(),
      }];
      
      const result = await model.generateResponseWithToolResults(
        'What is 5 + 3?',
        [],
        toolResults,
        {}
      );
      
      expect(result).toBe('Based on the calculator result, the answer is 8.');
      
      // Verify tool results were included in the request
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);
      const assistantMessage = requestBody.messages.find((msg: any) => 
        msg.role === 'assistant' && msg.content.includes('Tool: calculator')
      );
      
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage.content).toContain('Tool: calculator');
      expect(assistantMessage.content).toContain('Result: 8');
      expect(assistantMessage.content).toContain('Success: true');
    });

    it('should handle tool errors in response generation', async () => {
      const toolResults = [{
        toolName: 'calculator',
        args: { operation: 'divide', a: 5, b: 0 },
        result: null,
        success: false,
        error: 'Division by zero',
        timestamp: new Date().toISOString(),
      }];
      
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'I encountered an error with the calculation.'
            }
          }]
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      const result = await model.generateResponseWithToolResults(
        'What is 5 divided by 0?',
        [],
        toolResults,
        {}
      );
      
      expect(result).toBe('I encountered an error with the calculation.');
      
      // Verify error was included in the request
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);
      const assistantMessage = requestBody.messages.find((msg: any) => 
        msg.role === 'assistant'
      );
      
      expect(assistantMessage.content).toContain('Error: Division by zero');
    });
  });

  describe('private methods behavior', () => {
    it('should handle various thinking patterns', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: '{}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      // Test Chain of Thought pattern
      await model.generateStructuredThinking({ prompt: 'Test prompt', pattern: ThinkingPattern.ChainOfThought });
      
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);
      const systemMessage = requestBody.messages[0].content;
      
      expect(systemMessage).toContain('Chain-of-Thought');
      expect(systemMessage).toContain('step-by-step');
    });

    it('should include proper request parameters', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
      
      mockFetch.mockResolvedValue(mockResponse as any);
      
      await model.generate({
        prompt: 'Test',
        messages: [],
        temperature: 0.5,
        maxTokens: 500,
        stopSequences: ['STOP']
      });
      
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);
      
      expect(requestBody.temperature).toBe(0.5);
      expect(requestBody.max_tokens).toBe(500);
      expect(requestBody.stop).toEqual(['STOP']);
    });
  });
});
