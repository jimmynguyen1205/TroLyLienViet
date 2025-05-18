import { OpenAI } from '@langchain/openai';
import { AGENTS } from '../../config/agents.js';
import memoryService from './memory.js';

class AgentService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // Get agent configuration
  getAgentConfig(agentId) {
    return AGENTS[agentId];
  }

  // Process message with specific agent
  async processMessage(userId, agentId, message) {
    try {
      const agentConfig = this.getAgentConfig(agentId);
      if (!agentConfig) {
        throw new Error('Invalid agent ID');
      }

      // Get conversation history
      const history = await memoryService.getConversationContext(userId, agentId);

      // Prepare messages for GPT
      const messages = [
        {
          role: 'system',
          content: agentConfig.systemPrompt
        },
        ...history,
        {
          role: 'user',
          content: message
        }
      ];

      // Get response from GPT
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.7,
        max_tokens: 500
      });

      const aiResponse = response.choices[0].message.content;

      // Save messages to history
      await memoryService.addMessage(userId, agentId, 'user', message);
      await memoryService.addMessage(userId, agentId, 'assistant', aiResponse);

      return {
        agent: agentConfig.name,
        response: aiResponse
      };
    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  // Route message to appropriate agent
  async routeMessage(userId, message) {
    try {
      // First, send to main agent for routing
      const mainResponse = await this.processMessage(userId, 'MAIN', message);

      // Check if main agent suggests routing to another agent
      const suggestedAgent = this.extractSuggestedAgent(mainResponse.response);
      
      if (suggestedAgent && suggestedAgent !== 'MAIN') {
        // Process with suggested agent
        return await this.processMessage(userId, suggestedAgent, message);
      }

      // If no specific agent suggested, return main agent's response
      return mainResponse;
    } catch (error) {
      console.error('Error routing message:', error);
      throw error;
    }
  }

  // Extract suggested agent from main agent's response
  extractSuggestedAgent(response) {
    // Simple keyword matching - can be improved with more sophisticated parsing
    const agentKeywords = {
      'CONTRACT': ['hợp đồng', 'điều khoản', 'ký kết', 'phí bảo hiểm'],
      'TRAINING': ['đào tạo', 'nghiệp vụ', 'chính sách', 'tài liệu'],
      'CLAIM': ['bồi thường', 'khiếu nại', 'tài liệu', 'trạng thái'],
      'RECRUITMENT': ['tuyển dụng', 'nhân sự', 'ứng tuyển', 'phát triển']
    };

    for (const [agent, keywords] of Object.entries(agentKeywords)) {
      if (keywords.some(keyword => response.toLowerCase().includes(keyword))) {
        return agent;
      }
    }

    return null;
  }
}

export default new AgentService(); 